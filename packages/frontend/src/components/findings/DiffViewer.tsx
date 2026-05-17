"use client";

import { FileDiff } from "lucide-react";
import { useDashboardStore } from "../../store/dashboard.store";

export function DiffViewer() {
  const finding = useDashboardStore((state) =>
    state.findings.find((item) => item.fixApplied) ?? state.findings[0],
  );

  return (
    <section className="section-panel diff-panel">
      <div className="section-heading">
        <h2>
          <FileDiff size={17} />
          Fix Preview
        </h2>
      </div>
      {finding ? (
        <pre className="diff-box">
          <code>{`file: ${finding.filePath}
agent: ${finding.agent}
status: ${finding.fixApplied ? "fix recorded" : "pending review"}

- ${finding.description}
+ ${finding.fixApplied ? "Dry-run fix available in local memory" : "No safe fix applied yet"}`}</code>
        </pre>
      ) : (
        <p className="muted">No fix preview</p>
      )}
    </section>
  );
}
