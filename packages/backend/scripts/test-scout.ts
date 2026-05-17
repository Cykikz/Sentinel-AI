import path from "node:path";
import { runScout } from "../src/agents/01-scout.js";

const demoRoot = path.resolve(process.cwd(), "demo");
const snapshot = await runScout({ projectRoot: demoRoot });

if (snapshot.framework !== "Express") {
  throw new Error(`Expected Express framework, got ${snapshot.framework}`);
}

if (snapshot.sourceFiles < 6) {
  throw new Error(`Expected at least 6 source files, got ${snapshot.sourceFiles}`);
}

if (!snapshot.dependencyGraph["src/api.js"]?.includes("src/auth.js")) {
  throw new Error("Expected src/api.js to import src/auth.js");
}

if (!snapshot.orphanedFiles.includes("src/utils.js")) {
  throw new Error("Expected src/utils.js orphaned candidate");
}

console.log("SCOUT smoke test: OK");
console.log(`Framework: ${snapshot.framework}`);
console.log(`Source files: ${snapshot.sourceFiles}`);
console.log(`Orphaned candidates: ${snapshot.orphanedFiles.length}`);
