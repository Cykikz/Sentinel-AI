import { SentinelMemory } from "../src/memory/db.js";

const memory = new SentinelMemory(process.cwd());

try {
  const scan = memory.createScan({
    scanType: "test",
    filesScanned: 1,
    issuesFound: 1,
  });

  const findings = memory.saveFindings(scan.id, [
    {
      agent: "TEST",
      severity: "LOW",
      category: "memory",
      filePath: "demo/test.js",
      lineNumber: 1,
      description: "Memory smoke finding",
    },
  ]);

  const health = memory.updateHealthScore({
    scanId: scan.id,
    overallScore: 98,
    securityScore: 100,
    architectureScore: 95,
    hygieneScore: 99,
  });

  const lastScan = memory.getLastScan();
  const history = memory.getHealthHistory(1);

  if (!lastScan || lastScan.id !== scan.id) {
    throw new Error("Last scan lookup failed");
  }

  if (findings.length !== 1 || findings[0]?.description !== "Memory smoke finding") {
    throw new Error("Finding insert/read failed");
  }

  if (health.overall_score !== 98 || history.length === 0) {
    throw new Error("Health history insert/read failed");
  }

  memory.deleteScan(scan.id);

  console.log("Memory smoke test: OK");
} finally {
  memory.close();
}
