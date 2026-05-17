import { SentinelMemory } from "../memory/db.js";
import type { FindingRecord } from "../memory/db.js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { FIXER_PROMPT } from "../bob/prompts/fixer.prompt.js";
import { runBobReasoning } from "./bob-reasoning.js";

export interface FixerResult {
  applied: number;
  pending: number;
  bobReasoning?: string;
}

export interface FixerOptions {
  projectRoot?: string;
  scanId: number;
  dryRun?: boolean;
}

export async function runFixer(options: FixerOptions): Promise<FixerResult> {
  const projectRoot = options.projectRoot ?? process.cwd();
  const memory = new SentinelMemory(projectRoot);
  let applied = 0;
  let pending = 0;

  try {
    const findings = memory.getFindingsForScan(options.scanId);
    const fixableFindings = findings.filter((finding) =>
      isSafeMetadataFix(finding, finding.confidence ?? 0),
    );
    const bobReview = await runBobReasoning(
      projectRoot,
      FIXER_PROMPT,
      fixableFindings.map((finding) => JSON.stringify(finding)).join("\n"),
    );

    for (const finding of findings) {
      const confidence = finding.confidence ?? 0;
      if (!isSafeMetadataFix(finding, confidence)) {
        pending += 1;
        continue;
      }

      if (!options.dryRun && !applyCodeFix(projectRoot, finding)) {
        pending += 1;
        continue;
      }

      memory.markFixApplied(
        finding.id,
        options.dryRun
          ? `Dry-run fix approved: ${finding.fix_description}`
          : `Code fix applied: ${finding.fix_description}`,
      );
      applied += 1;
    }
    return { applied, pending, bobReasoning: bobReview?.output };
  } finally {
    memory.close();
  }
}

function applyCodeFix(projectRoot: string, finding: FindingRecord): boolean {
  const filePath = path.join(projectRoot, finding.file_path);
  if (!existsSync(filePath)) return false;

  const content = readFileSync(filePath, "utf8");

  if (finding.original_code && finding.bob_fix_code && content.includes(finding.original_code)) {
    writeFileSync(filePath, content.replace(finding.original_code, finding.bob_fix_code), "utf8");
    return true;
  }

  if (finding.category !== "security_leak" || !finding.line_number) return false;
  const lines = content.split(/\r?\n/);
  const index = finding.line_number - 1;
  const line = lines[index];
  if (!line || !/(console\.|logger|analytics|res\.json|res\.send|localStorage|fetch)/.test(line)) {
    return false;
  }

  const indent = line.match(/^\s*/)?.[0] ?? "";
  lines[index] = `${indent}// SentinelAI removed unsafe sensitive-data sink.`;
  writeFileSync(filePath, lines.join("\n"), "utf8");
  return true;
}

function isSafeMetadataFix(finding: FindingRecord, confidence: number): boolean {
  return (
    finding.verification_status === "VERIFIED" &&
    confidence >= 90 &&
    finding.fix_description !== null &&
    finding.category === "security_leak"
  );
}
