import { useEffect, useMemo, useState } from "react";
import { evaluateCompliance } from "../../domain/compliance";
import type { EmployeeSheetPrefs, UserSession } from "../../domain/app";
import type { ExperimentDraft, ExperimentRecord, KanbanLane } from "../../domain/experiment";
import { formatDateLabel, parseTimelineDate } from "../../utils/date";
import { StatusPill } from "../../components/StatusPill";
import { SegmentedControl, SyncStatus, type SyncState } from "../../components/ui";
import { GanttView } from "../gantt/GanttView";
import {
  EmployeeTaskDialogs,
  type CompletionPayload,
  type EmployeeTaskDialogState,
  type OverduePayload
} from "./EmployeeTaskDialogs";
import { blankTaskDraft, taskDraftFromRecord } from "../tasks/taskFormFields";

export type { CompletionPayload, OverduePayload } from "./EmployeeTaskDialogs";

const LANE_DEFINITIONS: Array<{ key: KanbanLane; label: string; description: string }> = [
  { key: "inProgress", label: "In Progress", description: "Active work on track." },
  { key: "overdue", label: "Overdue", description: "Past projected end by 24h+." },
  { key: "planned", label: "Planned", description: "Scheduled or not yet started." },
  { key: "completed", label: "Completed", description: "Closed out and reported." }
];

type WorkspaceView = "kanban" | "gantt";

interface EmployeeWorkspaceProps {
  session: UserSession;
  labMember: string;
  prefs: EmployeeSheetPrefs;
  experiments: ExperimentRecord[];
  saving: boolean;
  onCreate: (draft: ExperimentDraft) => Promise<void>;
  onUpdate: (record: ExperimentRecord, draft: ExperimentDraft) => Promise<void>;
  onComplete: (payload: CompletionPayload) => Promise<void>;
  onResolveOverdue: (payload: OverduePayload) => Promise<void>;
  onChangePrefs: () => void;
  onReconnect: () => void;
  onSignOut: () => void;
  onRefresh?: () => void | Promise<unknown>;
  reconnecting: boolean;
  loading: boolean;
  lastSyncedAt?: string | null;
  staleReason?: string;
  variant?: "standalone" | "embedded";
}

function dateMeta(value: string, strategy: "first" | "last" = "first") {
  const raw = String(value ?? "").trim();
  const parsed = parseTimelineDate(value, strategy);
  return {
    label: raw && !parsed ? "Invalid format" : formatDateLabel(parsed ?? value),
    invalid: !!raw && !parsed
  };
}

interface TaskCardProps {
  record: ExperimentRecord;
  onEdit: () => void;
  onComplete: () => void;
  onResolveOverdue: () => void;
  disabled?: boolean;
}

function TaskCard({ record, onEdit, onComplete, onResolveOverdue, disabled = false }: TaskCardProps) {
  const compliance = evaluateCompliance(record);
  const startDate = dateMeta(record.startDateRaw, "first");
  const endDate = dateMeta(record.projectedEndDateRaw, "last");
  const dateWarnings = [
    startDate.invalid ? "Start date has an invalid format. Use YYYY-MM-DD or M/D/YYYY." : "",
    endDate.invalid ? "Projected end date has an invalid format. Use YYYY-MM-DD or M/D/YYYY." : ""
  ].filter(Boolean);
  const indicatorClass = compliance.isCompliant
    ? "compliance-dot compliance-dot--ok"
    : compliance.overdue
      ? "compliance-dot compliance-dot--danger"
      : "compliance-dot compliance-dot--warn";
  const indicatorLabel = compliance.isCompliant ? "Compliant" : compliance.feedback;

  return (
    <article className="kanban-card">
      <header className="kanban-card__header">
        <span className={indicatorClass} title={indicatorLabel} aria-label={indicatorLabel} />
        <StatusPill label={record.status} normalizedStatus={compliance.normalizedStatus} />
      </header>
      <h4 className="kanban-card__title">{record.experiment || "(Untitled experiment)"}</h4>
      <p className="kanban-card__project muted-row">{record.project || "(No project)"}</p>
      <dl className="kanban-card__meta">
        <div>
          <dt>Start</dt>
          <dd>{startDate.label}</dd>
        </div>
        <div>
          <dt>End</dt>
          <dd>{endDate.label}</dd>
        </div>
        <div>
          <dt>Estimate</dt>
          <dd>{record.timeEstimate || "—"}</dd>
        </div>
      </dl>
      {!compliance.isCompliant ? (
        <p className="kanban-card__feedback">{compliance.feedback}</p>
      ) : null}
      {dateWarnings.map((warning) => (
        <p className="kanban-card__date-warning" key={warning}>
          {warning}
        </p>
      ))}
      <div className="kanban-card__actions">
        <button className="button button--ghost" type="button" onClick={onEdit} disabled={disabled}>
          Edit
        </button>
        {compliance.lane === "overdue" ? (
          <button className="button button--warning" type="button" onClick={onResolveOverdue} disabled={disabled}>
            Resolve overdue
          </button>
        ) : null}
        {compliance.normalizedStatus !== "completed" ? (
          <button className="button button--primary" type="button" onClick={onComplete} disabled={disabled}>
            Complete
          </button>
        ) : null}
      </div>
    </article>
  );
}

