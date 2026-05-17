"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useDashboardStore } from "../../store/dashboard.store";

export function HealthHistory() {
  const healthHistory = useDashboardStore((state) => state.healthHistory);
  const data = healthHistory.map((point) => ({
    time: new Date(point.timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
    score: point.score,
  }));

  return (
    <section className="section-panel chart-panel">
      <div className="section-heading">
        <h2>Health Trend</h2>
      </div>
      <div className="chart-frame">
        {data.length === 0 ? (
          <p className="muted">Run scan to build history</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <XAxis dataKey="time" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} width={30} />
              <Tooltip />
              <Line type="monotone" dataKey="score" stroke="#257a52" strokeWidth={3} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
