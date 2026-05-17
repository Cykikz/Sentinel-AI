import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { refreshRepositoryGraph, startRepositoryWatcher } from "../src/watcher/file-watcher.js";

const tempRoot = mkdtempSync(path.join(tmpdir(), "sentinel-watcher-"));

try {
  writeFileSync(
    path.join(tempRoot, "package.json"),
    `${JSON.stringify({ dependencies: { express: "^4.0.0" } }, null, 2)}\n`,
  );
  writeFileSync(path.join(tempRoot, "index.js"), "const auth = require('./auth');\n");
  writeFileSync(path.join(tempRoot, "auth.js"), "module.exports = {};\n");

  const initial = await refreshRepositoryGraph(tempRoot);
  if (initial.snapshot.sourceFiles !== 2) {
    throw new Error(`Expected 2 source files, got ${initial.snapshot.sourceFiles}`);
  }

  const changePromise = new Promise<void>((resolve, reject) => {
    const watcher = startRepositoryWatcher({
      projectRoot: tempRoot,
      intervalMs: 250,
      initialScan: false,
      onEvent: (event) => {
        if (event.type === "changes") {
          watcher.stop();
          if (!event.changes.some((change) => change.path === "index.js")) {
            reject(new Error("Expected watcher to detect index.js change"));
            return;
          }
          resolve();
        }

        if (event.type === "error") {
          watcher.stop();
          reject(new Error(event.message));
        }
      },
    });

    watcher.ready
      .then(() => {
        writeFileSync(path.join(tempRoot, "index.js"), "const auth = require('./auth');\nconsole.log(auth);\n");
      })
      .catch(reject);
  });

  await withTimeout(changePromise, 5000);
  console.log("WATCHER smoke test: OK");
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Watcher test timed out")), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error: unknown) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}
