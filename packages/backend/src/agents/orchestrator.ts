import { runScout } from "./01-scout.js";
import { runGhostHunter } from "./02-ghost-hunter.js";
import { runPrism } from "./03-prism.js";
import { runDomino } from "./04-domino.js";
import { runArchitect } from "./05-architect.js";
import { runFixer } from "./06-fixer.js";
import { runNarrator } from "./07-narrator.js";
import { runVerifier } from "./08-verifier.js";
import { compressFindingsWithBob } from "../compression/pipeline.js";
import { applyConfidenceScores } from "../confidence/scorer.js";
import { SentinelMemory, type FindingRecord, type ScanType } from "../memory/db.js";
import { mapFinding } from "../server/data.js";
import { emitDashboardEvent } from "../server/events.js";

export interface RepositoryScanOptions {
  projectRoot: string;
  agent?: string;
  deep?: boolean;
  demo?: boolean;
  scanType?: ScanType;
  changedFiles?: string[];
  applyFixes?: boolean;
}

export interface RepositoryScanResult {
  scanId: number;
  findings: number;
  healthScore: number;
}

const DEEP_AGENTS = ["scout", "ghost-hunter", "prism", "architect", "domino", "verifier"];
const COMMIT_AGENTS = ["prism", "architect", "verifier"];

export async function runRepositoryScan(
  options: RepositoryScanOptions,
): Promise<RepositoryScanResult> {
  if (options.demo || process.env.DEMO_MODE === "true") {
    process.env.DEMO_MODE = "true";
  }

  const memory = new SentinelMemory(options.projectRoot);

  try {
    const scan = memory.createScan({
      scanType: options.scanType ?? (options.deep ? "deep" : "manual"),
      changedFiles: options.changedFiles,
    });
    const selectedAgents = selectAgents(options);
    const emittedFindings = new Set<number>();

    emitDashboardEvent(options.projectRoot, {
      type: "log",
      message: `Scan ${scan.id} started`,
      timestamp: Date.now(),
    });

    for (const agent of selectedAgents) {
      await runAgent(agent, options.projectRoot, scan.id, options.changedFiles);
      emitNewFindings(
        options.projectRoot,
        memory.getFindingsForScan(scan.id),
        emittedFindings,
      );
    }

    const confidenceResult = applyConfidenceScores({
      projectRoot: options.projectRoot,
      scanId: scan.id,
    });

    if (options.deep) {
      await runAgent("fixer", options.projectRoot, scan.id, undefined, !options.applyFixes);
      emitNewFindings(
        options.projectRoot,
        memory.getFindingsForScan(scan.id),
        emittedFindings,
      );
    }

    const findings = memory.getFindingsForScan(scan.id);
    const healthScore = confidenceResult.health.overallScore;

    memory.updateScanSummary(scan.id, {
      healthScore,
      issuesFound: findings.length,
      issuesFixed: findings.filter((finding) => finding.fix_applied === 1).length,
    });

    if (options.deep) {
      const compression = await compressFindingsWithBob(findings, options.projectRoot);
      emitDashboardEvent(options.projectRoot, {
        type: "log",
        message: `Compression ${compression.metrics.rawTokens}->${compression.metrics.compressedTokens} tokens (${compression.metrics.savingsPercent}% saved)`,
        timestamp: Date.now(),
      });
    }

    if (options.deep || options.agent === "narrator") {
      await runAgent("narrator", options.projectRoot, scan.id);
    }

    emitDashboardEvent(options.projectRoot, {
      type: "health",
      score: healthScore,
      timestamp: Date.now(),
    });
    emitDashboardEvent(options.projectRoot, {
      type: "log",
      message: `Scan ${scan.id} complete: ${findings.length} findings, health ${healthScore}/100`,
      timestamp: Date.now(),
    });

    return { scanId: scan.id, findings: findings.length, healthScore };
  } finally {
    memory.close();
  }
}

export function runDeepScan(projectRoot: string): Promise<RepositoryScanResult> {
  return runRepositoryScan({ projectRoot, deep: true });
}

export function runCommitGuard(
  projectRoot: string,
  changedFiles: string[],
): Promise<RepositoryScanResult> {
  return runRepositoryScan({
    projectRoot,
    scanType: "commit",
    changedFiles,
  });
}

async function runAgent(
  agent: string,
  projectRoot: string,
  scanId: number,
  changedFiles?: string[],
  dryRunFixes = true,
): Promise<void> {
  emitDashboardEvent(projectRoot, {
    type: "agent",
    agent,
    status: "running",
    message: `${agent} running`,
    timestamp: Date.now(),
  });

  try {
    if (agent === "scout") await runScout({ projectRoot, scanId });
    if (agent === "ghost-hunter") await runGhostHunter({ projectRoot, scanId });
    if (agent === "prism") await runPrism({ projectRoot, scanId, onlyFiles: changedFiles });
    if (agent === "architect") {
      await runArchitect({ projectRoot, scanId, onlyFiles: changedFiles });
    }
    if (agent === "domino") await runDomino({ projectRoot, scanId });
    if (agent === "verifier") await runVerifier({ projectRoot, scanId });
    if (agent === "fixer") await runFixer({ projectRoot, scanId, dryRun: dryRunFixes });
    if (agent === "narrator") await runNarrator({ projectRoot, scanId });

    emitDashboardEvent(projectRoot, {
      type: "agent",
      agent,
      status: "complete",
      message: `${agent} complete`,
      timestamp: Date.now(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    emitDashboardEvent(projectRoot, {
      type: "agent",
      agent,
      status: "failed",
      message,
      timestamp: Date.now(),
    });
    throw error;
  }
}

function selectAgents(options: RepositoryScanOptions): string[] {
  if (options.scanType === "commit") return COMMIT_AGENTS;
  if (options.deep) return DEEP_AGENTS;
  return [options.agent ?? "scout"];
}

function emitNewFindings(
  target: string,
  findings: FindingRecord[],
  emittedFindings: Set<number>,
): void {
  for (const finding of findings) {
    if (emittedFindings.has(finding.id)) continue;
    emittedFindings.add(finding.id);
    emitDashboardEvent(target, {
      type: "finding",
      finding: mapFinding(finding),
      timestamp: Date.now(),
    });
  }
}
