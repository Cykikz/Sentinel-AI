import { Command } from "commander";
import { analyzeGitHistory } from "../../../packages/backend/src/git/analyzer.js";
import { SentinelMemory } from "../../../packages/backend/src/memory/db.js";

export interface HistoryOptions {
  target: string;
  limit: string;
}

export const historyCommand = new Command("history")
  .description("Analyze git history and update contributor intelligence")
  .option("--target <path>", "Repository path", process.cwd())
  .option("--limit <n>", "Number of commits to analyze", "50")
  .action((opts: HistoryOptions) => {
    const limit = Number.parseInt(opts.limit, 10);
    if (!Number.isFinite(limit) || limit < 1) {
      throw new Error("--limit must be a positive number");
    }

    const result = analyzeGitHistory({
      projectRoot: opts.target,
      limit,
      persist: true,
    });

    if (!result.ok) {
      console.log(result.message);
      return;
    }

    const memory = new SentinelMemory(opts.target);
    try {
      const contributors = memory.getContributors(5);
      console.log(result.message);
      console.log(`Contributors: ${contributors.length}`);
      for (const contributor of contributors) {
        const expertise = JSON.parse(contributor.expertise_areas) as string[];
        console.log(
          `- ${contributor.name} <${contributor.email}> risky:${contributor.risky_commits} fixed:${contributor.issues_fixed} areas:${expertise.slice(0, 3).join(", ") || "none"}`,
        );
      }
    } finally {
      memory.close();
    }
  });
