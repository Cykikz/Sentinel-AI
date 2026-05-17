import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runScout } from "../src/agents/01-scout.js";
import { runGhostHunter } from "../src/agents/02-ghost-hunter.js";
import { runPrism } from "../src/agents/03-prism.js";
import { runArchitect } from "../src/agents/05-architect.js";
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
  const ghost = await runGhostHunter({ projectRoot: demoRoot, scanId: scan.id });
  const prism = await runPrism({ projectRoot: demoRoot, scanId: scan.id });
  const architect = await runArchitect({ projectRoot: demoRoot, scanId: scan.id });
  const findings = memory.getFindingsForScan(scan.id);

  if (ghost.deadFunctions < 1) {
    throw new Error("Expected GHOST HUNTER to find dead functions");
  }

  if (prism.leaks < 1) {
    throw new Error("Expected PRISM to find sensitive data findings");
  }

  if (architect.findings.length < 1) {
    throw new Error("Expected ARCHITECT to find architecture violation");
  }

  if (findings.length < 3) {
    throw new Error(`Expected at least 3 findings, got ${findings.length}`);
  }

  memory.deleteScan(scan.id);

  console.log("Core agents smoke test: OK");
  console.log(`GHOST HUNTER findings: ${ghost.findings.length}`);
  console.log(`PRISM findings: ${prism.findings.length}`);
  console.log(`ARCHITECT findings: ${architect.findings.length}`);
} finally {
  memory.close();
}
