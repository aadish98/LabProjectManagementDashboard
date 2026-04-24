import type { ReactNode } from "react";

interface MetricCardProps {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "danger" | "success";
  icon?: ReactNode;
}

export function MetricCard({
  label,
  value,
  hint,
  tone = "default",
  icon
}: MetricCardProps) {
  return (
    <article className={`metric-card metric-card--${tone}`}>
      <div className="metric-card__header">
        <span>{label}</span>
        {icon ? <span className="metric-card__icon">{icon}</span> : null}
      </div>
      <strong className="metric-card__value">{value}</strong>
      {hint ? <p className="metric-card__hint">{hint}</p> : null}
    </article>
  );
}
