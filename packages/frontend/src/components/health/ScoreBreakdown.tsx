import type { DashboardFinding } from "../../types/dashboard";

interface ScoreBreakdownProps {
  findings: DashboardFinding[];
}

const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

export function ScoreBreakdown({ findings }: ScoreBreakdownProps) {
  return (
    <section className="section-panel">
      <div className="section-heading">
        <h2>Severity</h2>
      </div>
      <div className="severity-list">
        {SEVERITIES.map((severity) => (
          <div className="severity-row" key={severity}>
            <span className={`dot ${severity.toLowerCase()}`} />
            <span>{severity}</span>
            <strong>{findings.filter((finding) => finding.severity === severity).length}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
