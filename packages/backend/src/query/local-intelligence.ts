import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { listSourceFiles } from "../agents/utils.js";
import {
  SentinelMemory,
  type FindingRecord,
  type GitHistoryRecord,
} from "../memory/db.js";
import {
  extractExportNames,
  extractImportSpecifiers,
} from "../parser/ast-parser.js";
import type { RepositorySnapshot } from "../types/index.js";

export interface TraceHit {
  kind: "source" | "finding" | "graph" | "git";
  filePath: string;
  lineNumber?: number;
  detail: string;
}

export interface TraceResult {
  term: string;
  hits: TraceHit[];
}

export interface ImpactResult {
  target: string;
  matchedFile: string | null;
  directDependents: string[];
  transitiveDependents: string[];
  imports: string[];
  findings: FindingRecord[];
  commits: GitHistoryRecord[];
}

export interface FileExplanation {
  filePath: string;
  exists: boolean;
  lines: number;
  imports: string[];
  exports: string[];
  graphImports: string[];
  importedBy: string[];
  findings: FindingRecord[];
  commits: GitHistoryRecord[];
  contributors: string[];
}

const MAX_SOURCE_HITS = 20;

export async function traceLocalIntelligence(
  projectRoot: string,
  term: string,
): Promise<TraceResult> {
  const normalized = term.toLowerCase();
  const memory = new SentinelMemory(projectRoot);

  try {
    const snapshot = memory.getLatestRepositorySnapshot();
    const scan = memory.getLastScan();
    const findings = scan ? memory.getFindingsForScan(scan.id) : [];
    const commits = memory.getGitHistory(100);
    const hits: TraceHit[] = [];

    for (const file of await listSourceFiles(projectRoot)) {
      const lines = file.content.split(/\r?\n/);
      for (const [index, line] of lines.entries()) {
        if (!line.toLowerCase().includes(normalized)) continue;
        hits.push({
          kind: "source",
          filePath: file.relativePath,
          lineNumber: index + 1,
          detail: line.trim().slice(0, 160),
        });
        if (hits.filter((hit) => hit.kind === "source").length >= MAX_SOURCE_HITS) break;
      }
    }

    for (const finding of findings) {
      const haystack = `${finding.file_path} ${finding.category} ${finding.description}`.toLowerCase();
      if (!haystack.includes(normalized)) continue;
      hits.push({
        kind: "finding",
        filePath: finding.file_path,
        lineNumber: finding.line_number ?? undefined,
        detail: `[${finding.severity}] ${finding.description}`,
      });
    }

    if (snapshot) {
      for (const [filePath, imports] of Object.entries(snapshot.dependencyGraph)) {
        if (filePath.toLowerCase().includes(normalized)) {
          hits.push({
            kind: "graph",
            filePath,
            detail: `imports ${imports.length} file(s), imported by ${importedBy(snapshot, filePath).length}`,
          });
        }
      }
    }

    for (const commit of commits) {
      const files = parseFilesChanged(commit.files_changed);
      const haystack = `${commit.message ?? ""} ${files.join(" ")}`.toLowerCase();
      if (!haystack.includes(normalized)) continue;
      hits.push({
        kind: "git",
        filePath: files[0] ?? ".",
        detail: `${commit.commit_hash.slice(0, 8)} ${commit.message ?? "(no message)"}`,
      });
    }

    return { term, hits: dedupeTraceHits(hits) };
  } finally {
    memory.close();
  }
}

