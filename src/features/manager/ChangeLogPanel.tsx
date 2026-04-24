import { useMemo } from "react";
import type { ExperimentRecord } from "../../domain/experiment";
import type { ManagerLastRun, ManagerSnapshot, ManagerSnapshotRecord } from "../../services/cache";
import { formatDateLabel } from "../../utils/date";

interface ChangeLogPanelProps {
  experiments: ExperimentRecord[];
  previousSnapshot: ManagerSnapshot | null;
  lastRun: ManagerLastRun | null;
  scopeLabel: string;
}

const TRACKED_FIELDS: Array<{
  key: keyof ManagerSnapshotRecord;
  label: string;
}> = [
  { key: "status", label: "Status" },
  { key: "projectedEndDateRaw", label: "Projected end" },
  { key: "startDateRaw", label: "Start date" },
  { key: "timeEstimate", label: "Time estimate" },
  { key: "schematic", label: "Schematic" },
  { key: "result", label: "Result" },
  { key: "dataLink", label: "Link to data" },
  { key: "comments", label: "Comments" },
  { key: "project", label: "Project" },
  { key: "experiment", label: "Experiment" }
];

export function buildSnapshotFromExperiments(
  experiments: ExperimentRecord[]
): ManagerSnapshot {
  return {
    takenAt: new Date().toISOString(),
    experiments: experiments.map((record) => ({
      id: record.id,
      rowNumber: record.rowNumber ?? null,
      labMember: record.labMember,
      project: record.project,
      experiment: record.experiment,
      status: record.status,
      startDateRaw: record.startDateRaw,
      projectedEndDateRaw: record.projectedEndDateRaw,
      timeEstimate: record.timeEstimate,
      schematic: record.schematic,
      result: record.result,
      dataLink: record.dataLink,
      comments: record.comments,
      notebookLocation: record.notebookLocation
    }))
  };
}

interface ChangeEntry {
  kind: "added" | "removed" | "changed";
  labMember: string;
  experimentLabel: string;
  fields?: Array<{ field: string; before: string; after: string }>;
}

function diff(
  current: ExperimentRecord[],
  previous: ManagerSnapshot | null
): ChangeEntry[] {
  if (!previous) return [];

  const currentById = new Map(current.map((record) => [record.id, record] as const));
  const previousById = new Map(
    previous.experiments.map((record) => [record.id, record] as const)
  );

  const entries: ChangeEntry[] = [];

  for (const [id, record] of currentById) {
    if (!previousById.has(id)) {
      entries.push({
        kind: "added",
        labMember: record.labMember,
        experimentLabel: record.experiment || "(Untitled experiment)"
      });
    }
  }

  for (const [id, record] of previousById) {
    if (!currentById.has(id)) {
      entries.push({
        kind: "removed",
        labMember: record.labMember,
        experimentLabel: record.experiment || "(Untitled experiment)"
      });
    }
  }

  for (const [id, currentRecord] of currentById) {
    const previousRecord = previousById.get(id);
    if (!previousRecord) continue;
    const fieldChanges: Array<{ field: string; before: string; after: string }> = [];
    for (const { key, label } of TRACKED_FIELDS) {
      const before = String(previousRecord[key] ?? "").trim();
      const after = String((currentRecord as unknown as Record<string, unknown>)[key] ?? "").trim();
      if (before !== after) {
        fieldChanges.push({ field: label, before, after });
      }
    }
    if (fieldChanges.length > 0) {
      entries.push({
        kind: "changed",
        labMember: currentRecord.labMember,
        experimentLabel: currentRecord.experiment || "(Untitled experiment)",
        fields: fieldChanges
      });
    }
  }

  return entries;
}

export function ChangeLogPanel({
  experiments,
  previousSnapshot,
  lastRun,
  scopeLabel
}: ChangeLogPanelProps) {
  const entries = useMemo(
    () => diff(experiments, previousSnapshot),
    [experiments, previousSnapshot]
  );

  const grouped = useMemo(() => {
    const map = new Map<string, ChangeEntry[]>();
    for (const entry of entries) {
      const list = map.get(entry.labMember) ?? [];
      list.push(entry);
      map.set(entry.labMember, list);
    }
    return Array.from(map.entries()).sort((left, right) => left[0].localeCompare(right[0]));
  }, [entries]);

  return (
    <section className="panel stack-md">
      <div className="panel__header">
        <div>
          <h2>Change log</h2>
          <p className="muted-row">{scopeLabel}</p>
        </div>
        <div className="muted-row change-log__meta">
          {previousSnapshot ? (
            <span>Previous snapshot {formatDateLabel(previousSnapshot.takenAt)}</span>
          ) : (
            <span>No previous snapshot yet — run summary to start tracking changes.</span>
          )}
          {lastRun ? (
            <span>
              Last refresh {formatDateLabel(lastRun.ranAt)} ({(lastRun.durationMs / 1000).toFixed(1)}s)
            </span>
          ) : null}
        </div>
      </div>

      {!previousSnapshot ? (
        <p className="empty-state">
          The first time you run a summary, this panel starts comparing each refresh against the
          previous one so you can review week-over-week progress.
        </p>
      ) : entries.length === 0 ? (
        <p className="empty-state">Nothing has changed since the last refresh.</p>
      ) : (
        <div className="change-log__list">
          {grouped.map(([labMember, items]) => (
            <article key={labMember} className="change-log__group">
              <header>
                <strong>{labMember}</strong>
                <span className="muted-row">{items.length} change{items.length === 1 ? "" : "s"}</span>
              </header>
              <ul>
                {items.map((entry, idx) => (
                  <li key={`${labMember}-${idx}`}>
                    {entry.kind === "added" ? (
                      <span>
                        <span className="badge badge--success">added</span> {entry.experimentLabel}
                      </span>
                    ) : entry.kind === "removed" ? (
                      <span>
                        <span className="badge badge--danger">removed</span> {entry.experimentLabel}
                      </span>
                    ) : (
                      <div className="stack-xs">
                        <span>
                          <span className="badge badge--warn">updated</span> {entry.experimentLabel}
                        </span>
                        <ul className="change-log__fields">
                          {entry.fields?.map((change) => (
                            <li key={change.field}>
                              <strong>{change.field}:</strong>{" "}
                              <span className="muted-row">
                                {change.before || "(empty)"}
                              </span>{" "}
                              → <span>{change.after || "(empty)"}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
