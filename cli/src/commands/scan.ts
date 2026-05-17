import { Command } from "commander";
import {
  runRepositoryScan,
  type RepositoryScanResult,
} from "../../../packages/backend/src/agents/orchestrator.js";

export interface ScanOptions {
  agent?: string;
  target: string;
  deep?: boolean;
  demo?: boolean;
  applyFixes?: boolean;
}

const IMPLEMENTED_AGENTS = new Set([
  "scout",
  "ghost-hunter",
  "prism",
  "domino",
  "architect",
  "fixer",
  "narrator",
  "verifier",
]);

export const scanCommand = new Command("scan")
  .description("Run SentinelAI repository analysis")
  .option(
    "--agent <agent>",
    "Run one agent: scout, ghost-hunter, prism, domino, architect, fixer, narrator, verifier",
  )
  .option("--target <path>", "Repository path to scan", process.cwd())
  .option("--deep", "Run all implemented agents")
  .option("--demo", "Use deterministic demo mode and skip live AI calls")
  .option("--apply-fixes", "Allow FIXER to edit files instead of recording dry-run fixes")
  .action(async (opts: ScanOptions) => {
    await runScan(opts);
  });

export async function runScan(opts: ScanOptions): Promise<RepositoryScanResult> {
  if (opts.demo || process.env.DEMO_MODE === "true") {
    process.env.DEMO_MODE = "true";
    console.log("DEMO_MODE=true; live IBM Bob calls skipped.");
  }

  if (opts.agent && !IMPLEMENTED_AGENTS.has(opts.agent)) {
    throw new Error(`Agent not implemented yet: ${opts.agent}`);
  }

  const result = await runRepositoryScan({
    projectRoot: opts.target,
    agent: opts.agent,
    deep: opts.deep,
    demo: opts.demo,
    applyFixes: opts.applyFixes,
  });

  console.log(`Scan complete: ${result.findings} findings, health ${result.healthScore}/100`);
  return result;
}
