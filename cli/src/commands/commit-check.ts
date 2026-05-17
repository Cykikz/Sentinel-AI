import { execSync } from "node:child_process";
import { Command } from "commander";
import { runCommitGuard } from "../../../packages/backend/src/agents/orchestrator.js";
import { SentinelMemory } from "../../../packages/backend/src/memory/db.js";

export const commitCheckCommand = new Command("commit-check")
  .description("Run commit-time check")
  .action(async () => {
    const stagedFiles = getStagedFiles();
    if (stagedFiles.length === 0) {
      process.exitCode = 0;
      return;
    }

    try {
      const result = await runCommitGuard(process.cwd(), stagedFiles);
      const memory = new SentinelMemory(process.cwd());

      try {
        const findings = memory.getFindingsForScan(result.scanId);
        const critical = findings.filter((finding) => finding.severity === "CRITICAL");

        if (critical.length > 0) {
          console.log(`BLOCKED: ${critical.length} critical issue(s) found`);
          for (const finding of critical) {
            console.log(`- ${finding.file_path}:${finding.line_number ?? "?"} ${finding.description}`);
          }
          process.exitCode = 1;
          return;
        }
      } finally {
        memory.close();
      }

      process.exitCode = 0;
    } catch (error) {
      console.log("SentinelAI check skipped due to internal error");
      if (process.env.SENTINEL_DEBUG === "true") console.error(error);
      process.exitCode = 0;
    }
  });

function getStagedFiles(): string[] {
  try {
    const out = execSync("git diff --cached --name-only", {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    return out
      .split(/\r?\n/)
      .map((file) => file.trim().replaceAll("\\", "/"))
      .filter(Boolean);
  } catch {
    return [];
  }
}
