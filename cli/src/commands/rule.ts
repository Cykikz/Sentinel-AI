import { Command } from "commander";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

interface RulesFile {
  rules: string[];
}

export const ruleCommand = new Command("rule").description("Manage architecture rules");

ruleCommand
  .command("add")
  .description("Add architecture rule")
  .argument("<rule>", "Plain-English architecture rule")
  .action((rule: string) => {
    const data = readRules(process.cwd());
    if (data.rules.includes(rule)) {
      console.log(`Rule already exists: ${rule}`);
      return;
    }

    data.rules.push(rule);
    writeRules(process.cwd(), data);
    console.log(`Rule added: ${rule}`);
  });

ruleCommand
  .command("list")
  .description("List architecture rules")
  .action(() => {
    const data = readRules(process.cwd());
    if (data.rules.length === 0) {
      console.log("No rules configured");
      return;
    }

    data.rules.forEach((rule, index) => console.log(`${index + 1}. ${rule}`));
  });

ruleCommand
  .command("remove")
  .description("Remove architecture rule by 1-based index")
  .argument("<index>", "Rule index")
  .action((indexText: string) => {
    const index = Number(indexText) - 1;
    const data = readRules(process.cwd());
    const removed = data.rules.splice(index, 1);

    if (!removed[0]) {
      throw new Error(`Rule not found: ${indexText}`);
    }

    writeRules(process.cwd(), data);
    console.log(`Rule removed: ${removed[0]}`);
  });

function readRules(root: string): RulesFile {
  const filePath = getRulesPath(root);
  if (!existsSync(filePath)) return { rules: [] };
  return JSON.parse(readFileSync(filePath, "utf8")) as RulesFile;
}

function writeRules(root: string, data: RulesFile): void {
  const filePath = getRulesPath(root);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function getRulesPath(root: string): string {
  return path.join(root, ".sentinel", "rules.json");
}
