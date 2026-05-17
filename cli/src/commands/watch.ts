import { Command } from "commander";
import {
  refreshRepositoryGraph,
  startRepositoryWatcher,
  type WatcherEvent,
} from "../../../packages/backend/src/watcher/file-watcher.js";

export interface WatchOptions {
  target: string;
  interval: string;
  once?: boolean;
  initialScan?: boolean;
}

export const watchCommand = new Command("watch")
  .description("Run Mode 1 silent watcher and keep local repository graph fresh")
  .option("--target <path>", "Repository path to watch", process.cwd())
  .option("--interval <ms>", "Polling interval in milliseconds", "2000")
  .option("--once", "Refresh repository graph once and exit")
  .option("--no-initial-scan", "Start watching without immediate graph refresh")
  .action(async (opts: WatchOptions) => {
    const intervalMs = Number.parseInt(opts.interval, 10);
    if (!Number.isFinite(intervalMs) || intervalMs < 250) {
      throw new Error("--interval must be a number >= 250");
    }

    if (opts.once) {
      const { scanId, snapshot } = await refreshRepositoryGraph(opts.target);
      console.log(`Watcher refresh complete: scan ${scanId}`);
      console.log(`Files mapped: ${snapshot.totalFiles}`);
      console.log(`Source files: ${snapshot.sourceFiles}`);
      console.log(`Snapshot ID: ${snapshot.id}`);
      return;
    }

    const watcher = startRepositoryWatcher({
      projectRoot: opts.target,
      intervalMs,
      initialScan: opts.initialScan,
      onEvent: logWatcherEvent,
    });

    process.once("SIGINT", () => {
      watcher.stop();
      console.log("Watcher stopped.");
      process.exitCode = 0;
    });

    process.once("SIGTERM", () => {
      watcher.stop();
      process.exitCode = 0;
    });

    await watcher.ready;
    console.log(`Watching ${watcher.projectRoot} every ${watcher.intervalMs}ms`);
  });

function logWatcherEvent(event: WatcherEvent): void {
  if (event.type === "ready") {
    console.log(`Watcher ready: ${event.files} files indexed`);
    return;
  }

  if (event.type === "changes") {
    console.log(`Watcher refresh complete: scan ${event.scanId}`);
    for (const change of event.changes.slice(0, 10)) {
      console.log(`- ${change.type} ${change.path}`);
    }
    if (event.changes.length > 10) {
      console.log(`- ... ${event.changes.length - 10} more`);
    }
    console.log(`Files mapped: ${event.snapshot.totalFiles}`);
    return;
  }

  console.log(`Watcher error: ${event.message}`);
}
