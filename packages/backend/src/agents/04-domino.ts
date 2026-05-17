import { SentinelMemory } from "../memory/db.js";
import type { BlastRadius, FindingRecord } from "../memory/db.js";
import { DOMINO_PROMPT } from "../bob/prompts/domino.prompt.js";
import { runBobReasoning } from "./bob-reasoning.js";

export interface DominoResult {
  analyzedFindings: number;
  averageConfidence: number;
  bobReasoning?: string;
}

export interface DominoOptions {
  projectRoot?: string;
  scanId: number;
}

export async function runDomino(options: DominoOptions): Promise<DominoResult> {
  const projectRoot = options.projectRoot ?? process.cwd();
  const memory = new SentinelMemory(projectRoot);

  try {
    const snapshot = memory.getLatestRepositorySnapshot();
    const findings = memory.getFindingsForScan(options.scanId);
    if (!snapshot) return { analyzedFindings: 0, averageConfidence: 0 };

    const radii = findings.map((finding) => {
      const blastRadius = calculateBlastRadius(finding, snapshot.dependencyGraph);
      memory.updateBlastRadius(finding.id, blastRadius);
      return blastRadius;
    });

    const averageConfidence =
      radii.length === 0
        ? 0
        : Math.round(
            (radii.reduce((total, radius) => total + radius.confidence, 0) /
              radii.length) *
              100,
          );

    const bobReview = await runBobReasoning(
      projectRoot,
      DOMINO_PROMPT,
      findings
        .map((finding, index) =>
          JSON.stringify({ finding, blastRadius: radii[index] }),
        )
        .join("\n"),
    );

    return {
      analyzedFindings: findings.length,
      averageConfidence,
      bobReasoning: bobReview?.output,
    };
  } finally {
    memory.close();
  }
}

function calculateBlastRadius(
  finding: FindingRecord,
  graph: Record<string, string[]>,
): BlastRadius {
  const direct = Object.entries(graph)
    .filter(([, imports]) => imports.includes(finding.file_path))
    .map(([filePath]) => filePath)
    .sort((a, b) => a.localeCompare(b));
  const indirect = Object.entries(graph)
    .filter(([, imports]) => imports.some((imported) => direct.includes(imported)))
    .map(([filePath]) => filePath)
    .filter((filePath) => !direct.includes(filePath) && filePath !== finding.file_path)
    .sort((a, b) => a.localeCompare(b));
  const confidence = Math.max(
    0.55,
    Math.min(0.95, 0.95 - direct.length * 0.05 - indirect.length * 0.02),
  );

  return {
    directlyAffected: direct,
    indirectlyAffected: indirect,
    autoSafe: direct.length <= 1 && indirect.length === 0 ? direct : [],
    reviewNeeded: [...direct, ...indirect],
    confidence,
  };
}
