import { SentinelMemory } from "../memory/db.js";
import type { NewFinding } from "../memory/db.js";
import { runScout } from "./01-scout.js";
import {
  findFunctionCalls,
  findFunctionDefinitions,
  listSourceFiles,
} from "./utils.js";
import { GHOST_HUNTER_PROMPT } from "../bob/prompts/ghost-hunter.prompt.js";
import { runBobReasoning } from "./bob-reasoning.js";

export interface GhostHunterResult {
  findings: NewFinding[];
  deadFunctions: number;
  orphanedFiles: number;
  deadCodePercentage: number;
  bobReasoning?: string;
}

export interface GhostHunterOptions {
  projectRoot?: string;
  scanId: number;
}

const ENTRYPOINT_NAMES = new Set(["handler", "main", "route", "middleware"]);

export async function runGhostHunter(
  options: GhostHunterOptions,
): Promise<GhostHunterResult> {
  const projectRoot = options.projectRoot ?? process.cwd();
  const files = await listSourceFiles(projectRoot);
  const definitions = files.flatMap(findFunctionDefinitions);
  const calls = new Set(files.flatMap(findFunctionCalls));
  const snapshot = await runScout({
    projectRoot,
    scanId: options.scanId,
    persist: false,
  });
  const findings: NewFinding[] = [];

  for (const definition of definitions) {
    if (calls.has(definition.name)) continue;
    if (ENTRYPOINT_NAMES.has(definition.name)) continue;

    findings.push({
      agent: "ghost-hunter",
      severity: "MEDIUM",
      category: "dead_code",
      filePath: definition.filePath,
      lineNumber: definition.lineNumber,
      description: `Function "${definition.name}" defined but never called.`,
    });
  }

  for (const filePath of snapshot.orphanedFiles) {
    findings.push({
      agent: "ghost-hunter",
      severity: "LOW",
      category: "orphaned_file",
      filePath,
      description: `File "${filePath}" is not imported by any mapped source file.`,
    });
  }

  const bobReview = await runBobReasoning(
    projectRoot,
    GHOST_HUNTER_PROMPT,
    findings.map((finding) => JSON.stringify(finding)).join("\n"),
  );

  const memory = new SentinelMemory(projectRoot);
  try {
    memory.saveFindings(options.scanId, findings);
  } finally {
    memory.close();
  }

  return {
    findings,
    deadFunctions: findings.filter((finding) => finding.category === "dead_code")
      .length,
    orphanedFiles: findings.filter((finding) => finding.category === "orphaned_file")
      .length,
    deadCodePercentage:
      definitions.length === 0
        ? 0
        : Math.round(
            (findings.filter((finding) => finding.category === "dead_code").length /
              definitions.length) *
              100,
          ),
    bobReasoning: bobReview?.output,
  };
}
