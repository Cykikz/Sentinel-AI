import { Command } from "commander";
import { SentinelMemory, setupDatabase } from "../../../packages/backend/src/memory/db.js";

export const dbCommand = new Command("db").description("Manage local SentinelAI SQLite memory");

dbCommand
  .command("setup")
  .description("Create .sentinel/memory.db with SentinelAI schema")
  .action(() => {
    const paths = setupDatabase(process.cwd());
    console.log(`SQLite memory ready: ${paths.dbPath}`);
  });

dbCommand
  .command("test")
  .description("Run a local SQLite memory smoke test")
  .action(() => {
    const memory = new SentinelMemory(process.cwd());

    try {
      const scan = memory.createScan({
        scanType: "test",
        filesScanned: 1,
        issuesFound: 1,
      });

      memory.saveFindings(scan.id, [
        {
          agent: "TEST",
          severity: "LOW",
          category: "memory",
          filePath: "demo/test.js",
          description: "CLI memory smoke finding",
        },
      ]);

      memory.updateHealthScore({ scanId: scan.id, overallScore: 99 });
      memory.deleteScan(scan.id);

      console.log("SQLite memory smoke test: OK");
    } finally {
      memory.close();
    }
  });
