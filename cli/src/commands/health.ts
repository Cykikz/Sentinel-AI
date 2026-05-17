import { Command } from "commander";
import { SentinelMemory } from "../../../packages/backend/src/memory/db.js";

export const healthCommand = new Command("health")
  .description("Show current repository health from local memory")
  .option("--target <path>", "Repository path", process.cwd())
  .action((opts: { target: string }) => {
    const memory = new SentinelMemory(opts.target);

    try {
      const scan = memory.getLastScan();
      if (!scan) {
        console.log("No scans found. Run: sentinel scan --deep");
        return;
      }

      const findings = memory.getFindingsForScan(scan.id);
      const counts = countBySeverity(findings);
      console.log(`Health: ${scan.health_score ?? "unknown"}/100`);
      console.log(`Last scan: ${new Date(scan.timestamp).toISOString()}`);
      console.log(`Findings: ${findings.length}`);
      console.log(`CRITICAL ${counts.CRITICAL} | HIGH ${counts.HIGH} | MEDIUM ${counts.MEDIUM} | LOW ${counts.LOW}`);
      for (const finding of findings.slice(0, 5)) {
        console.log(`- [${finding.severity}] ${finding.file_path}: ${finding.description}`);
      }
    } finally {
      memory.close();
    }
  });

function countBySeverity(findings: Array<{ severity: string }>): Record<string, number> {
  return findings.reduce<Record<string, number>>(
    (counts, finding) => {
      counts[finding.severity] = (counts[finding.severity] ?? 0) + 1;
      return counts;
    },
    { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 },
  );
}
