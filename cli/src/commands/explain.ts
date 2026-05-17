import { Command } from "commander";
import { explainLocalFile } from "../../../packages/backend/src/query/local-intelligence.js";

export const explainCommand = new Command("explain")
  .description("Explain a file using source, graph, findings, and git memory")
  .argument("<file>", "File to explain")
  .option("--target <path>", "Repository path", process.cwd())
  .action((file: string, opts: { target: string }) => {
    const explanation = explainLocalFile(opts.target, file);
    if (!explanation.exists) {
      console.log(`File not found: ${file}`);
      return;
    }

    console.log(`File: ${explanation.filePath}`);
    console.log(`Lines: ${explanation.lines}`);
    console.log(`Imports: ${explanation.imports.length ? explanation.imports.join(", ") : "none"}`);
    console.log(`Exports: ${explanation.exports.length ? explanation.exports.join(", ") : "none"}`);
    console.log(`Graph imports: ${explanation.graphImports.length ? explanation.graphImports.join(", ") : "none"}`);
    console.log(`Imported by: ${explanation.importedBy.length ? explanation.importedBy.join(", ") : "none"}`);
    console.log(`Findings: ${explanation.findings.length}`);
    for (const finding of explanation.findings.slice(0, 5)) {
      console.log(`- [${finding.severity}] ${finding.line_number ?? "?"}: ${finding.description}`);
    }
    console.log(`Recent commits: ${explanation.commits.length}`);
    for (const commit of explanation.commits.slice(0, 5)) {
      console.log(`- ${commit.commit_hash.slice(0, 8)} ${commit.message ?? "(no message)"}`);
    }
    console.log(`Contributors: ${explanation.contributors.length ? explanation.contributors.join(", ") : "unknown"}`);
  });
