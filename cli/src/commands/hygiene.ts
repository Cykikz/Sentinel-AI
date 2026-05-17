import { Command } from "commander";
import { SentinelMemory } from "../../../packages/backend/src/memory/db.js";

export const hygieneCommand = new Command("hygiene")
  .description("Show dead-code and orphan-file findings")
  .option("--target <path>", "Repository path", process.cwd())
  .action((opts: { target: string }) => {
    const memory = new SentinelMemory(opts.target);

    try {
      const scan = memory.getLastScan();
      if (!scan) {
        console.log("No scans found. Run: sentinel scan --deep");
        return;
      }

      const findings = memory
        .getFindingsForScan(scan.id)
        .filter((finding) =>
          ["dead_code", "orphaned_file"].includes(finding.category),
        );
      console.log(`Hygiene findings: ${findings.length}`);
      for (const finding of findings.slice(0, 10)) {
        console.log(`- [${finding.severity}] ${finding.file_path}: ${finding.description}`);
      }
    } finally {
      memory.close();
    }
  });
