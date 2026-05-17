import { SentinelMemory } from "../memory/db.js";
import type { NewFinding } from "../memory/db.js";
import {
  findFunctionDefinitions,
  findNamedImports,
  getLineNumber,
  listSourceFiles,
  relativeFromSpecifier,
} from "./utils.js";
import { runBobReasoning } from "./bob-reasoning.js";
import { PRISM_PROMPT } from "../bob/prompts/prism.prompt.js";

export interface PrismResult {
  findings: NewFinding[];
  leaks: number;
  bobReasoning?: string;
}

export interface PrismOptions {
  projectRoot?: string;
  scanId: number;
  onlyFiles?: string[];
}

const SENSITIVE = [
  "password",
  "passwd",
  "pwd",
  "secret",
  "token",
  "apiKey",
  "api_key",
  "credential",
  "private_key",
  "ssn",
  "credit_card",
];

const UNSAFE_SINKS = [
  "console.log",
  "console.error",
  "logger",
  "log",
  "analytics",
  "sendAnalytics",
  "res.json",
  "res.send",
  "localStorage",
  "fetch",
];

export async function runPrism(options: PrismOptions): Promise<PrismResult> {
  const projectRoot = options.projectRoot ?? process.cwd();
  const files = filterFiles(await listSourceFiles(projectRoot), options.onlyFiles);
  const functions = files.flatMap(findFunctionDefinitions);
  const findings: NewFinding[] = [];

  for (const file of files) {
    findings.push(...findHardcodedSecrets(file.relativePath, file.content));
    const imports = findNamedImports(file);

    for (const sensitive of SENSITIVE) {
      if (!containsWord(file.content, sensitive)) continue;

      findings.push(...findDirectUnsafeFlows(file.relativePath, file.content, sensitive));
      findings.push(
        ...findImportedFunctionFlows(
          file.relativePath,
          file.content,
          sensitive,
          imports,
          files,
          functions,
        ),
      );
    }
  }

  const uniqueFindings = dedupeFindings(findings);
  const bobReview = await runBobReasoning(
    projectRoot,
    PRISM_PROMPT,
    uniqueFindings.map((finding) => JSON.stringify(finding)).join("\n"),
  );
  const memory = new SentinelMemory(projectRoot);
  try {
    memory.saveFindings(options.scanId, uniqueFindings);
  } finally {
    memory.close();
  }

  return {
    findings: uniqueFindings,
    leaks: uniqueFindings.length,
    bobReasoning: bobReview?.output,
  };
}

function filterFiles(
  files: Awaited<ReturnType<typeof listSourceFiles>>,
  onlyFiles?: string[],
): Awaited<ReturnType<typeof listSourceFiles>> {
  if (!onlyFiles?.length) return files;
  const wanted = new Set(onlyFiles.map((file) => file.replaceAll("\\", "/")));
  return files.filter((file) => wanted.has(file.relativePath));
}

function findHardcodedSecrets(filePath: string, content: string): NewFinding[] {
  const findings: NewFinding[] = [];
  const secretPattern =
    /\b(password|passwd|pwd|secret|token|apiKey|api_key|credential|private_key)\b\s*[:=]\s*["'][^"']{6,}["']/gi;
  let match: RegExpExecArray | null;

  while ((match = secretPattern.exec(content)) !== null) {
    findings.push({
      agent: "prism",
      severity: "HIGH",
      category: "hardcoded_secret",
      filePath,
      lineNumber: getLineNumber(content, match.index),
      description: `Hardcoded sensitive value "${match[1]}" found in source.`,
      fixDescription: "Move secret into environment variable or local secret store.",
    });
  }

  return findings;
}

function findDirectUnsafeFlows(
  filePath: string,
  content: string,
  sensitive: string,
): NewFinding[] {
  return content
    .split(/\r?\n/)
    .flatMap((line, index): NewFinding[] => {
      if (!containsWord(line, sensitive)) return [];
      const sink = UNSAFE_SINKS.find((candidate) => line.includes(candidate));
      if (!sink) return [];

      return [
        {
          agent: "prism",
          severity: "CRITICAL",
          category: "security_leak",
          filePath,
          lineNumber: index + 1,
          description: `Sensitive value "${sensitive}" flows into unsafe sink "${sink}".`,
          fixDescription: "Remove sensitive value from logs, analytics, responses, or browser storage.",
        },
      ];
    });
}

function findImportedFunctionFlows(
  filePath: string,
  content: string,
  sensitive: string,
  imports: Map<string, string>,
  files: Awaited<ReturnType<typeof listSourceFiles>>,
  functions: ReturnType<typeof findFunctionDefinitions>,
): NewFinding[] {
  const findings: NewFinding[] = [];

  for (const [fnName, specifier] of imports.entries()) {
    const callPattern = new RegExp(`\\b${escapeRegex(fnName)}\\s*\\(([^)]*)\\)`, "g");
    let callMatch: RegExpExecArray | null;

    while ((callMatch = callPattern.exec(content)) !== null) {
      const args = (callMatch[1] ?? "").split(",").map((arg) => arg.trim());
      const sensitiveArgIndex = args.findIndex((arg) => containsWord(arg, sensitive));
      if (sensitiveArgIndex < 0) continue;

      const importedFilePath = relativeFromSpecifier(filePath, specifier, files);
      const target = functions.find(
        (definition) =>
          definition.name === fnName && definition.filePath === importedFilePath,
      );
      if (!target) continue;

      const param = target.params[sensitiveArgIndex];
      if (!param) continue;

      const sink = UNSAFE_SINKS.find(
        (candidate) =>
          target.body.includes(candidate) && containsWord(target.body, param),
      );
      if (!sink) continue;

      findings.push({
        agent: "prism",
        severity: "CRITICAL",
        category: "security_leak",
        filePath,
        lineNumber: getLineNumber(content, callMatch.index),
        description: `Sensitive value "${sensitive}" passes into "${fnName}" and reaches unsafe sink "${sink}" in ${target.filePath}.`,
        fixDescription: "Stop passing sensitive values to logging/analytics functions.",
      });
    }
  }

  return findings;
}

function dedupeFindings(findings: NewFinding[]): NewFinding[] {
  const seen = new Set<string>();
  const result: NewFinding[] = [];

  for (const finding of findings) {
    const key = [
      finding.agent,
      finding.category,
      finding.filePath,
      finding.lineNumber,
      finding.description,
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(finding);
  }

  return result;
}

function containsWord(value: string, word: string): boolean {
  return new RegExp(`\\b${escapeRegex(word)}\\b`, "i").test(value);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
