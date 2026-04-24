import { useEffect, useMemo, useState, type FormEvent } from "react";
import { evaluateCompliance } from "../../domain/compliance";
import type {
  EmployeeSheetPrefs,
  UserSession
} from "../../domain/app";
import type {
  ExperimentDraft,
  ExperimentRecord,
  KanbanLane
} from "../../domain/experiment";
import {
  formatDateInputValue,
  formatDateLabel,
  parsePossibleDate,
  parseTimelineDate,
  startOfToday
} from "../../utils/date";
import { StatusPill } from "../../components/StatusPill";
import { GanttView } from "../gantt/GanttView";

const STATUS_OPTIONS = ["Planned", "In Progress", "Ongoing", "Complete", "Blocked"] as const;

const LANE_DEFINITIONS: Array<{ key: KanbanLane; label: string; description: string }> = [
  { key: "inProgress", label: "In Progress", description: "Active work on track." },
  { key: "overdue", label: "Overdue", description: "Past projected end by 24h+." },
  { key: "planned", label: "Planned", description: "Scheduled or not yet started." },
  { key: "completed", label: "Completed", description: "Closed out and reported." }
];

type WorkspaceView = "kanban" | "gantt";

export interface CompletionPayload {
  rowNumber: number;
  result: string;
  dataLink: string;
  schematic: string;
}

export interface OverduePayload {
  rowNumber: number;
  newProjectedEndDate: string;
  newTimeEstimate: string;
  delayComment: string;
}

interface EmployeeWorkspaceProps {
  session: UserSession;
  labMember: string;
  prefs: EmployeeSheetPrefs;
  experiments: ExperimentRecord[];
  saving: boolean;
  onCreate: (draft: ExperimentDraft) => Promise<void>;
  onUpdate: (rowNumber: number, draft: ExperimentDraft) => Promise<void>;
  onComplete: (payload: CompletionPayload) => Promise<void>;
  onResolveOverdue: (payload: OverduePayload) => Promise<void>;
  onChangePrefs: () => void;
  onReconnect: () => void;
  onSignOut: () => void;
  reconnecting: boolean;
  loading: boolean;
}

function blankDraft(labMember: string, prefs: EmployeeSheetPrefs): ExperimentDraft {
  return {
    rowNumber: null,
    labMember,
    taskLogUrl: prefs.taskLogUrl,
    activeSheetName: prefs.activeSheetName,
    project: "",
    experiment: "",
    schematic: "",
    timeEstimate: "",
    startDateRaw: "",
    projectedEndDateRaw: "",
    status: "Planned",
    result: "",
    dataLink: "",
    notebookLocation: "",
    comments: ""
  };
}

function draftFromRecord(record: ExperimentRecord): ExperimentDraft {
  return {
    rowNumber: record.rowNumber,
    labMember: record.labMember,
    taskLogUrl: record.taskLogUrl,
    activeSheetName: record.activeSheetName,
    project: record.project,
    experiment: record.experiment,
    schematic: record.schematic,
    timeEstimate: record.timeEstimate,
    startDateRaw: formatDateInputValue(record.startDateRaw, "first"),
    projectedEndDateRaw: formatDateInputValue(record.projectedEndDateRaw, "last"),
    status: record.status || "Planned",
    result: record.result,
    dataLink: record.dataLink,
    notebookLocation: record.notebookLocation,
    comments: record.comments
  };
}

function dateMeta(value: string, strategy: "first" | "last" = "first") {
  const raw = String(value ?? "").trim();
  const parsed = parseTimelineDate(value, strategy);
  return {
    label: raw && !parsed ? "Invalid format" : formatDateLabel(parsed ?? value),
    invalid: !!raw && !parsed
  };
}

function fieldClass(base: string, issue: string): string {
  return `${base}${issue ? " field--attention" : ""}`;
}

interface TaskCardProps {
  record: ExperimentRecord;
  onEdit: () => void;
  onComplete: () => void;
  onResolveOverdue: () => void;
}

