import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { applyConfidenceScores } from "../src/confidence/scorer.js";
import { SentinelMemory } from "../src/memory/db.js";

const tempRoot = mkdtempSync(path.join(tmpdir(), "sentinel-confidence-"));
const memory = new SentinelMemory(tempRoot);

try {
  const scan = memory.createScan({ scanType: "test" });
  const findings = memory.saveFindings(scan.id, [
    {
      agent: "prism",
      severity: "CRITICAL",
      category: "security_leak",
      filePath: "src/api.ts",
      lineNumber: 12,
      description: "Sensitive value flows into console.log.",
      fixDescription: "Remove sensitive value from logs.",
    },
    {
      agent: "architect",
      severity: "HIGH",
      category: "architecture_violation",
      filePath: "src/page.tsx",
      lineNumber: 3,
      description: "Frontend imports backend internals.",
      fixDescription: "Use API contract instead.",
    },
    {
      agent: "ghost-hunter",
      severity: "LOW",
      category: "orphaned_file",
      filePath: "src/old.ts",
      description: "File is not imported.",
    },
  ]);

  memory.updateBlastRadius(findings[0].id, {
    directlyAffected: ["src/router.ts"],
    indirectlyAffected: [],
    autoSafe: [],
    reviewNeeded: ["src/router.ts"],
    confidence: 0.9,
  });
  memory.updateVerification(findings[0].id, true, "Local text fix.");
  memory.updateVerification(findings[1].id, false, "Needs human architecture review.");

  const result = applyConfidenceScores({ projectRoot: tempRoot, scanId: scan.id });
  const updated = memory.getFindingsForScan(scan.id);

  if (updated.some((finding) => finding.confidence === null)) {
    throw new Error("Expected every finding to have confidence");
  }

  if ((updated.find((finding) => finding.category === "security_leak")?.confidence ?? 0) < 85) {
    throw new Error("Expected verified security finding to score high confidence");
  }

  if (result.health.securityScore >= 100 || result.health.architectureScore >= 100) {
    throw new Error("Expected category health scores to reflect findings");
  }

  if (result.health.overallScore <= 0 || result.health.overallScore > 100) {
    throw new Error(`Invalid overall score: ${result.health.overallScore}`);
  }

  console.log("CONFIDENCE smoke test: OK");
  console.log(`Average confidence: ${result.health.averageConfidence}%`);
  console.log(`Health: ${result.health.overallScore}/100`);
} finally {
  memory.close();
  rmSync(tempRoot, { recursive: true, force: true });
}
