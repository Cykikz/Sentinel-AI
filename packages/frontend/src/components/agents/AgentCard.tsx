import { AlertTriangle, Check, Circle, Loader2 } from "lucide-react";
import type { AgentState } from "../../types/dashboard";

const LABELS: Record<string, string> = {
  scout: "SCOUT",
  "ghost-hunter": "GHOST",
  prism: "PRISM",
  architect: "ARCHITECT",
  domino: "DOMINO",
  verifier: "VERIFIER",
  fixer: "FIXER",
  narrator: "NARRATOR",
};

interface AgentCardProps {
  agent: AgentState;
}

export function AgentCard({ agent }: AgentCardProps) {
  const Icon =
    agent.status === "running"
      ? Loader2
      : agent.status === "complete"
        ? Check
        : agent.status === "failed"
          ? AlertTriangle
          : Circle;

  return (
    <article className={`agent-card ${agent.status}`}>
      <div className="agent-icon">
        <Icon size={18} className={agent.status === "running" ? "spin" : ""} />
      </div>
      <div>
        <h3>{LABELS[agent.id] ?? agent.id}</h3>
        <p>{agent.message ?? agent.status}</p>
      </div>
    </article>
  );
}
