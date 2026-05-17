import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { analyzeGitHistory } from "../src/git/analyzer.js";
import { SentinelMemory } from "../src/memory/db.js";

const tempRoot = mkdtempSync(path.join(tmpdir(), "sentinel-git-"));

try {
  runGit(["init"]);
  runGit(["config", "user.name", "Ada Dev"]);
  runGit(["config", "user.email", "ada@example.com"]);

  mkdirSync(path.join(tempRoot, "src"), { recursive: true });
  writeFileSync(path.join(tempRoot, "src", "auth.js"), "const token = 'demo-secret';\n");
  runGit(["add", "."]);
  runGit(["commit", "-m", "add auth token flow"]);

  writeFileSync(path.join(tempRoot, "src", "auth.js"), "const token = process.env.TOKEN;\n");
  runGit(["add", "."]);
  runGit(["commit", "-m", "fix security token handling"]);

  const result = analyzeGitHistory({ projectRoot: tempRoot, limit: 10 });
  if (!result.ok || result.commits.length !== 2) {
    throw new Error(`Expected 2 analyzed commits, got ${result.commits.length}`);
  }

  const memory = new SentinelMemory(tempRoot);
  try {
    const commits = memory.getGitHistory(10);
    const contributors = memory.getContributors(10);

    if (commits.length !== 2) {
      throw new Error(`Expected 2 persisted commits, got ${commits.length}`);
    }

    if (contributors.length !== 1 || contributors[0].email !== "ada@example.com") {
      throw new Error("Expected Ada contributor record");
    }

    if (contributors[0].issues_fixed < 1 || contributors[0].issues_introduced < 1) {
      throw new Error("Expected contributor risk/fix counters");
    }
  } finally {
    memory.close();
  }

  console.log("GIT intelligence smoke test: OK");
  console.log(`Commits analyzed: ${result.commits.length}`);
  console.log(`Contributors: ${result.contributors.length}`);
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

function runGit(args: string[]): string {
  return execFileSync("git", args, {
    cwd: tempRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}
