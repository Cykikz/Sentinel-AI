import chokidar, { type FSWatcher } from "chokidar";
import { glob } from "glob";
import ignore from "ignore";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runScout } from "../agents/01-scout.js";
import { SentinelMemory, getMemoryPaths } from "../memory/db.js";
import {
  extractImportSpecifiers,
  isSourceFile,
  sourceExtensions,
} from "../parser/ast-parser.js";
import { emitDashboardEvent } from "../server/events.js";
import type { RepositorySnapshot } from "../types/index.js";

export type FileChangeType = "created" | "modified" | "deleted";

export interface WatchedFileChange {
  path: string;
  type: FileChangeType;
}

export interface WatcherOptions {
  projectRoot?: string;
  intervalMs?: number;
  initialScan?: boolean;
  onEvent?: (event: WatcherEvent) => void;
}

export type WatcherEvent =
  | {
      type: "ready";
      files: number;
      timestamp: number;
    }
  | {
      type: "changes";
      changes: WatchedFileChange[];
      snapshot: RepositorySnapshot;
      scanId: number;
      timestamp: number;
    }
  | {
      type: "error";
      message: string;
      timestamp: number;
    };

export interface RepositoryWatcher {
  readonly projectRoot: string;
  readonly intervalMs: number;
  ready: Promise<void>;
  stop: () => void;
}

interface FileFingerprint {
  mtimeMs: number;
  size: number;
}

const DEFAULT_DEBOUNCE_MS = 500;

const DEFAULT_IGNORES = [
  ".git/**",
  ".sentinel/**",
  "dist/**",
  "node_modules/**",
  "coverage/**",
  ".next/**",
  "build/**",
];

export async function refreshRepositoryGraph(
  projectRoot = process.cwd(),
  changes: WatchedFileChange[] = [],
): Promise<{
  scanId: number;
  snapshot: RepositorySnapshot;
}> {
  const resolvedRoot = path.resolve(projectRoot);
  const memory = new SentinelMemory(resolvedRoot);

  try {
    const scan = memory.createScan({
      scanType: "manual",
    });
    const existing = memory.getLatestRepositorySnapshot();
    const snapshot =
      existing && changes.length > 0
        ? refreshIncrementalGraph(memory, resolvedRoot, existing, changes, scan.id)
        : await runScout({ projectRoot: resolvedRoot, scanId: scan.id });

    memory.updateScanSummary(scan.id, {
      filesScanned: snapshot.totalFiles,
      issuesFound: 0,
    });

    writeWatcherState(resolvedRoot, {
      lastRefresh: snapshot.timestamp,
      scanId: scan.id,
      totalFiles: snapshot.totalFiles,
      sourceFiles: snapshot.sourceFiles,
    });

    return { scanId: scan.id, snapshot };
  } finally {
    memory.close();
  }
}

export function startRepositoryWatcher(options: WatcherOptions = {}): RepositoryWatcher {
  const projectRoot = path.resolve(options.projectRoot ?? process.cwd());
  const intervalMs = Math.max(100, options.intervalMs ?? DEFAULT_DEBOUNCE_MS);
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;
  let refreshing = false;
  const pendingChanges = new Map<string, WatchedFileChange>();
  const matcher = createIgnoreMatcher(projectRoot);

  const emit = (event: WatcherEvent): void => {
    options.onEvent?.(event);
  };

  const flush = async (): Promise<void> => {
    if (stopped || refreshing || pendingChanges.size === 0) return;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }

    refreshing = true;
    const changes = [...pendingChanges.values()].sort((a, b) => a.path.localeCompare(b.path));
    pendingChanges.clear();

    try {
      const { scanId, snapshot } = await refreshRepositoryGraph(projectRoot, changes);
      emitDashboardEvent(projectRoot, {
        type: "log",
        message: `Watcher refreshed graph after ${changes.length} file change(s)`,
        timestamp: Date.now(),
      });
      emit({
        type: "changes",
        changes,
        snapshot,
        scanId,
        timestamp: Date.now(),
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      emit({ type: "error", message, timestamp: Date.now() });
      emitDashboardEvent(projectRoot, {
        type: "log",
        message: `Watcher error: ${message}`,
        timestamp: Date.now(),
      });
    } finally {
      refreshing = false;
      if (pendingChanges.size > 0) scheduleFlush();
    }
  };

  const scheduleFlush = (): void => {
    if (stopped || timer || refreshing) return;
    timer = setTimeout(() => {
      void flush();
    }, intervalMs);
  };

  const enqueueChange = (type: FileChangeType, changedPath: string): void => {
    if (stopped) return;

    const relative = toPosixPath(path.relative(projectRoot, changedPath));
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return;
    if (matcher.ignores(relative)) return;

    const existing = pendingChanges.get(relative);
    const nextType = existing?.type === "created" && type === "modified" ? "created" : type;
    pendingChanges.set(relative, { path: relative, type: nextType });
    scheduleFlush();
  };

  const watcher: FSWatcher = chokidar.watch(projectRoot, {
    ignored: (candidatePath: string) => {
      const relative = toPosixPath(path.relative(projectRoot, candidatePath));
      return Boolean(relative && !relative.startsWith("..") && matcher.ignores(relative));
    },
    ignoreInitial: true,
    persistent: true,
    awaitWriteFinish: {
      stabilityThreshold: 150,
      pollInterval: 50,
    },
  });

  watcher.on("add", (filePath) => enqueueChange("created", filePath));
  watcher.on("change", (filePath) => enqueueChange("modified", filePath));
  watcher.on("unlink", (filePath) => enqueueChange("deleted", filePath));
  watcher.on("error", (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    emit({ type: "error", message, timestamp: Date.now() });
    emitDashboardEvent(projectRoot, {
      type: "log",
      message: `Watcher error: ${message}`,
      timestamp: Date.now(),
    });
  });

  const ready = new Promise<void>((resolve) => {
    watcher.once("ready", () => {
      void (async () => {
        try {
          const index = await buildFileIndex(projectRoot);

          if (options.initialScan ?? true) {
            const { scanId, snapshot } = await refreshRepositoryGraph(projectRoot);
            emitDashboardEvent(projectRoot, {
              type: "log",
              message: `Watcher initialized repository graph in scan ${scanId}`,
              timestamp: Date.now(),
            });
            emit({ type: "ready", files: snapshot.totalFiles, timestamp: Date.now() });
          } else {
            emit({ type: "ready", files: index.size, timestamp: Date.now() });
          }
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          emit({ type: "error", message, timestamp: Date.now() });
          emitDashboardEvent(projectRoot, {
            type: "log",
            message: `Watcher failed: ${message}`,
            timestamp: Date.now(),
          });
        } finally {
          resolve();
        }
      })();
    });
  });

  return {
    projectRoot,
    intervalMs,
    ready,
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      void watcher.close();
    },
  };
}

