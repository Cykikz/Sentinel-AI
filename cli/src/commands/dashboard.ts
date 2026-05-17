import { Command } from "commander";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startDashboardServer } from "../../../packages/backend/src/server/index.js";

export const dashboardCommand = new Command("dashboard")
  .description("Start live dashboard backend and frontend")
  .option("--target <path>", "Repository path to inspect", process.cwd())
  .option("--backend-port <port>", "Backend SSE port", "7890")
  .option("--frontend-port <port>", "Frontend Next.js port", "3000")
  .action((opts: { target: string; backendPort: string; frontendPort: string }) => {
    const backendPort = Number(opts.backendPort);
    const frontendPort = Number(opts.frontendPort);
    const projectRoot = path.resolve(opts.target);
    const repoRoot = resolveRepoRoot();
    const backend = startDashboardServer({ projectRoot, port: backendPort });
    const frontend = startFrontend(repoRoot, backendPort, frontendPort);

    console.log(`Backend:  http://localhost:${backend.port}`);
    console.log(`Frontend: http://localhost:${frontendPort}`);
    console.log(`Project:  ${backend.projectRoot}`);
    console.log("Run scan in another terminal: sentinel scan --deep --target <repo>");

    const shutdown = () => {
      backend.server.close();
      if (frontend.pid) frontend.kill();
    };

    process.once("SIGINT", () => {
      shutdown();
      process.exit(0);
    });
    process.once("SIGTERM", () => {
      shutdown();
      process.exit(0);
    });
  });

function startFrontend(repoRoot: string, backendPort: number, frontendPort: number): ChildProcess {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  return spawn(
    npmCommand,
    ["run", "start", "-w", "packages/frontend", "--", "--port", String(frontendPort)],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        NEXT_PUBLIC_BACKEND_URL: `http://localhost:${backendPort}`,
      },
      stdio: "inherit",
    },
  );
}

function resolveRepoRoot(): string {
  const current = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(current, "..", "..", ".."),
    path.resolve(current, "..", "..", "..", ".."),
    path.resolve(current, "..", "..", "..", "..", ".."),
    process.cwd(),
  ];
  return candidates.find((candidate) => candidate.endsWith("sentinelai")) ?? process.cwd();
}
