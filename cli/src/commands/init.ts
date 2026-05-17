import { Command } from "commander";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { setupDatabase } from "../../../packages/backend/src/memory/db.js";
import { installPreCommitHook } from "./hook.js";

export const initCommand = new Command("init")
  .description("Initialize SentinelAI in current project")
  .option("--key <key>", "Bob Shell API key to store in .sentinel/config.json")
  .action((opts: { key?: string }) => {
    const root = process.cwd();
    const sentinelDir = path.join(root, ".sentinel");
    mkdirSync(path.join(sentinelDir, "cache"), { recursive: true });

    const configPath = path.join(sentinelDir, "config.json");
    if (!existsSync(configPath)) {
      writeFileSync(
        configPath,
        `${JSON.stringify(
          {
            bob_shell_api_key: opts.key ?? "",
            ibm_watsonx_api_key: "",
            ibm_watsonx_project_id: "",
            ibm_watsonx_url: "https://us-south.ml.cloud.ibm.com",
            ibm_watsonx_model_id: "ibm/granite-13b-chat-v2",
            caveman_mode: "full",
            backend_port: 7890,
          },
          null,
          2,
        )}\n`,
      );
    }

    const rulesPath = path.join(sentinelDir, "rules.json");
    if (!existsSync(rulesPath)) {
      writeFileSync(rulesPath, `${JSON.stringify({ rules: [] }, null, 2)}\n`);
    }

    ensureGitignore(root);
    installPreCommitHook(root);
    setupDatabase(root);

    console.log("SentinelAI initialized");
    console.log("Next: sentinel scan --deep");
  });

function ensureGitignore(root: string): void {
  const gitignorePath = path.join(root, ".gitignore");
  const existing = existsSync(gitignorePath)
    ? readFileSync(gitignorePath, "utf8")
    : "";

  if (!existing.includes(".sentinel/")) {
    appendFileSync(gitignorePath, `${existing.endsWith("\n") || existing.length === 0 ? "" : "\n"}.sentinel/\n`);
  }
}
