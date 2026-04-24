import {
  useEffect,
  useMemo,
  useState,
  type DragEvent,
  type FormEvent
} from "react";
import { evaluateCompliance, summarizeEmployeeReports } from "../../domain/compliance";
import type { AppConfig, UserSession } from "../../domain/app";
import type {
  DashboardDataset,
  ExperimentDraft,
  ExperimentRecord,
  KanbanLane,
  SheetRegistryEntry
} from "../../domain/experiment";
import { formatDateInputValue, formatDateLabel, parseTimelineDate } from "../../utils/date";
import { LabMemberAvatar, memberStyleVars } from "../../components/LabMemberAvatar";
import { MetricCard } from "../../components/MetricCard";
import { StatusPill } from "../../components/StatusPill";
import { TaskDetailGrid } from "../../components/TaskDetailGrid";
import {
  buildLabMemberProfiles,
  type LabMemberProfile
} from "../../domain/people";
import {
  readManagerLastRun,
  readManagerSnapshot,
  readManagerTabOrder,
  writeManagerLastRun,
  writeManagerSnapshot,
  writeManagerTabOrder,
  type ManagerLastRun,
  type ManagerSnapshot
} from "../../services/cache";
import { extractIdFromUrl } from "../../services/googleSheets";
import { GanttView } from "../gantt/GanttView";
import { ChangeLogPanel, buildSnapshotFromExperiments } from "./ChangeLogPanel";

const ALL_TAB = "__all__";

const LANES: Array<{ key: KanbanLane; label: string }> = [
  { key: "inProgress", label: "In Progress" },
  { key: "overdue", label: "Overdue" },
  { key: "planned", label: "Planned" },
  { key: "completed", label: "Completed" }
];

type WorkspaceView = "kanban" | "gantt";

interface ManagerWorkspaceProps {
  session: UserSession;
  config: AppConfig;
  dataset: DashboardDataset;
  visibleLabMembers: string[];
  saving: boolean;
  refreshing: boolean;
  onRefresh: () => Promise<void>;
  onReconnect: () => void;
  onSignOut: () => void;
  onOpenSetup: () => void;
  onCreateTask: (entry: SheetRegistryEntry, draft: ExperimentDraft) => Promise<void>;
  onUpdateTask: (record: ExperimentRecord, draft: ExperimentDraft) => Promise<void>;
  reconnecting: boolean;
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

function groupRecordsByLane(records: ExperimentRecord[]): Record<KanbanLane, ExperimentRecord[]> {
  const grouped: Record<KanbanLane, ExperimentRecord[]> = {
    inProgress: [],
    overdue: [],
    planned: [],
    completed: []
  };
  for (const record of records) {
    grouped[evaluateCompliance(record).lane].push(record);
  }
  grouped.completed.sort((a, b) => (b.rowNumber ?? 0) - (a.rowNumber ?? 0));
  return grouped;
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
    startDateRaw: formatDateInputValue(record.startDateRaw),
    projectedEndDateRaw: formatDateInputValue(record.projectedEndDateRaw),
    status: record.status || "Planned",
    result: record.result,
    dataLink: record.dataLink,
    notebookLocation: record.notebookLocation,
    comments: record.comments
  };
}

interface ReorderableTabsProps {
  order: string[];
  active: string;
  onSelect: (tab: string) => void;
  onReorder: (next: string[]) => void;
}

