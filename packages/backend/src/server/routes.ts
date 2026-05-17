import { Router, type Response } from "express";
import {
  createEventCursor,
  readNewDashboardEvents,
  type DashboardEvent,
} from "./events.js";
import { readDashboardSnapshot } from "./data.js";
import { SentinelMemory } from "../memory/db.js";

export function createDashboardRouter(projectRoot: string): Router {
  const router = Router();

  router.get("/health", (_request, response) => {
    response.json({ status: "ok", projectRoot });
  });

  router.get("/snapshot", (_request, response) => {
    response.json(readDashboardSnapshot(projectRoot));
  });

  router.get("/findings", (_request, response) => {
    response.json(readDashboardSnapshot(projectRoot).findings);
  });

  router.get("/history", (_request, response) => {
    const memory = new SentinelMemory(projectRoot);
    try {
      response.json({
        commits: memory.getGitHistory(50),
        contributors: memory.getContributors(20),
      });
    } finally {
      memory.close();
    }
  });

  router.get("/events", (_request, response) => {
    streamEvents(response, projectRoot);
  });

  return router;
}

function streamEvents(response: Response, projectRoot: string): void {
  response.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });

  const send = (event: DashboardEvent | { type: "snapshot"; snapshot: unknown }) => {
    response.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  send({ type: "snapshot", snapshot: readDashboardSnapshot(projectRoot) });

  const cursor = createEventCursor(projectRoot);
  const poll = setInterval(() => {
    for (const event of readNewDashboardEvents(projectRoot, cursor)) {
      send(event);
    }
  }, 1000);

  response.on("close", () => {
    clearInterval(poll);
  });
}
