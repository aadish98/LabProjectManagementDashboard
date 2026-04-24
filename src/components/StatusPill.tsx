import type { NormalizedStatus } from "../domain/experiment";

interface StatusPillProps {
  label: string;
  normalizedStatus: NormalizedStatus;
}

export function StatusPill({ label, normalizedStatus }: StatusPillProps) {
  return (
    <span className={`status-pill status-pill--${normalizedStatus}`}>
      {label || "Unknown"}
    </span>
  );
}
