import { Command } from "commander";
import { analyzeImpact } from "../../../packages/backend/src/query/local-intelligence.js";

export const impactCommand = new Command("impact")
  .description("Show graph, finding, and git impact for a source file/service")
  .argument("<file>", "File or service path")
  .option("--target <path>", "Repository path", process.cwd())
  .action((file: string, opts: { target: string }) => {
    const result = analyzeImpact(opts.target, file);

    if (!result.matchedFile) {
      console.log("No repository graph match. Run: sentinel scan --agent scout");
      return;
    }

    console.log(`Impact target: ${result.matchedFile}`);
    console.log(`Imports: ${result.imports.length}`);
    result.imports.slice(0, 10).forEach((source) => console.log(`- imports ${source}`));

    console.log(`Direct dependents: ${result.directDependents.length}`);
    result.directDependents.slice(0, 10).forEach((source) => console.log(`- ${source}`));

    console.log(`Transitive dependents: ${result.transitiveDependents.length}`);
    result.transitiveDependents.slice(0, 10).forEach((source) => console.log(`- ${source}`));

    console.log(`Open findings in impact set: ${result.findings.length}`);
    for (const finding of result.findings.slice(0, 5)) {
      console.log(`- [${finding.severity}] ${finding.file_path}:${finding.line_number ?? "?"} ${finding.description}`);
    }

    console.log(`Recent commits touching impact set: ${result.commits.length}`);
    for (const commit of result.commits.slice(0, 5)) {
      console.log(`- ${commit.commit_hash.slice(0, 8)} ${commit.message ?? "(no message)"}`);
    }
  });
