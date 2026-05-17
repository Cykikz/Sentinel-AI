"use client";

import { create } from "zustand";
import type {
  AgentState,
  DashboardEvent,
  DashboardFinding,
  DashboardSnapshot,
} from "../types/dashboard";

const AGENT_ORDER = [
  "scout",
  "ghost-hunter",
  "prism",
  "architect",
  "domino",
  "verifier",
  "fixer",
  "narrator",
];

interface DashboardState {
  projectRoot: string;
  connected: boolean;
  healthScore: number;
  lastScan: DashboardSnapshot["lastScan"];
  agents: Record<string, AgentState>;
  findings: DashboardFinding[];
  healthHistory: DashboardSnapshot["healthHistory"];
  logs: Array<{ message: string; timestamp: number }>;
  reportPreview: string;
  setConnected: (connected: boolean) => void;
  applySnapshot: (snapshot: DashboardSnapshot) => void;
  applyEvent: (event: DashboardEvent) => void;
}

function initialAgents(): Record<string, AgentState> {
  return Object.fromEntries(
    AGENT_ORDER.map((id) => [id, { id, status: "idle" as const }]),
  );
}

export const useDashboardStore = create<DashboardState>((set) => ({
  projectRoot: "",
  connected: false,
  healthScore: 100,
  lastScan: null,
  agents: initialAgents(),
  findings: [],
  healthHistory: [],
  logs: [],
  reportPreview: "",
  setConnected: (connected) => set({ connected }),
  applySnapshot: (snapshot) =>
    set(() => ({
      projectRoot: snapshot.projectRoot,
      healthScore: snapshot.healthScore,
      lastScan: snapshot.lastScan,
      findings: snapshot.findings,
      healthHistory: snapshot.healthHistory,
      reportPreview: snapshot.reportPreview,
      agents: {
        ...initialAgents(),
        ...Object.fromEntries(snapshot.agents.map((agent) => [agent.id, agent])),
      },
    })),
  applyEvent: (event) =>
    set((state) => {
      if (event.type === "snapshot") {
        return {
          projectRoot: event.snapshot.projectRoot,
          healthScore: event.snapshot.healthScore,
          lastScan: event.snapshot.lastScan,
          findings: event.snapshot.findings,
          healthHistory: event.snapshot.healthHistory,
          reportPreview: event.snapshot.reportPreview,
          agents: {
            ...initialAgents(),
            ...Object.fromEntries(event.snapshot.agents.map((agent) => [agent.id, agent])),
          },
        };
      }

      if (event.type === "agent" || event.type === "agent_status") {
        return {
          agents: {
            ...state.agents,
            [event.agent]: {
              id: event.agent,
              status: event.status,
              message: event.message,
              updatedAt: event.timestamp,
            },
          },
          logs: [{ message: event.message ?? `${event.agent} ${event.status}`, timestamp: event.timestamp }, ...state.logs].slice(0, 30),
        };
      }

      if (event.type === "finding") {
        const existing = state.findings.filter((finding) => finding.id !== event.finding.id);
        return {
          findings: [event.finding, ...existing].slice(0, 100),
        };
      }

      if (event.type === "health" || event.type === "health_update") {
        return {
          healthScore: event.score,
          healthHistory: [
            ...state.healthHistory,
            { score: event.score, timestamp: event.timestamp },
          ].slice(-40),
        };
      }

      return {
        logs: [{ message: event.message, timestamp: event.timestamp }, ...state.logs].slice(0, 30),
      };
    }),
}));
