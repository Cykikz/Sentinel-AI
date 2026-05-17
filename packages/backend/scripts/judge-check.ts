import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { runScan } from "../../../cli/src/commands/scan.js";
import { refreshRepositoryGraph } from "../src/watcher/file-watcher.js";
import { analyzeGitHistory } from "../src/git/analyzer.js";
import { SentinelMemory } from "../src/memory/db.js";
import {
  analyzeImpact,
  explainLocalFile,
  traceLocalIntelligence,
} from "../src/query/local-intelligence.js";

const root = path.resolve(process.cwd());
const demoRoot = path.join(root, "demo");

interface CheckResult {
  name: string;
  details: string;
}

const checks: CheckResult[] = [];

async function main(): Promise<void> {
  verifyDocs();
  verifyDemoFixtures();

  const scan = await runScan({ target: demoRoot, deep: true, demo: true });
  checks.push({
    name: "deep demo scan",
    details: `${scan.findings} findings, health ${scan.healthScore}/100`,
  });

  verifyScanMemory(scan.scanId);
  await verifyLocalQueries();
  await verifyWatcherRefresh();
  verifyGitFailureMode();

  console.log("Judge checklist: OK");
  for (const check of checks) {
    console.log(`- ${check.name}: ${check.details}`);
  }
}

function verifyDocs(): void {
  assertFileContains("README.md", "Implemented through Phase 14", "README phase status");
  assertFileContains("DEMO.md", "CONFIDENCE complete", "demo confidence output");
  assertFileContains("SUBMISSION.md", "sentinel trace password", "submission query command");
  checks.push({ name: "docs", details: "README, DEMO, SUBMISSION current" });
}

function verifyDemoFixtures(): void {
  assertFileContains("demo/src/auth.js", "logLogin(user.email, password)", "password leak");
  assertFileContains("demo/src/api.js", "./helpers.js", "architecture violation");
  assertFileContains("demo/src/helpers.js", "neverCalled", "dead function");
  assertFileContains("demo/src/utils.js", "orphanedUtility", "orphaned file");
  assertFileContains(
    "demo/.sentinel/rules.json",
    "API layer should not import helpers directly",
    "architecture rule",
  );
  checks.push({ name: "demo fixtures", details: "vulnerable markers present" });
}

function verifyScanMemory(scanId: number): void {
  const memory = new SentinelMemory(demoRoot);

  try {
    const findings = memory.getFindingsForScan(scanId);
    assert(findings.length === 12, `expected 12 demo findings, got ${findings.length}`);
    assert(findings.some((finding) => finding.category === "security_leak"), "PRISM leak missing");
    assert(
      findings.some((finding) => finding.category === "architecture_violation"),
      "ARCHITECT violation missing",
    );
    assert(findings.some((finding) => finding.category === "dead_code"), "dead code missing");
    assert(findings.some((finding) => finding.category === "orphaned_file"), "orphan file missing");
    assert(findings.some((finding) => finding.fix_applied === 1), "FIXER dry-run missing");
    assert(findings.every((finding) => finding.confidence !== null), "confidence missing");
    assert(existsSync(path.join(demoRoot, "sentinel-report.md")), "sentinel-report.md missing");
    assert(
      existsSync(path.join(demoRoot, ".sentinel", "dashboard-events.jsonl")),
      "dashboard event log missing",
    );
    checks.push({ name: "scan memory", details: "agents, confidence, report, events verified" });
  } finally {
    memory.close();
  }
}

async function verifyLocalQueries(): Promise<void> {
  const trace = await traceLocalIntelligence(demoRoot, "password");
  assert(trace.hits.some((hit) => hit.kind === "source"), "trace source hits missing");
  assert(trace.hits.some((hit) => hit.kind === "finding"), "trace finding hits missing");

  const impact = analyzeImpact(demoRoot, "src/auth.js");
  assert(impact.matchedFile === "src/auth.js", "impact target mismatch");
  assert(impact.directDependents.includes("src/api.js"), "impact direct dependent missing");
  assert(impact.findings.length > 0, "impact findings missing");

  const explanation = explainLocalFile(demoRoot, "src/api.js");
  assert(explanation.exists, "explain target missing");
  assert(explanation.graphImports.includes("src/auth.js"), "explain graph import missing");
  assert(explanation.findings.length > 0, "explain findings missing");

  checks.push({
    name: "local queries",
    details: `trace ${trace.hits.length} hits, impact ${impact.findings.length} findings`,
  });
}

async function verifyWatcherRefresh(): Promise<void> {
  const result = await refreshRepositoryGraph(demoRoot);
  assert(result.snapshot.sourceFiles === 7, `expected 7 source files, got ${result.snapshot.sourceFiles}`);
  checks.push({
    name: "watcher refresh",
    details: `scan ${result.scanId}, snapshot ${result.snapshot.id}`,
  });
}

function verifyGitFailureMode(): void {
  const result = analyzeGitHistory({ projectRoot: demoRoot, persist: false });
  assert(!result.ok, "demo should report non-git failure mode");
  checks.push({ name: "git failure mode", details: result.message });
}

function assertFileContains(relativePath: string, needle: string, label: string): void {
  const filePath = path.join(root, relativePath);
  assert(existsSync(filePath), `${label} file missing: ${relativePath}`);
  assert(readFileSync(filePath, "utf8").includes(needle), `${label} marker missing`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Judge check failed: ${message}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