export function analyzeImpact(projectRoot: string, target: string): ImpactResult {
  const memory = new SentinelMemory(projectRoot);

  try {
    const snapshot = memory.getLatestRepositorySnapshot();
    if (!snapshot) {
      return {
        target,
        matchedFile: null,
        directDependents: [],
        transitiveDependents: [],
        imports: [],
        findings: [],
        commits: [],
      };
    }

    const matchedFile = resolveGraphFile(snapshot, target);
    const directDependents = matchedFile ? importedBy(snapshot, matchedFile) : [];
    const transitiveDependents = matchedFile
      ? collectTransitiveDependents(snapshot, matchedFile)
      : [];
    const impacted = new Set([matchedFile, ...directDependents, ...transitiveDependents].filter(Boolean));
    const scan = memory.getLastScan();
    const findings = scan
      ? memory.getFindingsForScan(scan.id).filter((finding) => impacted.has(finding.file_path))
      : [];
    const commits = memory
      .getGitHistory(100)
      .filter((commit) =>
        parseFilesChanged(commit.files_changed).some((filePath) => impacted.has(filePath)),
      );

    return {
      target,
      matchedFile,
      directDependents,
      transitiveDependents,
      imports: matchedFile ? snapshot.dependencyGraph[matchedFile] ?? [] : [],
      findings,
      commits,
    };
  } finally {
    memory.close();
  }
}

export function explainLocalFile(projectRoot: string, filePath: string): FileExplanation {
  const memory = new SentinelMemory(projectRoot);
  const normalizedPath = toPosixPath(filePath);
  const absolutePath = path.join(projectRoot, normalizedPath);

  try {
    const exists = existsSync(absolutePath);
    const content = exists ? readFileSync(absolutePath, "utf8") : "";
    const snapshot = memory.getLatestRepositorySnapshot();
    const matchedFile = snapshot?.dependencyGraph[normalizedPath]
      ? normalizedPath
      : snapshot
        ? resolveGraphFile(snapshot, normalizedPath) ?? normalizedPath
        : normalizedPath;
    const scan = memory.getLastScan();
    const findings = scan
      ? memory.getFindingsForScan(scan.id).filter((finding) => finding.file_path === matchedFile)
      : [];
    const commits = memory
      .getGitHistory(100)
      .filter((commit) => parseFilesChanged(commit.files_changed).includes(matchedFile));
    const contributors = [
      ...new Set(commits.map((commit) => commit.author).filter(Boolean)),
    ].slice(0, 5);

    return {
      filePath: matchedFile,
      exists,
      lines: content ? content.split(/\r?\n/).length : 0,
      imports: content ? extractImportSpecifiers(content, matchedFile) : [],
      exports: content ? extractExportNames(content, matchedFile) : [],
      graphImports: snapshot ? snapshot.dependencyGraph[matchedFile] ?? [] : [],
      importedBy: snapshot ? importedBy(snapshot, matchedFile) : [],
      findings,
      commits,
      contributors,
    };
  } finally {
    memory.close();
  }
}

function resolveGraphFile(snapshot: RepositorySnapshot, target: string): string | null {
  const normalized = toPosixPath(target).toLowerCase();
  const files = Object.keys(snapshot.dependencyGraph);
  return (
    files.find((filePath) => filePath.toLowerCase() === normalized) ??
    files.find((filePath) => filePath.toLowerCase().endsWith(normalized)) ??
    files.find((filePath) => filePath.toLowerCase().includes(normalized)) ??
    null
  );
}

function importedBy(snapshot: RepositorySnapshot, filePath: string): string[] {
  return Object.entries(snapshot.dependencyGraph)
    .filter(([, imports]) => imports.includes(filePath))
    .map(([source]) => source)
    .sort((a, b) => a.localeCompare(b));
}

function collectTransitiveDependents(snapshot: RepositorySnapshot, filePath: string): string[] {
  const seen = new Set<string>();
  const queue = importedBy(snapshot, filePath);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || seen.has(current)) continue;
    seen.add(current);

    for (const dependent of importedBy(snapshot, current)) {
      if (!seen.has(dependent)) queue.push(dependent);
    }
  }

  for (const direct of importedBy(snapshot, filePath)) seen.delete(direct);
  return [...seen].sort((a, b) => a.localeCompare(b));
}

function parseFilesChanged(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function dedupeTraceHits(hits: TraceHit[]): TraceHit[] {
  const seen = new Set<string>();
  const result: TraceHit[] = [];

  for (const hit of hits) {
    const key = [hit.kind, hit.filePath, hit.lineNumber ?? "", hit.detail].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(hit);
  }

  return result;
}

function toPosixPath(value: string): string {
  return value.split(path.sep).join("/");
}
