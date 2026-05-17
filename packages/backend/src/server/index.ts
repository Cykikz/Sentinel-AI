import express from "express";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createDashboardRouter } from "./routes.js";

export interface DashboardServerOptions {
  projectRoot?: string;
  port?: number;
}

export function startDashboardServer(options: DashboardServerOptions = {}) {
  const projectRoot = path.resolve(options.projectRoot ?? process.cwd());
  const port = options.port ?? Number(process.env.BACKEND_PORT ?? 7890);
  const app = express();

  app.use(express.json());
  app.use((_request, response, next) => {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (_request.method === "OPTIONS") {
      response.sendStatus(204);
      return;
    }

    next();
  });
  app.use(createDashboardRouter(projectRoot));
  app.use((_request, response) => {
    response.status(404).json({ error: "Not found" });
  });

  const server = app.listen(port);
  return { app, server, port, projectRoot };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const targetIndex = process.argv.indexOf("--target");
  const portIndex = process.argv.indexOf("--port");
  const projectRoot = targetIndex >= 0 ? process.argv[targetIndex + 1] : process.cwd();
  const port = portIndex >= 0 ? Number(process.argv[portIndex + 1]) : undefined;
  const started = startDashboardServer({ projectRoot, port });

  console.log(`SentinelAI backend listening on http://localhost:${started.port}`);
  console.log(`Project: ${started.projectRoot}`);
}
