import { glob } from "glob";
import ignore from "ignore";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  extractNamedImports,
  findFunctionCallsInSource,
  findFunctionDefinitionsInSource,
} from "../parser/ast-parser.js";

export interface SourceFile {
  relativePath: string;
  absolutePath: string;
  content: string;
}

export interface FunctionDefinition {
  name: string;
  filePath: string;
  lineNumber: number;
  exported: boolean;
  params: string[];
  body: string;
}

const SOURCE_GLOB = "**/*.{js,jsx,ts,tsx,mjs,cjs}";
const DEFAULT_IGNORES = [
  ".git/**",
  ".sentinel/**",
  "dist/**",
  "node_modules/**",
  "coverage/**",
  ".next/**",
  "build/**",
];

export async function listSourceFiles(projectRoot: string): Promise<SourceFile[]> {
  const matcher = ignore().add(DEFAULT_IGNORES);
  const gitignorePath = path.join(projectRoot, ".gitignore");

  if (existsSync(gitignorePath)) {
    matcher.add(readFileSync(gitignorePath, "utf8"));
  }

  const files = await glob(SOURCE_GLOB, {
    cwd: projectRoot,
    nodir: true,
    dot: true,
    windowsPathsNoEscape: true,
  });

  return files
    .map(toPosixPath)
    .filter((file) => !matcher.ignores(file))
    .sort((a, b) => a.localeCompare(b))
    .map((relativePath) => {
      const absolutePath = path.join(projectRoot, relativePath);
      return {
        relativePath,
        absolutePath,
        content: readFileSync(absolutePath, "utf8"),
      };
    });
}

export function getLineNumber(content: string, index: number): number {
  return content.slice(0, index).split(/\r?\n/).length;
}

export function findFunctionDefinitions(file: SourceFile): FunctionDefinition[] {
  return findFunctionDefinitionsInSource(file.content, file.relativePath).map(
    (definition) => ({
      ...definition,
      filePath: file.relativePath,
    }),
  );
}

export function findFunctionCalls(file: SourceFile): string[] {
  return findFunctionCallsInSource(file.content, file.relativePath);
}

export function findNamedImports(file: SourceFile): Map<string, string> {
  return extractNamedImports(file.content, file.relativePath);
}

export function relativeFromSpecifier(
  importerPath: string,
  specifier: string,
  files: SourceFile[],
): string | null {
  const importerDir = path.posix.dirname(importerPath);
  const basePath = path.posix.normalize(path.posix.join(importerDir, specifier));
  const candidates = [
    basePath,
    `${basePath}.js`,
    `${basePath}.jsx`,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.mjs`,
    `${basePath}.cjs`,
    `${basePath}/index.js`,
    `${basePath}/index.ts`,
  ];
  const fileSet = new Set(files.map((file) => file.relativePath));

  return candidates.find((candidate) => fileSet.has(candidate)) ?? null;
}

export function toPosixPath(value: string): string {
  return value.split(path.sep).join("/");
}