function ReorderableTabs({ order, active, onSelect, onReorder }: ReorderableTabsProps) {
  const [draggingTab, setDraggingTab] = useState<string | null>(null);

  const handleDragStart = (event: DragEvent<HTMLButtonElement>, tab: string) => {
    if (tab === ALL_TAB) return;
    setDraggingTab(tab);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", tab);
  };

  const handleDragOver = (event: DragEvent<HTMLButtonElement>, tab: string) => {
    if (!draggingTab || tab === ALL_TAB || tab === draggingTab) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (event: DragEvent<HTMLButtonElement>, target: string) => {
    event.preventDefault();
    if (!draggingTab || draggingTab === target || target === ALL_TAB) {
      setDraggingTab(null);
      return;
    }
    const next = order.filter((tab) => tab !== draggingTab);
    const insertAt = next.indexOf(target);
    next.splice(insertAt < 0 ? next.length : insertAt, 0, draggingTab);
    onReorder(next);
    setDraggingTab(null);
  };

  const handleDragEnd = () => setDraggingTab(null);

  return (
    <div className="manager-tabs" role="tablist">
      {order.map((tab) => {
        const isAll = tab === ALL_TAB;
        const isActive = tab === active;
        return (
          <button
            key={tab}
            role="tab"
            aria-selected={isActive}
            type="button"
            draggable={!isAll}
            className={`manager-tab ${isActive ? "manager-tab--active" : ""} ${
              isAll ? "manager-tab--all" : ""
            }`}
            onClick={() => onSelect(tab)}
            onDragStart={(event) => handleDragStart(event, tab)}
            onDragOver={(event) => handleDragOver(event, tab)}
            onDrop={(event) => handleDrop(event, tab)}
            onDragEnd={handleDragEnd}
          >
            {isAll ? "All employees" : tab}
          </button>
        );
      })}
    </div>
  );
}

interface EmployeeFilterProps {
  labMembers: string[];
  selected: Set<string>;
  profiles: Record<string, LabMemberProfile>;
  onSelectAll: () => void;
  onSelectNone: () => void;
  onToggle: (labMember: string, selected: boolean) => void;
}

function EmployeeFilter({
  labMembers,
  selected,
  profiles,
  onSelectAll,
  onSelectNone,
  onToggle
}: EmployeeFilterProps) {
  return (
    <section className="employee-filter-card" aria-label="Filter employees">
      <header className="employee-filter-card__header">
        <div>
          <strong>Employee filter</strong>
          <p className="muted-row">
            {selected.size} of {labMembers.length} employees in this view
          </p>
        </div>
        <div className="employee-filter-card__actions">
          <button className="button button--ghost" type="button" onClick={onSelectAll}>
            All
          </button>
          <button className="button button--ghost" type="button" onClick={onSelectNone}>
            None
          </button>
        </div>
      </header>
      <div className="employee-filter-card__grid">
        {labMembers.map((labMember) => {
          const profile = profiles[labMember];
          return (
            <label
              className="employee-filter-option"
              style={memberStyleVars(profile)}
              key={labMember}
            >
              <input
                type="checkbox"
                checked={selected.has(labMember)}
                onChange={(event) => onToggle(labMember, event.target.checked)}
              />
              <LabMemberAvatar profile={profile} />
              <span>{labMember}</span>
            </label>
          );
        })}
      </div>
    </section>
  );
}

interface TaskCardProps {
  record: ExperimentRecord;
  showLabMember: boolean;
  profile: LabMemberProfile;
  expanded: boolean;
  onToggleExpanded: () => void;
}

function TaskCard({ record, showLabMember, profile, expanded, onToggleExpanded }: TaskCardProps) {
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

  return (
    <article className="kanban-card kanban-card--manager" style={memberStyleVars(profile)}>
      <header className="kanban-card__header">
        <div className="kanban-card__identity">
          <LabMemberAvatar profile={profile} />
          <span
            className={indicatorClass}
            title={compliance.feedback}
            aria-label={compliance.feedback}
          />
          {showLabMember ? <span className="kanban-card__lab-member">{record.labMember}</span> : null}
        </div>
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
      {expanded ? <TaskDetailGrid record={record} /> : null}
      <button
        className="button button--ghost kanban-card__see-more"
        type="button"
        onClick={onToggleExpanded}
        aria-expanded={expanded}
      >
        {expanded ? "See less" : "See more"}
      </button>
    </article>
  );
}

interface AddTaskModalProps {
  registry: SheetRegistryEntry[];
  saving: boolean;
  onClose: () => void;
  onSubmit: (entry: SheetRegistryEntry, draft: ExperimentDraft) => Promise<void>;
}

interface EditTaskModalProps {
  record: ExperimentRecord;
  saving: boolean;
  onClose: () => void;
  onSubmit: (draft: ExperimentDraft) => Promise<void>;
}

function EditTaskModal({ record, saving, onClose, onSubmit }: EditTaskModalProps) {
  const [local, setLocal] = useState<ExperimentDraft>(() => draftFromRecord(record));
  const [error, setError] = useState("");
  const compliance = useMemo(
    () =>
      evaluateCompliance({
        ...local,
        id: record.id
      }),
    [local, record.id]
  );
  const missingFields = useMemo(() => new Set(compliance.missingFields), [compliance.missingFields]);
  const issueFor = (field: string, label = field) =>
    missingFields.has(field) ? `${label} is required for this task to be compliant.` : "";

  const handleField = <K extends keyof ExperimentDraft>(key: K, value: ExperimentDraft[K]) => {
    setLocal((previous) => ({ ...previous, [key]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    try {
      await onSubmit(local);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to update the task.");
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card">
        <header className="modal-card__header">
          <div>
            <h2>Fix task</h2>
            <p className="muted-row">{record.labMember}</p>
          </div>
          <button
            className="button button--ghost"
            type="button"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>
        <div className="modal-card__body">
          <form className="stack-md" onSubmit={handleSubmit}>
            <div className="form-grid">
              <label className={fieldClass("field field--wide", issueFor("Project"))}>
                <span>Project</span>
                <input value={local.project} onChange={(event) => handleField("project", event.target.value)} />
                {issueFor("Project") ? <em className="field__hint">{issueFor("Project")}</em> : null}
              </label>
              <label className={fieldClass("field field--wide", issueFor("Experiment"))}>
                <span>Experiment</span>
                <input
                  value={local.experiment}
                  onChange={(event) => handleField("experiment", event.target.value)}
                />
                {issueFor("Experiment") ? <em className="field__hint">{issueFor("Experiment")}</em> : null}
              </label>
              <label className={fieldClass("field", issueFor("Status"))}>
                <span>Status</span>
                <select value={local.status} onChange={(event) => handleField("status", event.target.value)}>
                  <option>Planned</option>
                  <option>In Progress</option>
                  <option>Ongoing</option>
                  <option>Complete</option>
                  <option>Blocked</option>
                </select>
                {issueFor("Status") ? <em className="field__hint">{issueFor("Status")}</em> : null}
              </label>
              <label className={fieldClass("field", issueFor("Time Estimate", "Time estimate"))}>
                <span>Time estimate</span>
                <input
                  placeholder="4h"
                  value={local.timeEstimate}
                  onChange={(event) => handleField("timeEstimate", event.target.value)}
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
                  onChange={(event) => handleField("startDateRaw", event.target.value)}
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
                  onChange={(event) => handleField("projectedEndDateRaw", event.target.value)}
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
                  onChange={(event) => handleField("schematic", event.target.value)}
                />
                {issueFor("Schematic") ? <em className="field__hint">{issueFor("Schematic")}</em> : null}
              </label>
              <label className={fieldClass("field field--wide", issueFor("Link to Data", "Link to data"))}>
                <span>Link to data (Dropbox link)</span>
                <input
                  value={local.dataLink}
                  onChange={(event) => handleField("dataLink", event.target.value)}
                />
                {issueFor("Link to Data", "Link to data") ? (
                  <em className="field__hint">{issueFor("Link to Data", "Link to data")}</em>
                ) : null}
              </label>
              <label className="field field--wide">
                <span>Notebook location (optional)</span>
                <input
                  value={local.notebookLocation}
                  onChange={(event) => handleField("notebookLocation", event.target.value)}
                />
              </label>
              <label className={fieldClass("field field--wide", issueFor("Result", "Result summary"))}>
                <span>Result summary (for completed tasks)</span>
                <textarea
                  rows={3}
                  value={local.result}
                  onChange={(event) => handleField("result", event.target.value)}
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
                  onChange={(event) => handleField("comments", event.target.value)}
                />
              </label>
            </div>

            {error ? <p className="error-text">{error}</p> : null}

            <div className="button-row">
              <button className="button button--primary" type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save changes"}
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
        </div>
      </div>
    </div>
  );
}

function AddTaskModal({ registry, saving, onClose, onSubmit }: AddTaskModalProps) {
  const [labMember, setLabMember] = useState(registry[0]?.labMember ?? "");
  const [project, setProject] = useState("");
  const [experiment, setExperiment] = useState("");
  const [timeEstimate, setTimeEstimate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [projectedEndDate, setProjectedEndDate] = useState("");
  const [schematic, setSchematic] = useState("");
  const [dataLink, setDataLink] = useState("");
  const [status, setStatus] = useState("Planned");
  const [comments, setComments] = useState("");
  const [error, setError] = useState("");

  const selected = useMemo(
    () => registry.find((entry) => entry.labMember === labMember),
    [registry, labMember]
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (!selected) {
      setError("Pick an employee to route this task to.");
      return;
    }

    const required: Array<[string, string]> = [
      ["Project", project],
      ["Experiment", experiment],
      ["Time estimate", timeEstimate],
      ["Start date", startDate],
      ["Projected end date", projectedEndDate],
      ["Schematic", schematic],
      ["Link to data", dataLink]
    ];
    const missing = required.filter(([, value]) => !value.trim()).map(([label]) => label);
    if (missing.length > 0) {
      setError(`Please fill in: ${missing.join(", ")}.`);
      return;
    }

    const draft: ExperimentDraft = {
      rowNumber: null,
      labMember: selected.labMember,
      taskLogUrl: selected.taskLogUrl,
      activeSheetName: selected.activeSheetName,
      project: project.trim(),
      experiment: experiment.trim(),
      schematic: schematic.trim(),
      timeEstimate: timeEstimate.trim(),
      startDateRaw: startDate,
      projectedEndDateRaw: projectedEndDate,
      status,
      result: "",
      dataLink: dataLink.trim(),
      notebookLocation: "",
      comments: comments.trim()
    };

    try {
      await onSubmit(selected, draft);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to add the task.");
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card">
        <header className="modal-card__header">
          <h2>New task</h2>
          <button
            className="button button--ghost"
            type="button"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>
        <div className="modal-card__body">
          <form className="stack-md" onSubmit={handleSubmit}>
            <label className="field">
              <span>Assign to</span>
              <select
                value={labMember}
                onChange={(event) => setLabMember(event.target.value)}
              >
                {registry.length === 0 ? (
                  <option value="">No employees in registry</option>
                ) : (
                  registry.map((entry) => (
                    <option key={entry.labMember} value={entry.labMember}>
                      {entry.labMember}
                    </option>
                  ))
                )}
              </select>
            </label>
            <div className="form-grid">
              <label className="field field--wide">
                <span>Project</span>
                <input value={project} onChange={(event) => setProject(event.target.value)} />
              </label>
              <label className="field field--wide">
                <span>Experiment</span>
                <input
                  value={experiment}
                  onChange={(event) => setExperiment(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Status</span>
                <select value={status} onChange={(event) => setStatus(event.target.value)}>
                  <option>Planned</option>
                  <option>In Progress</option>
                  <option>Ongoing</option>
                  <option>Blocked</option>
                </select>
              </label>
              <label className="field">
                <span>Time estimate</span>
                <input
                  placeholder="4h"
                  value={timeEstimate}
                  onChange={(event) => setTimeEstimate(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Start date</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Projected end date</span>
                <input
                  type="date"
                  value={projectedEndDate}
                  onChange={(event) => setProjectedEndDate(event.target.value)}
                />
              </label>
              <label className="field field--wide">
                <span>Schematic</span>
                <input
                  value={schematic}
                  onChange={(event) => setSchematic(event.target.value)}
                />
              </label>
              <label className="field field--wide">
                <span>Link to data (Dropbox link)</span>
                <input
                  value={dataLink}
                  onChange={(event) => setDataLink(event.target.value)}
                />
              </label>
              <label className="field field--wide">
                <span>Comments (optional)</span>
                <textarea
                  rows={3}
                  value={comments}
                  onChange={(event) => setComments(event.target.value)}
                />
              </label>
            </div>

            {error ? <p className="error-text">{error}</p> : null}

            <div className="button-row">
              <button className="button button--primary" type="submit" disabled={saving}>
                {saving ? "Saving..." : "Add task"}
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
        </div>
      </div>
    </div>
  );
}

export function ManagerWorkspace({
  session,
  config,
  dataset,
  visibleLabMembers,
  saving,
  refreshing,
  onRefresh,
  onReconnect,
  onSignOut,
  onOpenSetup,
  onCreateTask,
  onUpdateTask,
  reconnecting
}: ManagerWorkspaceProps) {
  const adminSpreadsheetId = extractIdFromUrl(config.adminSpreadsheetId);
  const [activeTab, setActiveTab] = useState<string>(ALL_TAB);
  const [tabOrder, setTabOrder] = useState<string[]>(() => {
    const stored = readManagerTabOrder(session.email) ?? [];
    return [ALL_TAB, ...stored];
  });
  const [previousSnapshot, setPreviousSnapshot] = useState<ManagerSnapshot | null>(() =>
    adminSpreadsheetId ? readManagerSnapshot(session.email, adminSpreadsheetId) : null
  );
  const [lastRun, setLastRun] = useState<ManagerLastRun | null>(() =>
    readManagerLastRun(session.email)
  );
  const [showAddTask, setShowAddTask] = useState(false);
  const [editingTask, setEditingTask] = useState<ExperimentRecord | null>(null);
  const [view, setView] = useState<WorkspaceView>("kanban");
  const [selectedLabMembers, setSelectedLabMembers] = useState<string[]>(() => visibleLabMembers);
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const stored = readManagerTabOrder(session.email) ?? [];
    const knownEmployees = new Set(visibleLabMembers);
    const orderedKnown = stored.filter((tab) => knownEmployees.has(tab));
    const remaining = visibleLabMembers.filter((member) => !orderedKnown.includes(member));
    const next = [ALL_TAB, ...orderedKnown, ...remaining];
    setTabOrder(next);
    if (!next.includes(activeTab)) {
      setActiveTab(ALL_TAB);
    }
  }, [session.email, visibleLabMembers.join("|")]);

  useEffect(() => {
    setSelectedLabMembers((previous) => {
      const allowed = new Set(visibleLabMembers);
      const next = previous.filter((member) => allowed.has(member));
      return next.length > 0 ? next : visibleLabMembers;
    });
  }, [visibleLabMembers.join("|")]);

  const handleReorder = (next: string[]) => {
    setTabOrder(next);
    const employeeOrder = next.filter((tab) => tab !== ALL_TAB);
    writeManagerTabOrder(session.email, employeeOrder);
  };

  const labMemberProfiles = useMemo(
    () => buildLabMemberProfiles(dataset.registry, visibleLabMembers),
    [dataset.registry, visibleLabMembers]
  );
  const selectedLabMemberSet = useMemo(() => new Set(selectedLabMembers), [selectedLabMembers]);
  const activeLabMembers = useMemo(() => {
    if (activeTab !== ALL_TAB) return visibleLabMembers.includes(activeTab) ? [activeTab] : [];
    return visibleLabMembers.filter((member) => selectedLabMemberSet.has(member));
  }, [activeTab, selectedLabMemberSet, visibleLabMembers]);
  const activeLabMemberSet = useMemo(() => new Set(activeLabMembers), [activeLabMembers]);

  const handleToggleLabMember = (labMember: string, checked: boolean) => {
    setSelectedLabMembers((previous) => {
      const next = new Set(previous);
      if (checked) next.add(labMember);
      else next.delete(labMember);
      return visibleLabMembers.filter((member) => next.has(member));
    });
  };

  const handleToggleExpandedTask = (recordId: string) => {
    setExpandedTaskIds((previous) => {
      const next = new Set(previous);
      if (next.has(recordId)) next.delete(recordId);
      else next.add(recordId);
      return next;
    });
  };

  const filteredExperiments = useMemo(() => {
    return dataset.experiments.filter((record) => activeLabMemberSet.has(record.labMember));
  }, [dataset.experiments, activeLabMemberSet]);

  const ganttExperiments = useMemo(() => {
    return dataset.experiments.filter((record) => activeLabMemberSet.has(record.labMember));
  }, [dataset.experiments, activeLabMemberSet]);

  const lanes = useMemo(() => groupRecordsByLane(filteredExperiments), [filteredExperiments]);
  const ownerGroupedLanes = useMemo(() => {
    const result: Record<KanbanLane, Array<{ labMember: string; records: ExperimentRecord[] }>> = {
      inProgress: [],
      overdue: [],
      planned: [],
      completed: []
    };
    for (const lane of LANES) {
      const byMember = new Map<string, ExperimentRecord[]>();
      for (const record of lanes[lane.key]) {
        const bucket = byMember.get(record.labMember);
        if (bucket) bucket.push(record);
        else byMember.set(record.labMember, [record]);
      }
      for (const labMember of activeLabMembers) {
        const records = byMember.get(labMember);
        if (records && records.length > 0) {
          result[lane.key].push({ labMember, records });
        }
      }
    }
    return result;
  }, [lanes, activeLabMembers]);

  const reports = useMemo(
    () => summarizeEmployeeReports(filteredExperiments, dataset.feedbackThreads),
    [filteredExperiments, dataset.feedbackThreads]
  );

  const metrics = useMemo(() => {
    let compliant = 0;
    let overdue = 0;
    let missingCloseout = 0;
    for (const record of filteredExperiments) {
      const compliance = evaluateCompliance(record);
      if (compliance.isCompliant) compliant += 1;
      if (compliance.overdue) overdue += 1;
      if (compliance.completedMissingDataLink || compliance.completedMissingResult) {
        missingCloseout += 1;
      }
    }
    return {
      total: filteredExperiments.length,
      compliant,
      overdue,
      missingCloseout
    };
  }, [filteredExperiments]);

  const handleRunSummary = async () => {
    const start = Date.now();
    try {
      await onRefresh();
    } finally {
      const completedAt = new Date().toISOString();
      const durationMs = Date.now() - start;
      const next: ManagerLastRun = { ranAt: completedAt, durationMs };
      setLastRun(next);
      writeManagerLastRun(session.email, next);

      if (adminSpreadsheetId) {
        const snapshot = buildSnapshotFromExperiments(dataset.experiments);
        setPreviousSnapshot(snapshot);
        writeManagerSnapshot(session.email, adminSpreadsheetId, snapshot);
      }
    }
  };

  const handleAddTask = async (entry: SheetRegistryEntry, draft: ExperimentDraft) => {
    await onCreateTask(entry, draft);
    setShowAddTask(false);
  };

  const handleUpdateTask = async (draft: ExperimentDraft) => {
    if (!editingTask) return;
    await onUpdateTask(editingTask, draft);
    setEditingTask(null);
  };

  const scopeLabel =
    activeTab === ALL_TAB
      ? `Across ${activeLabMembers.length} employee${activeLabMembers.length === 1 ? "" : "s"}`
      : `Filtered to ${activeTab}`;

  return (
    <div className="manager-shell">
      <header className="manager-topbar">
        <div>
          <h1>Manager dashboard</h1>
          <p className="muted-row">
            Source: <strong>Google Sheets</strong>
            {dataset.lastSyncedAt ? ` · Last sync ${formatDateLabel(dataset.lastSyncedAt)}` : ""}
          </p>
          {dataset.syncNote ? <p className="muted-row">{dataset.syncNote}</p> : null}
        </div>
        <div className="manager-topbar__actions">
          <span className="muted-row">{session.email}</span>
          <button className="button button--ghost" type="button" onClick={onOpenSetup}>
            Setup
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

      <ReorderableTabs
        order={tabOrder}
        active={activeTab}
        onSelect={setActiveTab}
        onReorder={handleReorder}
      />

      <div className="metric-grid">
        <MetricCard label="Tasks in view" value={metrics.total} />
        <MetricCard label="Compliant" value={metrics.compliant} tone="success" />
        <MetricCard
          label="Overdue"
          value={metrics.overdue}
          tone={metrics.overdue ? "danger" : "default"}
        />
        <MetricCard label="Missing closeout" value={metrics.missingCloseout} />
      </div>

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

      {activeTab === ALL_TAB ? (
        <EmployeeFilter
          labMembers={visibleLabMembers}
          selected={selectedLabMemberSet}
          profiles={labMemberProfiles}
          onSelectAll={() => setSelectedLabMembers(visibleLabMembers)}
          onSelectNone={() => setSelectedLabMembers([])}
          onToggle={handleToggleLabMember}
        />
      ) : null}

      {view === "kanban" ? (
        <section className="stack-md">
          {activeTab === ALL_TAB ? (
            activeLabMembers.length === 0 ? (
              <p className="empty-state">Select at least one employee to show task cards.</p>
            ) : (
              <div className="kanban-board kanban-board--four kanban-board--owners">
                {LANES.map((lane) => {
                  const groups = ownerGroupedLanes[lane.key];
                  const totalCount = lanes[lane.key].length;
                  return (
                    <section
                      className={`kanban-column kanban-column--${lane.key}`}
                      key={lane.key}
                      aria-label={lane.label}
                    >
                      <header className="kanban-column__header">
                        <strong>{lane.label}</strong>
                        <span className="kanban-column__count">{totalCount}</span>
                      </header>
                      <div className="kanban-column__body kanban-column__body--owners">
                        {groups.length === 0 ? (
                          <p className="empty-state">No tasks here.</p>
                        ) : (
                          groups.map(({ labMember, records }) => {
                            const profile = labMemberProfiles[labMember];
                            return (
                              <div
                                className="kanban-owner-group"
                                style={memberStyleVars(profile)}
                                key={labMember}
                                aria-label={`${labMember} ${lane.label}`}
                              >
                                <header className="kanban-owner-group__header">
                                  <LabMemberAvatar
                                    profile={profile}
                                    className="lab-member-avatar--sm"
                                  />
                                  <span className="kanban-owner-group__name">{labMember}</span>
                                  <span className="kanban-owner-group__count">
                                    {records.length}
                                  </span>
                                </header>
                                <div className="kanban-owner-group__cards">
                                  {records.map((record) => (
                                    <TaskCard
                                      key={record.id}
                                      record={record}
                                      showLabMember={false}
                                      profile={profile}
                                      expanded={expandedTaskIds.has(record.id)}
                                      onToggleExpanded={() => handleToggleExpandedTask(record.id)}
                                    />
                                  ))}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </section>
                  );
                })}
              </div>
            )
          ) : (
            <div className="kanban-board kanban-board--four">
              {LANES.map((lane) => {
                const items = lanes[lane.key];
                return (
                  <section
                    className={`kanban-column kanban-column--${lane.key}`}
                    key={lane.key}
                    aria-label={lane.label}
                  >
                    <header className="kanban-column__header">
                      <strong>{lane.label}</strong>
                      <span className="kanban-column__count">{items.length}</span>
                    </header>
                    <div className="kanban-column__body">
                      {items.length === 0 ? (
                        <p className="empty-state">No tasks here.</p>
                      ) : (
                        items.map((record) => (
                          <TaskCard
                            key={record.id}
                            record={record}
                            showLabMember={false}
                            profile={labMemberProfiles[record.labMember]}
                            expanded={expandedTaskIds.has(record.id)}
                            onToggleExpanded={() => handleToggleExpandedTask(record.id)}
                          />
                        ))
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </section>
      ) : (
        <GanttView
          mode="manager"
          experiments={ganttExperiments}
          labMembers={activeLabMembers}
          defaultSelection={activeLabMembers}
          labMemberProfiles={labMemberProfiles}
          onEditTask={setEditingTask}
        />
      )}

      <section className="stack-md">
        <h3>Employee rollup</h3>
        <div className="employee-report-grid">
          {reports.length === 0 ? (
            <p className="empty-state">No experiments are visible in the current scope.</p>
          ) : (
            reports.map((report) => (
              <article className="employee-report-card" key={report.labMember}>
                <header>
                  <strong>{report.labMember}</strong>
                  <span>{report.totalExperiments} tasks</span>
                </header>
                <p>
                  {report.compliantCount} compliant · {report.flaggedCount} flagged ·{" "}
                  {report.overdueCount} overdue
                </p>
                <p className="muted-row">
                  {(report.latestFeedback ?? report.generatedFeedback).slice(0, 200)}
                  {(report.latestFeedback ?? report.generatedFeedback).length > 200 ? "..." : ""}
                </p>
              </article>
            ))
          )}
        </div>
      </section>

      <ChangeLogPanel
        experiments={filteredExperiments}
        previousSnapshot={previousSnapshot}
        lastRun={lastRun}
        scopeLabel={scopeLabel}
      />

      <div className="fab-group">
        <button
          className={`fab fab--secondary${refreshing ? " is-loading" : ""}`}
          type="button"
          onClick={handleRunSummary}
          title={
            lastRun
              ? `Last run: ${formatDateLabel(lastRun.ranAt)}`
              : "Refresh data and snapshot for change tracking"
          }
          disabled={refreshing}
        >
          <span className="fab--secondary__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" focusable="false">
              <path
                d="M21 12a9 9 0 1 1-3.2-6.9M21 4v5h-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="fab--secondary__text">
            <span className="fab__title">{refreshing ? "Running…" : "Run summary"}</span>
            <span className="fab__sub">
              {lastRun
                ? `${formatDateLabel(lastRun.ranAt)} · ${(lastRun.durationMs / 1000).toFixed(1)}s`
                : "Never run"}
            </span>
          </span>
        </button>
        <button
          className="fab"
          type="button"
          onClick={() => setShowAddTask(true)}
          title="Add task"
          aria-label="Add task"
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
      </div>

      {showAddTask ? (
        <AddTaskModal
          registry={dataset.registry}
          saving={saving}
          onClose={() => setShowAddTask(false)}
          onSubmit={handleAddTask}
        />
      ) : null}

      {editingTask ? (
        <EditTaskModal
          record={editingTask}
          saving={saving}
          onClose={() => setEditingTask(null)}
          onSubmit={handleUpdateTask}
        />
      ) : null}
    </div>
  );
}
