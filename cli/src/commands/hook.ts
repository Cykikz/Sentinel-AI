import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Command } from "commander";

export const hookCommand = new Command("hook").description("Manage git hooks");

hookCommand
  .command("install")
  .description("Install pre-commit hook")
  .action(() => {
    installPreCommitHook(process.cwd());
  });

hookCommand
  .command("uninstall")
  .description("Remove SentinelAI pre-commit hook")
  .action(() => {
    const hookPath = path.join(process.cwd(), ".git", "hooks", "pre-commit");
    if (!existsSync(hookPath)) {
      console.log("No pre-commit hook found");
      return;
    }

    rmSync(hookPath);
    console.log("Pre-commit hook removed");
  });

export function installPreCommitHook(root: string): void {
  const gitDir = path.join(root, ".git");
  if (!existsSync(gitDir)) {
    console.log("Git hook skipped: .git directory not found");
    return;
  }

  const hooksDir = path.join(gitDir, "hooks");
  mkdirSync(hooksDir, { recursive: true });
  writeFileSync(
    path.join(hooksDir, "pre-commit"),
    `#!/bin/sh
echo ""
echo "SentinelAI scanning staged changes..."
if command -v sentinel >/dev/null 2>&1; then
  sentinel commit-check
elif [ -f "../dist/cli/src/index.js" ]; then
  node ../dist/cli/src/index.js commit-check
elif [ -f "dist/cli/src/index.js" ]; then
  node dist/cli/src/index.js commit-check
else
  echo "SentinelAI CLI not found; skipping commit check."
  exit 0
fi
EXIT=$?
if [ $EXIT -ne 0 ]; then exit 1; fi
exit 0
`,
  );
  chmodSync(path.join(hooksDir, "pre-commit"), 0o755);
  console.log("Pre-commit hook installed");
}
