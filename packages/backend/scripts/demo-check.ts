import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { runScan } from "../../../cli/src/commands/scan.js";
import { SentinelMemory } from "../src/memory/db.js";

const root = path.resolve(process.cwd());
const demoRoot = path.join(root, "demo");

async function main(): Promise<void> {
  assertFileContains("src/auth.js", "logLogin(user.email, password)", "password leak");
  assertFileContains("src/api.js", "./helpers.js", "architecture violation");
  assertFileContains("src/helpers.js", "neverCalled", "dead function");
  assertFileContains("src/utils.js", "orphanedUtility", "orphaned file");
  assertFileContains(".sentinel/rules.json", "API layer should not import helpers directly", "demo rule");

  const result = await runScan({ target: demoRoot, deep: true, demo: true });
  const memory = new SentinelMemory(demoRoot);

  try {
    const findings = memory.getFindingsForScan(result.scanId);
    assert(findings.some((finding) => finding.category === "security_leak"), "PRISM leak missing");
    assert(
      findings.some((finding) => finding.category === "architecture_violation"),
      "ARCHITECT violation missing",
    );
    assert(findings.some((finding) => finding.category === "dead_code"), "dead code missing");
    assert(findings.some((finding) => finding.category === "orphaned_file"), "orphan file missing");
    assert(findings.some((finding) => finding.fix_applied === 1), "FIXER dry-run missing");
  } finally {
    memory.close();
  }

  assert(existsSync(path.join(demoRoot, "sentinel-report.md")), "sentinel-report.md missing");
  assert(
    existsSync(path.join(demoRoot, ".sentinel", "dashboard-events.jsonl")),
    "dashboard event log missing",
  );

  console.log("Demo checklist: OK");
  console.log(`Scan ${result.scanId}: ${result.findings} findings, health ${result.healthScore}/100`);
}

function assertFileContains(relativePath: string, needle: string, label: string): void {
  const filePath = path.join(demoRoot, relativePath);
  assert(existsSync(filePath), `${label} file missing: ${relativePath}`);
  assert(readFileSync(filePath, "utf8").includes(needle), `${label} marker missing`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Demo check failed: ${message}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
