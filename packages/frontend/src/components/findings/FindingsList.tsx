"use client";

import { ShieldAlert } from "lucide-react";
import { useDashboardStore } from "../../store/dashboard.store";

const SEVERITY_LABEL: Record<string, string> = {
  CRITICAL: "critical",
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
};

export function FindingsList() {
  const findings = useDashboardStore((state) => state.findings);

  return (
    <section className="section-panel findings-panel">
      <div className="section-heading">
        <h2>
          <ShieldAlert size={18} />
          Findings
        </h2>
        <span>{findings.length} total</span>
      </div>
      <div className="findings-list">
        {findings.length === 0 ? (
          <p className="muted">No findings loaded</p>
        ) : (
          findings.map((finding) => (
            <article className="finding-card" key={finding.id}>
              <div className="finding-top">
                <span className={`severity ${finding.severity.toLowerCase()}`}>
                  {SEVERITY_LABEL[finding.severity] ?? finding.severity.toLowerCase()}
                </span>
                <span>{finding.agent}</span>
                <span>{finding.verificationStatus.toLowerCase()}</span>
              </div>
              <h3>{finding.description}</h3>
              <p>
                {finding.filePath}
                {finding.lineNumber ? `:${finding.lineNumber}` : ""}
              </p>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
