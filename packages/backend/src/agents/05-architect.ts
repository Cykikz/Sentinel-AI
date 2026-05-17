import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { SentinelMemory } from "../memory/db.js";
import type { NewFinding } from "../memory/db.js";
import { findNamedImports, listSourceFiles } from "./utils.js";
import { runBobReasoning } from "./bob-reasoning.js";
import { ARCHITECT_PROMPT } from "../bob/prompts/architect.prompt.js";

export interface ArchitectResult {
  findings: NewFinding[];
  rulesChecked: number;
  bobReasoning?: string;
}

export interface ArchitectOptions {
  projectRoot?: string;
  scanId: number;
  onlyFiles?: string[];
}

interface RulesFile {
  rules?: string[];
}

export async function runArchitect(
  options: ArchitectOptions,
): Promise<ArchitectResult> {
  const projectRoot = options.projectRoot ?? process.cwd();
  const rules = readRules(projectRoot);
  if (rules.length === 0) return { findings: [], rulesChecked: 0 };

  const files = filterFiles(await listSourceFiles(projectRoot), options.onlyFiles);
  const findings: NewFinding[] = [];

  for (const file of files) {
    const imports = [...findNamedImports(file).values()];

    for (const rule of rules) {
      const violation = evaluateRule(rule, file.relativePath, file.content, imports);
      if (!violation) continue;

      findings.push({
        agent: "architect",
        severity: "HIGH",
        category: "architecture_violation",
        filePath: file.relativePath,
        lineNumber: violation.lineNumber,
        description: `Rule violated: "${rule}". ${violation.reason}`,
        fixDescription: violation.fix,
      });
    }
  }

  const memory = new SentinelMemory(projectRoot);
  try {
    memory.saveFindings(options.scanId, findings);
  } finally {
    memory.close();
  }

  const bobReview = await runBobReasoning(
    projectRoot,
    ARCHITECT_PROMPT,
    findings.map((finding) => JSON.stringify(finding)).join("\n"),
  );

  return { findings, rulesChecked: rules.length, bobReasoning: bobReview?.output };
}

function filterFiles(
  files: Awaited<ReturnType<typeof listSourceFiles>>,
  onlyFiles?: string[],
): Awaited<ReturnType<typeof listSourceFiles>> {
  if (!onlyFiles?.length) return files;
  const wanted = new Set(onlyFiles.map((file) => file.replaceAll("\\", "/")));
  return files.filter((file) => wanted.has(file.relativePath));
}

function readRules(projectRoot: string): string[] {
  const rulesPath = path.join(projectRoot, ".sentinel", "rules.json");
  if (!existsSync(rulesPath)) return [];

  const parsed = JSON.parse(readFileSync(rulesPath, "utf8")) as RulesFile;
  return parsed.rules?.filter(Boolean) ?? [];
}

function evaluateRule(
  rule: string,
  filePath: string,
  content: string,
  imports: string[],
): { lineNumber?: number; reason: string; fix: string } | null {
  const normalized = rule.toLowerCase();

  if (
    normalized.includes("api") &&
    normalized.includes("helpers") &&
    filePath.includes("api") &&
    imports.some((specifier) => specifier.includes("helper"))
  ) {
    return {
      lineNumber: findLine(content, "helper"),
      reason: "API layer imports helpers directly.",
      fix: "Move shared behavior behind a service boundary or API-safe module.",
    };
  }

  if (
    normalized.includes("frontend") &&
    normalized.includes("backend") &&
    imports.some((specifier) => specifier.includes("backend"))
  ) {
    return {
      lineNumber: findLine(content, "backend"),
      reason: "Frontend code imports backend internals.",
      fix: "Use API route/client contract instead of direct backend import.",
    };
  }

  if (
    normalized.includes("controller") &&
    normalized.includes("database") &&
    /(db\.|database\.|prisma\.|sequelize\.)/.test(content)
  ) {
    return {
      lineNumber: findLine(content, "db.") ?? findLine(content, "prisma."),
      reason: "Controller-like file directly accesses database API.",
      fix: "Move database access into repository/service layer.",
    };
  }

  if (
    normalized.includes("more than 5") &&
    normalized.includes("imports") &&
    imports.length > 5
  ) {
    return {
      lineNumber: 1,
      reason: `File imports ${imports.length} modules.`,
      fix: "Split responsibilities or introduce narrower module boundaries.",
    };
  }

  return null;
}

function findLine(content: string, needle: string): number | undefined {
  const lines = content.split(/\r?\n/);
  const index = lines.findIndex((line) => line.includes(needle));
  return index >= 0 ? index + 1 : undefined;
}
