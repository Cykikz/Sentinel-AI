"use client";

import { Activity, GitBranch, Radio } from "lucide-react";
import { AgentBoard } from "../components/agents/AgentBoard";
import { AgentLog } from "../components/agents/AgentLog";
import { FindingsList } from "../components/findings/FindingsList";
import { DiffViewer } from "../components/findings/DiffViewer";
import { HealthHistory } from "../components/health/HealthHistory";
import { HealthRing } from "../components/health/HealthRing";
import { ScoreBreakdown } from "../components/health/ScoreBreakdown";
import { Header } from "../components/layout/Header";
import { StatusBar } from "../components/layout/StatusBar";
import { useSSE } from "../hooks/useSSE";
import { useDashboardStore } from "../store/dashboard.store";

export default function DashboardPage() {
  useSSE();
  const { connected, findings, healthScore, lastScan, projectRoot } = useDashboardStore();

  return (
    <main className="shell">
      <Header connected={connected} projectRoot={projectRoot} />
      <StatusBar />

      <section className="overview">
        <div className="metric">
          <Activity size={18} />
          <span>Health</span>
          <strong>{healthScore}/100</strong>
        </div>
        <div className="metric">
          <Radio size={18} />
          <span>Findings</span>
          <strong>{findings.length}</strong>
        </div>
        <div className="metric">
          <GitBranch size={18} />
          <span>Last scan</span>
          <strong>{lastScan ? `#${lastScan.id}` : "none"}</strong>
        </div>
      </section>

      <section className="dashboard-grid">
        <div className="left-rail">
          <HealthRing score={healthScore} />
          <ScoreBreakdown findings={findings} />
          <HealthHistory />
        </div>
        <div className="main-stack">
          <AgentBoard />
          <FindingsList />
        </div>
        <div className="right-rail">
          <AgentLog />
          <DiffViewer />
        </div>
      </section>
    </main>
  );
}
