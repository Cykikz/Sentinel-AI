import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runScout } from "../src/agents/01-scout.js";
import { SentinelMemory } from "../src/memory/db.js";
import {
  analyzeImpact,
  explainLocalFile,
  traceLocalIntelligence,
} from "../src/query/local-intelligence.js";

const tempRoot = mkdtempSync(path.join(tmpdir(), "sentinel-query-"));

try {
  mkdirSync(path.join(tempRoot, "src"), { recursive: true });
  writeFileSync(
    path.join(tempRoot, "package.json"),
    `${JSON.stringify({ dependencies: { express: "^4.0.0" } }, null, 2)}\n`,
  );
  writeFileSync(
    path.join(tempRoot, "src", "auth.js"),
    "export function getToken() {\n  return process.env.TOKEN;\n}\n",
  );
  writeFileSync(
    path.join(tempRoot, "src", "api.js"),
    "import { getToken } from './auth.js';\nexport function handler() {\n  console.log(getToken());\n}\n",
  );
  writeFileSync(
    path.join(tempRoot, "src", "route.js"),
    "import { handler } from './api.js';\nexport const route = handler;\n",
  );

  const memory = new SentinelMemory(tempRoot);
  try {
    const scan = memory.createScan({ scanType: "test" });
    await runScout({ projectRoot: tempRoot, scanId: scan.id });
    memory.saveFindings(scan.id, [
      {
        agent: "prism",
        severity: "CRITICAL",
        category: "security_leak",
        filePath: "src/api.js",
        lineNumber: 3,
        description: "Sensitive token reaches console.log.",
      },
    ]);
    memory.saveGitHistory([
      {
        commitHash: "1234567890abcdef",
        authorName: "Ada Dev",
        authorEmail: "ada@example.com",
        timestamp: Date.now(),
        filesChanged: ["src/api.js", "src/auth.js"],
        message: "fix token logging",
        introducedIssues: 1,
        fixedIssues: 1,
      },
    ]);
  } finally {
    memory.close();
  }

  const trace = await traceLocalIntelligence(tempRoot, "token");
  const impact = analyzeImpact(tempRoot, "auth.js");
  const explanation = explainLocalFile(tempRoot, "src/api.js");

  if (!trace.hits.some((hit) => hit.kind === "source")) {
    throw new Error("Expected source trace hit");
  }

  if (!trace.hits.some((hit) => hit.kind === "finding")) {
    throw new Error("Expected finding trace hit");
  }

  if (impact.matchedFile !== "src/auth.js" || !impact.directDependents.includes("src/api.js")) {
    throw new Error("Expected auth.js impact to include api.js");
  }

  if (!impact.transitiveDependents.includes("src/route.js")) {
    throw new Error("Expected auth.js impact to include transitive route.js");
  }

  if (explanation.findings.length !== 1 || explanation.commits.length !== 1) {
    throw new Error("Expected explanation to include finding and commit memory");
  }

  console.log("LOCAL QUERY smoke test: OK");
  console.log(`Trace hits: ${trace.hits.length}`);
  console.log(`Direct/transitive impact: ${impact.directDependents.length}/${impact.transitiveDependents.length}`);
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
