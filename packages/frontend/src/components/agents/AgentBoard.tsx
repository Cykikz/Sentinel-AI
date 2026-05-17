"use client";

import { AgentCard } from "./AgentCard";
import { useDashboardStore } from "../../store/dashboard.store";

const ORDER = [
  "scout",
  "ghost-hunter",
  "prism",
  "architect",
  "domino",
  "verifier",
  "fixer",
  "narrator",
];

export function AgentBoard() {
  const agents = useDashboardStore((state) => state.agents);

  return (
    <section className="section-panel">
      <div className="section-heading">
        <h2>Agent Board</h2>
        <span>8-agent runtime</span>
      </div>
      <div className="agent-grid">
        {ORDER.map((id) => (
          <AgentCard key={id} agent={agents[id] ?? { id, status: "idle" }} />
        ))}
      </div>
    </section>
  );
}