function TaskCard({ record, onEdit, onComplete, onResolveOverdue }: TaskCardProps) {
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
  const indicatorLabel = compliance.isCompliant
    ? "Compliant"
    : compliance.feedback;

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
        <button className="button button--ghost" type="button" onClick={onEdit}>
          Edit
        </button>
        {compliance.lane === "overdue" ? (
          <button className="button button--warning" type="button" onClick={onResolveOverdue}>
            Resolve overdue
          </button>
        ) : null}
        {compliance.normalizedStatus !== "completed" ? (
          <button className="button button--primary" type="button" onClick={onComplete}>
            Complete
          </button>
        ) : null}
      </div>
    </article>
  );
}

interface ModalShellProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

function ModalShell({ title, onClose, children }: ModalShellProps) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card">
        <header className="modal-card__header">
          <h2>{title}</h2>
          <button className="button button--ghost" type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="modal-card__body">{children}</div>
      </div>
    </div>
  );
}

interface EditModalProps {
  draft: ExperimentDraft;
  saving: boolean;
  isCreate: boolean;
  onClose: () => void;
  onSubmit: (draft: ExperimentDraft) => Promise<void>;
}

function EditModal({ draft, saving, isCreate, onClose, onSubmit }: EditModalProps) {
  const [local, setLocal] = useState<ExperimentDraft>(draft);
  const [error, setError] = useState("");

  const compliance = useMemo(
    () =>
      evaluateCompliance({
        ...local,
        id: local.rowNumber ? `${local.labMember}-${local.rowNumber}` : `${local.labMember}-draft`
      }),
    [local]
  );
  const missingFields = useMemo(() => new Set(compliance.missingFields), [compliance.missingFields]);
  const issueFor = (field: string, label = field) =>
    missingFields.has(field) ? `${label} is required for this task to be compliant.` : "";

  const handleField = <K extends keyof ExperimentDraft>(key: K, value: ExperimentDraft[K]) => {
    setLocal((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (isCreate) {
      const required: Array<[string, string]> = [
        ["Project", local.project],
        ["Experiment", local.experiment],
        ["Time estimate", local.timeEstimate],
        ["Start date", local.startDateRaw],
        ["Projected end date", local.projectedEndDateRaw],
        ["Schematic", local.schematic],
        ["Link to data", local.dataLink]
      ];
      const missing = required.filter(([, value]) => !value || !value.trim()).map(([label]) => label);
      if (missing.length > 0) {
        setError(`Please fill in: ${missing.join(", ")}.`);
        return;
      }
    }

    try {
      await onSubmit(local);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to save the task.");
    }
  };

  return (
    <ModalShell title={isCreate ? "New task" : "Edit task"} onClose={onClose}>
      <form className="stack-md" onSubmit={handleSubmit}>
        <div className="form-grid">
          <label className={fieldClass("field field--wide", issueFor("Project"))}>
            <span>Project</span>
            <input value={local.project} onChange={(e) => handleField("project", e.target.value)} />
            {issueFor("Project") ? <em className="field__hint">{issueFor("Project")}</em> : null}
          </label>
          <label className={fieldClass("field field--wide", issueFor("Experiment"))}>
            <span>Experiment</span>
            <input
              value={local.experiment}
              onChange={(e) => handleField("experiment", e.target.value)}
            />
            {issueFor("Experiment") ? <em className="field__hint">{issueFor("Experiment")}</em> : null}
          </label>
          <label className={fieldClass("field", issueFor("Status"))}>
            <span>Status</span>
            <select value={local.status} onChange={(e) => handleField("status", e.target.value)}>
              {STATUS_OPTIONS.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
            {issueFor("Status") ? <em className="field__hint">{issueFor("Status")}</em> : null}
          </label>
          <label className={fieldClass("field", issueFor("Time Estimate", "Time estimate"))}>
            <span>Time estimate</span>
            <input
              placeholder="4h"
              value={local.timeEstimate}
              onChange={(e) => handleField("timeEstimate", e.target.value)}
            />
            {issueFor("Time Estimate", "Time estimate") ? (
              <em className="field__hint">{issueFor("Time Estimate", "Time estimate")}</em>
            ) : null}
          </label>
          <label className={fieldClass("field", issueFor("Start Date", "Start date"))}>
            <span>Start date</span>
            <input
              type="date"
              value={local.startDateRaw}
              onChange={(e) => handleField("startDateRaw", e.target.value)}
            />
            {issueFor("Start Date", "Start date") ? (
              <em className="field__hint">{issueFor("Start Date", "Start date")}</em>
            ) : null}
          </label>
          <label className={fieldClass("field", issueFor("Projected End Date", "Projected end date"))}>
            <span>Projected end date</span>
            <input
              type="date"
              value={local.projectedEndDateRaw}
              onChange={(e) => handleField("projectedEndDateRaw", e.target.value)}
            />
            {issueFor("Projected End Date", "Projected end date") ? (
              <em className="field__hint">
                {issueFor("Projected End Date", "Projected end date")}
              </em>
            ) : null}
          </label>
          <label className={fieldClass("field field--wide", issueFor("Schematic"))}>
            <span>Schematic</span>
            <input
              value={local.schematic}
              onChange={(e) => handleField("schematic", e.target.value)}
            />
            {issueFor("Schematic") ? <em className="field__hint">{issueFor("Schematic")}</em> : null}
          </label>
          <label className={fieldClass("field field--wide", issueFor("Link to Data", "Link to data"))}>
            <span>Link to data (Dropbox link)</span>
            <input
              placeholder="https://www.dropbox.com/..."
              value={local.dataLink}
              onChange={(e) => handleField("dataLink", e.target.value)}
            />
            {issueFor("Link to Data", "Link to data") ? (
              <em className="field__hint">{issueFor("Link to Data", "Link to data")}</em>
            ) : null}
          </label>
          <label className="field field--wide">
            <span>Notebook location (optional)</span>
            <input
              value={local.notebookLocation}
              onChange={(e) => handleField("notebookLocation", e.target.value)}
            />
          </label>
          <label className={fieldClass("field field--wide", issueFor("Result", "Result summary"))}>
            <span>Result summary (for completed tasks)</span>
            <textarea
              rows={3}
              value={local.result}
              onChange={(e) => handleField("result", e.target.value)}
            />
            {issueFor("Result", "Result summary") ? (
              <em className="field__hint">{issueFor("Result", "Result summary")}</em>
            ) : null}
          </label>
          <label className="field field--wide">
            <span>Comments / improvements (optional)</span>
            <textarea
              rows={3}
              value={local.comments}
              onChange={(e) => handleField("comments", e.target.value)}
            />
          </label>
        </div>

        {error ? <p className="error-text">{error}</p> : null}

        <div className="button-row">
          <button className="button button--primary" type="submit" disabled={saving}>
            {saving ? "Saving..." : isCreate ? "Create task" : "Save changes"}
          </button>
          <button
            className="button button--secondary"
            type="button"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

interface CompletionModalProps {
  record: ExperimentRecord;
  saving: boolean;
  onClose: () => void;
  onSubmit: (payload: CompletionPayload) => Promise<void>;
}

function CompletionModal({ record, saving, onClose, onSubmit }: CompletionModalProps) {
  const [result, setResult] = useState(record.result);
  const [dataLink, setDataLink] = useState(record.dataLink);
  const [schematic, setSchematic] = useState(record.schematic);
  const [error, setError] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (!result.trim() || !dataLink.trim() || !schematic.trim()) {
      setError("Result, link to data, and schematic are required to mark a task complete.");
      return;
    }

    if (record.rowNumber == null) {
      setError("This task has no row number. Save it before completing.");
      return;
    }

    try {
      await onSubmit({
        rowNumber: record.rowNumber,
        result: result.trim(),
        dataLink: dataLink.trim(),
        schematic: schematic.trim()
      });
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Unable to complete the task."
      );
    }
  };

  return (
    <ModalShell title={`Complete: ${record.experiment || "task"}`} onClose={onClose}>
      <form className="stack-md" onSubmit={handleSubmit}>
        <label className="field">
          <span>Schematic</span>
          <input value={schematic} onChange={(event) => setSchematic(event.target.value)} />
        </label>
        <label className="field">
          <span>Link to data (Dropbox link to result)</span>
          <input
            placeholder="https://www.dropbox.com/..."
            value={dataLink}
            onChange={(event) => setDataLink(event.target.value)}
          />
        </label>
        <label className="field">
          <span>Result summary</span>
          <textarea
            rows={4}
            value={result}
            onChange={(event) => setResult(event.target.value)}
          />
        </label>

        {error ? <p className="error-text">{error}</p> : null}

        <div className="button-row">
          <button className="button button--primary" type="submit" disabled={saving}>
            {saving ? "Saving..." : "Mark complete"}
          </button>
          <button
            className="button button--secondary"
            type="button"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

interface OverdueModalProps {
  record: ExperimentRecord;
  saving: boolean;
  onClose: () => void;
  onSubmit: (payload: OverduePayload) => Promise<void>;
}

function OverdueModal({ record, saving, onClose, onSubmit }: OverdueModalProps) {
  const [newProjectedEndDate, setNewProjectedEndDate] = useState(
    formatDateInputValue(record.projectedEndDateRaw, "last")
  );
  const [newTimeEstimate, setNewTimeEstimate] = useState(record.timeEstimate);
  const [delayComment, setDelayComment] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (!newProjectedEndDate || !newTimeEstimate.trim() || !delayComment.trim()) {
      setError(
        "A new projected end date, new time estimate, and delay reason are all required."
      );
      return;
    }

    const today = startOfToday();
    const parsedEnd = parsePossibleDate(newProjectedEndDate);
    if (!parsedEnd || parsedEnd.getTime() <= today.getTime()) {
      setError("The new projected end date must be after today.");
      return;
    }

    if (record.rowNumber == null) {
      setError("This task has no row number. Save it before resolving overdue state.");
      return;
    }

    try {
      await onSubmit({
        rowNumber: record.rowNumber,
        newProjectedEndDate,
        newTimeEstimate: newTimeEstimate.trim(),
        delayComment: delayComment.trim()
      });
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to record the overdue resolution."
      );
    }
  };

  return (
    <ModalShell title={`Resolve overdue: ${record.experiment || "task"}`} onClose={onClose}>
      <form className="stack-md" onSubmit={handleSubmit}>
        <p className="muted-row">
          The previous projected end date and time estimate will stay in the cell with a strike-through,
          and the new values plus your delay comment will be appended.
        </p>

        <label className="field">
          <span>New projected end date</span>
          <input
            type="date"
            value={newProjectedEndDate}
            onChange={(event) => setNewProjectedEndDate(event.target.value)}
          />
        </label>

        <label className="field">
          <span>New time estimate</span>
          <input
            placeholder="4h"
            value={newTimeEstimate}
            onChange={(event) => setNewTimeEstimate(event.target.value)}
          />
        </label>

        <label className="field">
          <span>Why is this delayed?</span>
          <textarea
            rows={3}
            value={delayComment}
            onChange={(event) => setDelayComment(event.target.value)}
          />
        </label>

        {error ? <p className="error-text">{error}</p> : null}

        <div className="button-row">
          <button className="button button--primary" type="submit" disabled={saving}>
            {saving ? "Saving..." : "Update task"}
          </button>
          <button
            className="button button--secondary"
            type="button"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

type ModalState =
  | { kind: "create" }
  | { kind: "edit"; record: ExperimentRecord }
  | { kind: "complete"; record: ExperimentRecord }
  | { kind: "overdue"; record: ExperimentRecord }
  | null;

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
  reconnecting,
  loading
}: EmployeeWorkspaceProps) {
  const [modal, setModal] = useState<ModalState>(null);
  const [view, setView] = useState<WorkspaceView>("kanban");

  useEffect(() => {
    if (!modal) return;
    if (modal.kind === "create") return;
    const stillExists = experiments.some((record) => record.id === modal.record.id);
    if (!stillExists) setModal(null);
  }, [experiments, modal]);

  const lanes = useMemo(() => {
    const grouped: Record<KanbanLane, ExperimentRecord[]> = {
      inProgress: [],
      overdue: [],
      planned: [],
      completed: []
    };

    for (const record of experiments) {
      const compliance = evaluateCompliance(record);
      grouped[compliance.lane].push(record);
    }

    grouped.completed.sort((a, b) => (b.rowNumber ?? 0) - (a.rowNumber ?? 0));

    return grouped;
  }, [experiments]);

  const closeModal = () => setModal(null);

  const handleCreateSubmit = async (draft: ExperimentDraft) => {
    await onCreate(draft);
    setModal(null);
  };

  const handleEditSubmit = async (draft: ExperimentDraft) => {
    if (draft.rowNumber == null) {
      throw new Error("Cannot update a task without a row number.");
    }
    await onUpdate(draft.rowNumber, draft);
    setModal(null);
  };

  const handleCompletionSubmit = async (payload: CompletionPayload) => {
    await onComplete(payload);
    setModal(null);
  };

  const handleOverdueSubmit = async (payload: OverduePayload) => {
    await onResolveOverdue(payload);
    setModal(null);
  };

  return (
    <div className="employee-shell">
      <header className="employee-topbar">
        <div>
          <h1>{labMember}</h1>
          <p className="muted-row">
            {prefs.taskLogUrl ? (
              <>
                <a href={prefs.taskLogUrl} target="_blank" rel="noreferrer">
                  Task log
                </a>{" "}
                · tab <strong>{prefs.activeSheetName}</strong>
              </>
            ) : (
              "No task log connected."
            )}
          </p>
        </div>
        <div className="employee-topbar__actions">
          <span className="muted-row">{session.email}</span>
          <button className="button button--ghost" type="button" onClick={onChangePrefs}>
            Change task log
          </button>
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
        </div>
      </header>

      {loading ? <div className="banner">Loading your task log…</div> : null}

      <div className="view-switcher" aria-label="Workspace view">
        <button
          className={`view-switcher__button${view === "kanban" ? " view-switcher__button--active" : ""}`}
          type="button"
          onClick={() => setView("kanban")}
        >
          Kanban
        </button>
        <button
          className={`view-switcher__button${view === "gantt" ? " view-switcher__button--active" : ""}`}
          type="button"
          onClick={() => setView("gantt")}
        >
          Gantt
        </button>
      </div>

      {view === "kanban" ? (
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
                    <strong>{lane.label}</strong>
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
                        onEdit={() => setModal({ kind: "edit", record })}
                        onComplete={() => setModal({ kind: "complete", record })}
                        onResolveOverdue={() => setModal({ kind: "overdue", record })}
                      />
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <GanttView
          mode="employee"
          experiments={experiments}
          labMembers={[labMember]}
          onEditTask={(record) => setModal({ kind: "edit", record })}
        />
      )}

      <button
        className="fab"
        type="button"
        onClick={() => setModal({ kind: "create" })}
        title="Create a new task"
        aria-label="Create a new task"
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

      {modal?.kind === "create" ? (
        <EditModal
          draft={blankDraft(labMember, prefs)}
          saving={saving}
          isCreate
          onClose={closeModal}
          onSubmit={handleCreateSubmit}
        />
      ) : null}

      {modal?.kind === "edit" ? (
        <EditModal
          draft={draftFromRecord(modal.record)}
          saving={saving}
          isCreate={false}
          onClose={closeModal}
          onSubmit={handleEditSubmit}
        />
      ) : null}

      {modal?.kind === "complete" ? (
        <CompletionModal
          record={modal.record}
          saving={saving}
          onClose={closeModal}
          onSubmit={handleCompletionSubmit}
        />
      ) : null}

      {modal?.kind === "overdue" ? (
        <OverdueModal
          record={modal.record}
          saving={saving}
          onClose={closeModal}
          onSubmit={handleOverdueSubmit}
        />
      ) : null}
    </div>
  );
}
