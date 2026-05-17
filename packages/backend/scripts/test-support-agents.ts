import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runScout } from "../src/agents/01-scout.js";
import { runGhostHunter } from "../src/agents/02-ghost-hunter.js";
import { runPrism } from "../src/agents/03-prism.js";
import { runDomino } from "../src/agents/04-domino.js";
import { runArchitect } from "../src/agents/05-architect.js";
import { runFixer } from "../src/agents/06-fixer.js";
import { runNarrator } from "../src/agents/07-narrator.js";
import { runVerifier } from "../src/agents/08-verifier.js";
import { SentinelMemory } from "../src/memory/db.js";

const demoRoot = path.resolve(process.cwd(), "demo");
const sentinelDir = path.join(demoRoot, ".sentinel");
mkdirSync(sentinelDir, { recursive: true });
writeFileSync(
  path.join(sentinelDir, "rules.json"),
  `${JSON.stringify(
    {
      rules: ["API layer should not import helpers directly"],
    },
    null,
    2,
  )}\n`,
);

const memory = new SentinelMemory(demoRoot);

try {
  const scan = memory.createScan({ scanType: "test" });
  await runScout({ projectRoot: demoRoot, scanId: scan.id });
  await runGhostHunter({ projectRoot: demoRoot, scanId: scan.id });
  await runPrism({ projectRoot: demoRoot, scanId: scan.id });
  await runArchitect({ projectRoot: demoRoot, scanId: scan.id });
  const domino = await runDomino({ projectRoot: demoRoot, scanId: scan.id });
  const verifier = await runVerifier({ projectRoot: demoRoot, scanId: scan.id });
  const fixer = await runFixer({ projectRoot: demoRoot, scanId: scan.id, dryRun: true });

  const findings = memory.getFindingsForScan(scan.id);
  const healthScore = Math.max(
    0,
    100 -
      findings.reduce((score, finding) => {
        if (finding.severity === "CRITICAL") return score + 20;
        if (finding.severity === "HIGH") return score + 10;
        if (finding.severity === "MEDIUM") return score + 5;
        if (finding.severity === "LOW") return score + 2;
        return score;
      }, 0),
  );
  memory.updateScanSummary(scan.id, {
    healthScore,
    issuesFound: findings.length,
  });
  memory.updateHealthScore({ scanId: scan.id, overallScore: healthScore });

  const narrator = await runNarrator({ projectRoot: demoRoot, scanId: scan.id });

  if (domino.analyzedFindings !== findings.length) {
    throw new Error("DOMINO did not analyze every finding");
  }

  if (verifier.verified + verifier.rejected !== findings.length) {
    throw new Error("VERIFIER did not process every finding");
  }

  if (!existsSync(narrator.reportPath)) {
    throw new Error("NARRATOR did not write sentinel-report.md");
  }

  memory.deleteScan(scan.id);

  console.log("Support agents smoke test: OK");
  console.log(`DOMINO analyzed: ${domino.analyzedFindings}`);
  console.log(`VERIFIER verified/rejected: ${verifier.verified}/${verifier.rejected}`);
  console.log(`FIXER dry-run applied/pending: ${fixer.applied}/${fixer.pending}`);
  console.log(`NARRATOR findings reported: ${narrator.findingsReported}`);
} finally {
  memory.close();
}
