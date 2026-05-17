"use client";

import { Clock3, Database, ScanLine } from "lucide-react";
import { useDashboardStore } from "../../store/dashboard.store";

export function StatusBar() {
  const lastScan = useDashboardStore((state) => state.lastScan);
  const findings = useDashboardStore((state) => state.findings);
  const fixed = findings.filter((finding) => finding.fixApplied).length;

  return (
    <section className="status-strip">
      <span>
        <ScanLine size={16} />
        {lastScan ? `${lastScan.scanType} scan` : "no scan"}
      </span>
      <span>
        <Clock3 size={16} />
        {lastScan ? new Date(lastScan.timestamp).toLocaleTimeString() : "waiting"}
      </span>
      <span>
        <Database size={16} />
        {fixed}/{findings.length} fixed
      </span>
    </section>
  );
}
