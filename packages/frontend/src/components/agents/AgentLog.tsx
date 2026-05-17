"use client";

import { Terminal } from "lucide-react";
import { useDashboardStore } from "../../store/dashboard.store";

export function AgentLog() {
  const logs = useDashboardStore((state) => state.logs);

  return (
    <section className="section-panel log-panel">
      <div className="section-heading">
        <h2>
          <Terminal size={17} />
          Live Log
        </h2>
      </div>
      <div className="log-list">
        {logs.length === 0 ? (
          <p className="muted">No events yet</p>
        ) : (
          logs.map((log, index) => (
            <div className="log-line" key={`${log.timestamp}-${index}`}>
              <time>{new Date(log.timestamp).toLocaleTimeString()}</time>
              <span>{log.message}</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
