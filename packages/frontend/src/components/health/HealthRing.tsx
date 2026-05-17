interface HealthRingProps {
  score: number;
}

export function HealthRing({ score }: HealthRingProps) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <section className="section-panel health-ring-panel">
      <div className="ring-wrap">
        <svg viewBox="0 0 140 140" aria-label={`Health score ${score}`}>
          <circle className="ring-bg" cx="70" cy="70" r={radius} />
          <circle
            className="ring-value"
            cx="70"
            cy="70"
            r={radius}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="ring-text">
          <strong>{score}</strong>
          <span>health</span>
        </div>
      </div>
    </section>
  );
}
