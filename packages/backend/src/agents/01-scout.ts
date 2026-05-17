import { glob } from "glob";
import ignore from "ignore";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { SentinelMemory } from "../memory/db.js";
import {
  extractImportSpecifiers,
  isSourceFile,
  sourceExtensions,
} from "../parser/ast-parser.js";
import type { RepositorySnapshot } from "../types/index.js";
import { SCOUT_PROMPT } from "../bob/prompts/scout.prompt.js";
import { runBobReasoning } from "./bob-reasoning.js";

const DEFAULT_IGNORES = [
  ".git/**",
  ".sentinel/**",
  "dist/**",
  "node_modules/**",
  "coverage/**",
  ".next/**",
  "build/**",
];

export interface ScoutOptions {
  projectRoot?: string;
  scanId?: number;
  persist?: boolean;
}

export async function runScout(options: ScoutOptions = {}): Promise<RepositorySnapshot> {
  const projectRoot = path.resolve(options.projectRoot ?? process.cwd());
  const allFiles = await listRepositoryFiles(projectRoot);
  const sourceFiles = allFiles.filter(isSourceFile);
  const dependencyGraph = buildDependencyGraph(projectRoot, sourceFiles);
  const importedBy = buildImportedBy(dependencyGraph);
  const orphanedFiles = sourceFiles.filter((file) => !importedBy[file]?.length);
  const highRiskFiles = [...sourceFiles]
    .sort((a, b) => scoreFile(b, dependencyGraph, importedBy) - scoreFile(a, dependencyGraph, importedBy))
    .slice(0, 10)
    .filter((file) => scoreFile(file, dependencyGraph, importedBy) > 0);

  const snapshot: RepositorySnapshot = {
    scanId: options.scanId,
    timestamp: Date.now(),
    rootPath: projectRoot,
    framework: detectFramework(projectRoot),
    totalFiles: allFiles.length,
    sourceFiles: sourceFiles.length,
    orphanedFiles,
    highRiskFiles,
    dependencyGraph,
  };

  await runBobReasoning(
    projectRoot,
    SCOUT_PROMPT,
    JSON.stringify({
      framework: snapshot.framework,
      totalFiles: snapshot.totalFiles,
      sourceFiles: snapshot.sourceFiles,
      orphanedFiles: snapshot.orphanedFiles.slice(0, 30),
      highRiskFiles: snapshot.highRiskFiles,
      dependencyEdges: Object.values(snapshot.dependencyGraph).reduce(
        (total, imports) => total + imports.length,
        0,
      ),
    }),
  );

  if (options.persist ?? true) {
    const memory = new SentinelMemory(projectRoot);

    try {
      const saved = memory.saveRepositorySnapshot(snapshot);
      writeFileSync(
        path.join(projectRoot, ".sentinel", "repository-graph.json"),
        `${JSON.stringify(saved, null, 2)}\n`,
      );
      return saved;
    } finally {
      memory.close();
    }
  }

  return snapshot;
}

async function listRepositoryFiles(projectRoot: string): Promise<string[]> {
  const matcher = ignore().add(DEFAULT_IGNORES);
  const gitignorePath = path.join(projectRoot, ".gitignore");

  if (existsSync(gitignorePath)) {
    matcher.add(readFileSync(gitignorePath, "utf8"));
  }

  const files = await glob("**/*", {
    cwd: projectRoot,
    nodir: true,
    dot: true,
    windowsPathsNoEscape: true,
  });

  return files
    .map(toPosixPath)
    .filter((file) => !matcher.ignores(file))
    .sort((a, b) => a.localeCompare(b));
}

function buildDependencyGraph(
  projectRoot: string,
  sourceFiles: string[],
): Record<string, string[]> {
  const sourceSet = new Set(sourceFiles);
  const graph: Record<string, string[]> = {};

  for (const file of sourceFiles) {
    const absolutePath = path.join(projectRoot, file);
    const content = readFileSync(absolutePath, "utf8");
    const imports = extractImportSpecifiers(content, file)
      .map((specifier) => resolveLocalImport(projectRoot, file, specifier, sourceSet))
      .filter((resolved): resolved is string => Boolean(resolved));

    graph[file] = [...new Set(imports)].sort((a, b) => a.localeCompare(b));
  }

  return graph;
}

function resolveLocalImport(
  projectRoot: string,
  importer: string,
  specifier: string,
  sourceSet: Set<string>,
): string | null {
  if (!specifier.startsWith(".")) return null;

  const importerDir = path.dirname(path.join(projectRoot, importer));
  const basePath = path.resolve(importerDir, specifier);
  const candidates = [
    basePath,
    ...sourceExtensions().map((ext) => `${basePath}${ext}`),
    ...sourceExtensions().map((ext) => path.join(basePath, `index${ext}`)),
  ];

  for (const candidate of candidates) {
    const relative = toPosixPath(path.relative(projectRoot, candidate));
    if (sourceSet.has(relative)) return relative;
  }

  return null;
}

function detectFramework(projectRoot: string): string {
  const packageJsonPath = path.join(projectRoot, "package.json");

  if (existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

    if (deps.next) return "Next.js";
    if (deps.react) return "React";
    if (deps.express) return "Express";
    if (deps.typescript) return "TypeScript";
    return "Node.js";
  }

  if (existsSync(path.join(projectRoot, "requirements.txt"))) return "Python";
  if (existsSync(path.join(projectRoot, "pyproject.toml"))) return "Python";

  return "Unknown";
}

function buildImportedBy(graph: Record<string, string[]>): Record<string, string[]> {
  const importedBy: Record<string, string[]> = {};

  for (const [source, imports] of Object.entries(graph)) {
    for (const imported of imports) {
      importedBy[imported] ??= [];
      importedBy[imported].push(source);
    }
  }

  return importedBy;
}

function scoreFile(
  file: string,
  graph: Record<string, string[]>,
  importedBy: Record<string, string[]>,
): number {
  return (graph[file]?.length ?? 0) + (importedBy[file]?.length ?? 0) * 2;
}

function toPosixPath(value: string): string {
  return value.split(path.sep).join("/");
}