function createIgnoreMatcher(projectRoot: string): ReturnType<typeof ignore> {
  const matcher = ignore().add(DEFAULT_IGNORES);
  const gitignorePath = path.join(projectRoot, ".gitignore");

  if (existsSync(gitignorePath)) {
    matcher.add(readFileSync(gitignorePath, "utf8"));
  }

  return matcher;
}

async function buildFileIndex(projectRoot: string): Promise<Map<string, FileFingerprint>> {
  const matcher = createIgnoreMatcher(projectRoot);

  const files = await glob("**/*", {
    cwd: projectRoot,
    nodir: true,
    dot: true,
    windowsPathsNoEscape: true,
  });

  const index = new Map<string, FileFingerprint>();

  for (const file of files.map(toPosixPath).filter((file) => !matcher.ignores(file))) {
    const absolutePath = path.join(projectRoot, file);
    const stats = statSync(absolutePath);
    index.set(file, {
      mtimeMs: stats.mtimeMs,
      size: stats.size,
    });
  }

  return index;
}

function writeWatcherState(
  projectRoot: string,
  state: {
    lastRefresh: number;
    scanId: number;
    totalFiles: number;
    sourceFiles: number;
  },
): void {
  const paths = getMemoryPaths(projectRoot);
  writeFileSync(path.join(paths.sentinelDir, "watcher-state.json"), `${JSON.stringify(state, null, 2)}\n`);
}

function toPosixPath(value: string): string {
  return value.split(path.sep).join("/");
}

function refreshIncrementalGraph(
  memory: SentinelMemory,
  projectRoot: string,
  previous: RepositorySnapshot,
  changes: WatchedFileChange[],
  scanId: number,
): RepositorySnapshot {
  const graph: Record<string, string[]> = { ...previous.dependencyGraph };
  const sourceSet = new Set(Object.keys(graph));

  for (const change of changes) {
    const relative = toPosixPath(change.path);
    const absolute = path.join(projectRoot, relative);

    if (change.type === "deleted" || !existsSync(absolute) || !isSourceFile(relative)) {
      delete graph[relative];
      sourceSet.delete(relative);
      for (const imports of Object.values(graph)) {
        const index = imports.indexOf(relative);
        if (index >= 0) imports.splice(index, 1);
      }
      continue;
    }

    sourceSet.add(relative);
    const content = readFileSync(absolute, "utf8");
    graph[relative] = extractImportSpecifiers(content, relative)
      .map((specifier) => resolveLocalImport(projectRoot, relative, specifier, sourceSet))
      .filter((resolved): resolved is string => Boolean(resolved))
      .sort((a, b) => a.localeCompare(b));
  }

  const importedBy = buildImportedBy(graph);
  const sourceFiles = Object.keys(graph).sort((a, b) => a.localeCompare(b));
  const snapshot: RepositorySnapshot = {
    scanId,
    timestamp: Date.now(),
    rootPath: projectRoot,
    framework: previous.framework,
    totalFiles: Math.max(0, previous.totalFiles + countFileDelta(changes)),
    sourceFiles: sourceFiles.length,
    orphanedFiles: sourceFiles.filter((file) => !importedBy[file]?.length),
    highRiskFiles: [...sourceFiles]
      .sort((a, b) => scoreFile(b, graph, importedBy) - scoreFile(a, graph, importedBy))
      .slice(0, 10)
      .filter((file) => scoreFile(file, graph, importedBy) > 0),
    dependencyGraph: graph,
  };

  return memory.saveRepositorySnapshot(snapshot);
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

function countFileDelta(changes: WatchedFileChange[]): number {
  return changes.reduce((total, change) => {
    if (change.type === "created") return total + 1;
    if (change.type === "deleted") return total - 1;
    return total;
  }, 0);
}
