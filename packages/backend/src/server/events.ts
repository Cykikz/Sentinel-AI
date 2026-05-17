import { EventEmitter } from "node:events";
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { getMemoryPaths } from "../memory/db.js";

export type AgentStatus = "idle" | "running" | "complete" | "failed";

export interface DashboardFinding {
  id: number;
  scanId: number;
  agent: string;
  severity: string;
  category: string;
  filePath: string;
  lineNumber: number | null;
  description: string;
  fixApplied: boolean;
  confidence: number | null;
  verificationStatus: string;
}

export type DashboardEvent =
  | {
      type: "agent";
      agent: string;
      status: AgentStatus;
      message?: string;
      timestamp: number;
    }
  | {
      type: "agent_status";
      agent: string;
      status: AgentStatus;
      message?: string;
      timestamp: number;
    }
  | {
      type: "finding";
      finding: DashboardFinding;
      timestamp: number;
    }
  | {
      type: "health";
      score: number;
      timestamp: number;
    }
  | {
      type: "health_update";
      score: number;
      timestamp: number;
    }
  | {
      type: "log";
      message: string;
      timestamp: number;
    };

const bus = new EventEmitter();

export function dashboardEventsPath(projectRoot: string): string {
  const paths = getMemoryPaths(projectRoot);
  return path.join(paths.sentinelDir, "events.jsonl");
}

export function emitDashboardEvent(projectRoot: string, event: DashboardEvent): void {
  const paths = getMemoryPaths(projectRoot);
  const normalized = normalizeEvent(event);
  mkdirSync(paths.sentinelDir, { recursive: true });
  appendFileSync(dashboardEventsPath(projectRoot), `${JSON.stringify(normalized)}\n`, "utf8");
  appendFileSync(
    path.join(paths.sentinelDir, "dashboard-events.jsonl"),
    `${JSON.stringify(normalized)}\n`,
    "utf8",
  );
  bus.emit("event", normalized);
}

export function subscribeDashboardEvents(
  listener: (event: DashboardEvent) => void,
): () => void {
  bus.on("event", listener);
  return () => bus.off("event", listener);
}

export interface EventCursor {
  offset: number;
}

export function createEventCursor(projectRoot: string): EventCursor {
  const filePath = dashboardEventsPath(projectRoot);
  return { offset: existsSync(filePath) ? statSync(filePath).size : 0 };
}

export function readNewDashboardEvents(
  projectRoot: string,
  cursor: EventCursor,
): DashboardEvent[] {
  const filePath = dashboardEventsPath(projectRoot);
  if (!existsSync(filePath)) return [];

  const content = readFileSync(filePath, "utf8");
  const chunk = content.slice(cursor.offset);
  cursor.offset = Buffer.byteLength(content, "utf8");

  return chunk
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [normalizeEvent(JSON.parse(line) as DashboardEvent)];
      } catch {
        return [];
      }
    });
}

function normalizeEvent(event: DashboardEvent): DashboardEvent {
  if (event.type === "agent") {
    return { ...event, type: "agent_status" };
  }

  if (event.type === "health") {
    return { ...event, type: "health_update" };
  }

  return event;
}
