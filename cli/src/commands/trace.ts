import { Command } from "commander";
import { traceLocalIntelligence } from "../../../packages/backend/src/query/local-intelligence.js";

export const traceCommand = new Command("trace")
  .description("Trace a variable or term through source, findings, graph, and git memory")
  .argument("<term>", "Variable or term to trace")
  .option("--target <path>", "Repository path", process.cwd())
  .action(async (term: string, opts: { target: string }) => {
    const result = await traceLocalIntelligence(opts.target, term);
    const groups = groupHits(result.hits);

    console.log(`Trace hits for "${term}": ${result.hits.length}`);
    for (const kind of ["source", "finding", "graph", "git"] as const) {
      const hits = groups[kind] ?? [];
      if (hits.length === 0) continue;

      console.log(`${kind}: ${hits.length}`);
      for (const hit of hits.slice(0, 10)) {
        console.log(`- ${hit.filePath}:${hit.lineNumber ?? "?"} ${hit.detail}`);
      }
      if (hits.length > 10) console.log(`- ... ${hits.length - 10} more`);
    }
  });

function groupHits(
  hits: Awaited<ReturnType<typeof traceLocalIntelligence>>["hits"],
): Record<string, typeof hits> {
  return hits.reduce<Record<string, typeof hits>>((groups, hit) => {
    groups[hit.kind] ??= [];
    groups[hit.kind].push(hit);
    return groups;
  }, {});
}
