import { Command } from "commander";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const configCommand = new Command("config")
  .description("Manage SentinelAI local config")
  .option("--key <key>", "Set Bob Shell API key in .sentinel/config.json")
  .option("--watsonx-key <key>", "Set IBM watsonx API key in .sentinel/config.json")
  .option("--watsonx-project <id>", "Set IBM watsonx project ID in .sentinel/config.json")
  .option("--show", "Show config keys without secret values")
  .action((opts: {
    key?: string;
    watsonxKey?: string;
    watsonxProject?: string;
    show?: boolean;
  }) => {
    const root = process.cwd();
    const config = readConfig(root);

    if (opts.key) {
      config.bob_shell_api_key = opts.key;
      console.log("Bob Shell API key saved to .sentinel/config.json");
    }

    if (opts.watsonxKey) {
      config.ibm_watsonx_api_key = opts.watsonxKey;
      console.log("IBM watsonx API key saved to .sentinel/config.json");
    }

    if (opts.watsonxProject) {
      config.ibm_watsonx_project_id = opts.watsonxProject;
      console.log("IBM watsonx project ID saved to .sentinel/config.json");
    }

    if (opts.key || opts.watsonxKey || opts.watsonxProject) {
      writeConfig(root, config);
    }

    if (opts.show || (!opts.key && !opts.watsonxKey && !opts.watsonxProject)) {
      for (const [key, value] of Object.entries(config)) {
        console.log(`${key}: ${String(key).includes("key") && value ? "present" : value}`);
      }
    }
  });

function readConfig(root: string): Record<string, unknown> {
  const filePath = getConfigPath(root);
  if (!existsSync(filePath)) return {};
  return JSON.parse(readFileSync(filePath, "utf8")) as Record<string, unknown>;
}

function writeConfig(root: string, config: Record<string, unknown>): void {
  const filePath = getConfigPath(root);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`);
}

function getConfigPath(root: string): string {
  return path.join(root, ".sentinel", "config.json");
}
