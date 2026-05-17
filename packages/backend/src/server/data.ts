import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { type FindingRecord, SentinelMemory } from "../memory/db.js";
import type { DashboardFinding } from "./events.js";

const AGENTS = [
  "scout",
  "ghost-hunter",
  "prism",
  "architect",
  "domino",
  "verifier",
  "fixer",
  "narrator",
];

export interface DashboardSnapshot {
  projectRoot: string;
  healthScore: number;
  lastScan: {
    id: number;
    timestamp: number;
    findings: number;
    scanType: string;
  } | null;
  agents: Array<{
    id: string;
    status: "idle" | "complete";
  }>;
  findings: DashboardFinding[];
  healthHistory: Array<{
    timestamp: number;
    score: number;
  }>;
  reportPreview: string;
}

export function readDashboardSnapshot(projectRoot: string): DashboardSnapshot {
  const memory = new SentinelMemory(projectRoot);

  try {
    const lastScan = memory.getLastScan();
    const findings = lastScan ? memory.getFindingsForScan(lastScan.id) : [];
    const healthHistory = memory
      .getHealthHistory()
      .filter((record) => record.overall_score !== null)
      .map((record) => ({
        timestamp: record.timestamp,
        score: record.overall_score ?? 0,
      }));

    return {
      projectRoot,
      healthScore: lastScan?.health_score ?? 100,
      lastScan: lastScan
        ? {
            id: lastScan.id,
            timestamp: lastScan.timestamp,
            findings: findings.length,
            scanType: lastScan.scan_type,
          }
        : null,
      agents: AGENTS.map((id) => ({
        id,
        status: lastScan ? "complete" : "idle",
      })),
      findings: findings.map(mapFinding),
      healthHistory,
      reportPreview: readReportPreview(projectRoot),
    };
  } finally {
    memory.close();
  }
}

export function mapFinding(finding: FindingRecord): DashboardFinding {
  return {
    id: finding.id,
    scanId: finding.scan_id,
    agent: finding.agent,
    severity: finding.severity,
    category: finding.category,
    filePath: finding.file_path,
    lineNumber: finding.line_number,
    description: finding.description,
    fixApplied: finding.fix_applied === 1,
    confidence: finding.confidence,
    verificationStatus: finding.verification_status,
  };
}

function readReportPreview(projectRoot: string): string {
  const reportPath = path.join(projectRoot, "sentinel-report.md");
  if (!existsSync(reportPath)) return "";

  return readFileSync(reportPath, "utf8").slice(0, 4000);
}
