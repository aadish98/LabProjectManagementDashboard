import type { ReactNode } from "react";

export type SyncState = "idle" | "syncing" | "synced" | "stale" | "error";

export interface SyncStatusProps {
  state: SyncState;
  lastSyncedAt?: Date | string | number | null;
  label?: ReactNode;
  formatTime?: (date: Date) => ReactNode;
  className?: string;
}

const DEFAULT_LABELS: Record<SyncState, string> = {
  idle: "Not yet synced",
  syncing: "Syncing changes",
  synced: "Up to date",
  stale: "Data may be out of date",
  error: "Sync failed"
};

const defaultFormatter = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit"
});

export function SyncStatus({
  state,
  lastSyncedAt,
  label,
  formatTime = (date) => defaultFormatter.format(date),
  className
}: SyncStatusProps) {
  const parsedDate =
    lastSyncedAt === null || lastSyncedAt === undefined
      ? null
      : new Date(lastSyncedAt);
  const validDate = parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : null;
  const isError = state === "error";
  const isStale = state === "stale";

  return (
    <div
      className={["ui-sync-status", `ui-sync-status--${state}`, className]
        .filter(Boolean)
        .join(" ")}
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      aria-atomic="true"
      aria-busy={state === "syncing"}
      data-stale={isStale || undefined}
    >
      <span className="ui-sync-status__label">{label ?? DEFAULT_LABELS[state]}</span>
      {validDate ? (
        <span className="ui-sync-status__time">
          {" "}
          <span>Last synced </span>
          <time dateTime={validDate.toISOString()} title={validDate.toLocaleString()}>
            {formatTime(validDate)}
          </time>
        </span>
      ) : null}
    </div>
  );
}
