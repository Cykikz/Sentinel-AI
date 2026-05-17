import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { SentinelMemory } from "../memory/db.js";
import type { FindingRecord } from "../memory/db.js";
import { NARRATOR_PROMPT } from "../bob/prompts/narrator.prompt.js";
import { runBobReasoning } from "./bob-reasoning.js";

export interface NarratorResult {
  reportPath: string;
  executiveSummaryPath: string;
  findingsReported: number;
}

export interface NarratorOptions {
  projectRoot?: string;
  scanId: number;
}

export async function runNarrator(options: NarratorOptions): Promise<NarratorResult> {
  const projectRoot = options.projectRoot ?? process.cwd();
  const memory = new SentinelMemory(projectRoot);

  try {
    const scan = memory.getScanById(options.scanId);
    const findings = memory.getFindingsForScan(options.scanId);
    const reportPath = path.join(projectRoot, "sentinel-report.md");
    const executiveSummaryPath = path.join(
      projectRoot,
      ".sentinel",
      "executive-summary.md",
    );
    const bobReport = await runBobReasoning(
      projectRoot,
      NARRATOR_PROMPT,
      JSON.stringify({
        healthScore: scan.health_score ?? 0,
        findings: findings.map(compactFinding),
      }),
    );
    const report = bobReport?.output.trim() || buildDeveloperReport(scan.health_score ?? 0, findings);
    const executive = buildExecutiveSummary(scan.health_score ?? 0, findings);

    mkdirSync(path.dirname(executiveSummaryPath), { recursive: true });
    writeFileSync(reportPath, report, "utf8");
    writeFileSync(executiveSummaryPath, executive, "utf8");

    memory.saveReport({
      scanId: options.scanId,
      reportType: "developer",
      filePath: reportPath,
      content: report,
    });
    memory.saveReport({
      scanId: options.scanId,
      reportType: "executive",
      filePath: executiveSummaryPath,
      content: executive,
    });

    return {
      reportPath,
      executiveSummaryPath,
      findingsReported: findings.length,
    };
  } finally {
    memory.close();
  }
}

function compactFinding(finding: FindingRecord): Record<string, unknown> {
  return {
    severity: finding.severity,
    agent: finding.agent,
    category: finding.category,
    file: finding.file_path,
    line: finding.line_number,
    description: finding.description,
    fix: finding.fix_description,
    confidence: finding.confidence,
    verification: finding.verification_status,
  };
}

function buildDeveloperReport(healthScore: number, findings: FindingRecord[]): string {
  const counts = countBySeverity(findings);

  return `# SentinelAI Security Report

Generated: ${new Date().toISOString()}
Health Score: ${healthScore}/100

## Summary

- Critical: ${counts.CRITICAL}
- High: ${counts.HIGH}
- Medium: ${counts.MEDIUM}
- Low: ${counts.LOW}

## All Findings

${findings.map(formatFinding).join("\n")}
`;
}

function buildExecutiveSummary(healthScore: number, findings: FindingRecord[]): string {
  const critical = findings.filter((finding) => finding.severity === "CRITICAL").length;
  const high = findings.filter((finding) => finding.severity === "HIGH").length;

  return `# SentinelAI Executive Summary

Health Score: ${healthScore}/100

SentinelAI found ${findings.length} issues in the demo scan. ${critical} are critical and ${high} are high severity.

Primary risk areas: sensitive data exposure, dead code hygiene, architecture rule drift.
`;
}

function formatFinding(finding: FindingRecord): string {
  const line = finding.line_number ? `:${finding.line_number}` : "";
  return `- **[${finding.severity}]** \`${finding.file_path}${line}\` (${finding.agent}/${finding.category}) - ${finding.description}`;
}

function countBySeverity(findings: FindingRecord[]): Record<string, number> {
  return findings.reduce<Record<string, number>>(
    (counts, finding) => {
      counts[finding.severity] = (counts[finding.severity] ?? 0) + 1;
      return counts;
    },
    { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 },
  );
}