export function EmployeeWorkspace({
  session,
  labMember,
  prefs,
  experiments,
  saving,
  onCreate,
  onUpdate,
  onComplete,
  onResolveOverdue,
  onChangePrefs,
  onReconnect,
  onSignOut,
  onRefresh,
  reconnecting,
  loading,
  lastSyncedAt,
  staleReason,
  variant = "standalone"
}: EmployeeWorkspaceProps) {
  const embedded = variant === "embedded";
  const [dialog, setDialog] = useState<EmployeeTaskDialogState>(null);
  const [view, setView] = useState<WorkspaceView>("kanban");
  const mutationsDisabled = saving || loading;
  const syncState: SyncState = loading
    ? "syncing"
    : staleReason
      ? "stale"
      : lastSyncedAt
        ? "synced"
        : "idle";

  useEffect(() => {
    if (!dialog || dialog.kind === "create") return;
    const latest = experiments.find(
      (experiment) => experiment.id === dialog.record.id
    );
    if (!latest) {
      setDialog(null);
      return;
    }
    if (latest !== dialog.record) {
      // Keep any local edit/completion draft while adopting the refreshed
      // revision token so an explicit retry compares against current data.
      setDialog((current) =>
        current && current.kind !== "create"
          ? { ...current, record: latest }
          : current
      );
    }
  }, [experiments, dialog]);

  const lanes = useMemo(() => {
    const grouped: Record<KanbanLane, ExperimentRecord[]> = {
      inProgress: [],
      overdue: [],
      planned: [],
      completed: []
    };
    for (const record of experiments) {
      grouped[evaluateCompliance(record).lane].push(record);
    }
    grouped.completed.sort((a, b) => (b.rowNumber ?? 0) - (a.rowNumber ?? 0));
    return grouped;
  }, [experiments]);

  const closeDialog = () => setDialog(null);

  const handleSaveTask = async (draft: ExperimentDraft) => {
    if (dialog?.kind === "create") {
      await onCreate(draft);
    } else {
      if (!dialog || dialog.kind !== "edit" || draft.rowNumber == null) {
        throw new Error("Cannot update a task without a row number.");
      }
      await onUpdate(dialog.record, draft);
    }
    closeDialog();
  };

  const handleCompletion = async (payload: CompletionPayload) => {
    await onComplete(payload);
    closeDialog();
  };

  const handleOverdue = async (payload: OverduePayload) => {
    await onResolveOverdue(payload);
    closeDialog();
  };

  return (
    <div className={`employee-shell${embedded ? " employee-shell--embedded" : ""}`}>
      {embedded ? (
        <header className="employee-subheader">
          <div>
            <h2 className="employee-subheader__title">{labMember}</h2>
            <p className="muted-row">
              {prefs.taskLogUrl ? (
                <>
                  <a href={prefs.taskLogUrl} target="_blank" rel="noreferrer">
                    Task-log workbook
                  </a>{" "}
                  · Active task tab <strong>{prefs.activeSheetName}</strong>
                </>
              ) : (
                "No Task-log workbook connected."
              )}
            </p>
          </div>
          {onRefresh ? (
            <button
              className="button button--ghost"
              type="button"
              onClick={() => void onRefresh()}
              disabled={loading}
            >
              {loading ? "Refreshing…" : "Refresh personal tasks"}
            </button>
          ) : null}
        </header>
      ) : (
        <header className="employee-topbar">
          <div>
            <h1>{labMember}</h1>
            <p className="muted-row">
              {prefs.taskLogUrl ? (
                <>
                  <a href={prefs.taskLogUrl} target="_blank" rel="noreferrer">
                    Task-log workbook
                  </a>{" "}
                  · Active task tab <strong>{prefs.activeSheetName}</strong>
                </>
              ) : (
                "No Task-log workbook connected."
              )}
            </p>
          </div>
          <nav className="employee-topbar__actions" aria-label="Account and workspace actions">
            <span className="muted-row">{session.email}</span>
            <button className="button button--ghost" type="button" onClick={onChangePrefs}>
              Change Task-log workbook
            </button>
            {onRefresh ? (
              <button
                className="button button--ghost"
                type="button"
                onClick={() => void onRefresh()}
                disabled={loading}
              >
                {loading ? "Refreshing…" : "Refresh"}
              </button>
            ) : null}
            <button
              className="button button--ghost"
              type="button"
              onClick={onReconnect}
              disabled={reconnecting}
            >
              {reconnecting ? "Reconnecting..." : "Reconnect Google"}
            </button>
            <button className="button button--secondary" type="button" onClick={onSignOut}>
              Sign out
            </button>
          </nav>
        </header>
      )}

      <SyncStatus state={syncState} lastSyncedAt={lastSyncedAt} />
      {staleReason ? (
        <p className="muted-row" role="status">
          Showing last-known tasks. {staleReason}
        </p>
      ) : null}

      <SegmentedControl
        aria-label="Workspace view"
        className="view-switcher"
        value={view}
        onChange={(next) => setView(next as WorkspaceView)}
        options={[
          { value: "kanban", label: "Kanban", panelId: "tasks-main" },
          { value: "gantt", label: "Gantt", panelId: "tasks-main" }
        ]}
      />

      <section
        id="tasks-main"
        className="tasks-region"
        tabIndex={-1}
        aria-label="Tasks"
        aria-busy={loading || undefined}
      >
      {view === "kanban" ? (
        <>
          <h2 className="sr-only">Task board</h2>
          <div className="kanban-board kanban-board--four">
            {LANE_DEFINITIONS.map((lane) => {
              const items = lanes[lane.key];
              return (
                <section
                  className={`kanban-column kanban-column--${lane.key}`}
                  key={lane.key}
                  aria-label={lane.label}
                >
                  <header className="kanban-column__header">
                    <div>
                      <h3>{lane.label}</h3>
                      <p className="muted-row">{lane.description}</p>
                    </div>
                    <span className="kanban-column__count">{items.length}</span>
                  </header>
                  <div className="kanban-column__body">
                    {items.length === 0 ? (
                      <p className="empty-state">No tasks in this lane.</p>
                    ) : (
                      items.map((record) => (
                        <TaskCard
                          key={record.id}
                          record={record}
                          onEdit={() =>
                            setDialog({
                              kind: "edit",
                              record,
                              draft: taskDraftFromRecord(record)
                            })
                          }
                          onComplete={() => setDialog({ kind: "complete", record })}
                          onResolveOverdue={() => setDialog({ kind: "overdue", record })}
                          disabled={mutationsDisabled}
                        />
                      ))
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      ) : (
        <GanttView
          mode="employee"
          experiments={experiments}
          labMembers={[labMember]}
          onEditTask={(record) =>
            setDialog({ kind: "edit", record, draft: taskDraftFromRecord(record) })
          }
        />
      )}
      </section>

      <button
        className="fab"
        type="button"
        onClick={() =>
          setDialog({ kind: "create", draft: blankTaskDraft(labMember, prefs) })
        }
        title="Create a new task"
        aria-label="Create a new task"
        disabled={mutationsDisabled}
      >
        <svg
          className="fab__icon"
          viewBox="0 0 24 24"
          width="24"
          height="24"
          aria-hidden="true"
          focusable="false"
        >
          <path
            d="M12 5v14M5 12h14"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
      </button>

      <EmployeeTaskDialogs
        dialog={dialog}
        saving={saving}
        onClose={closeDialog}
        onSaveTask={handleSaveTask}
        onComplete={handleCompletion}
        onResolveOverdue={handleOverdue}
      />
    </div>
  );
}
