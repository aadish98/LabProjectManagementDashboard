import { useState } from "react";
import { evaluateCompliance } from "../../domain/compliance";
import type {
  DashboardDataset,
  EmployeeReport,
  ExperimentRecord,
  KanbanLane,
  MemberLoadIssue
} from "../../domain/experiment";
import type { LabMemberProfile } from "../../domain/people";
import { formatDateLabel, parseTimelineDate } from "../../utils/date";
import { LabMemberAvatar, memberStyleVars } from "../../components/LabMemberAvatar";
import { MetricCard } from "../../components/MetricCard";
import { StatusPill } from "../../components/StatusPill";
import { TaskDetailGrid } from "../../components/TaskDetailGrid";
import { ConfirmDialog, TabList } from "../../components/ui";
import type { ManagerLastRun } from "../../services/cache";
import {
  memberLoadRecoveryKey,
  type MemberLoadRecoveryAction
} from "../../app/useMemberLoadRecovery";
import { extractIdFromUrl } from "../../services/sheets/helpers";
import { ALL_EMPLOYEES_TAB, MANAGER_LANES } from "./useManagerDashboard";

interface ReorderableTabsProps {
  order: string[];
  active: string;
  onSelect: (tab: string) => void;
  onReorder: (next: string[]) => void;
}

export function ReorderableTabs({
  order,
  active,
  onSelect,
  onReorder
}: ReorderableTabsProps) {
  const [reorderMode, setReorderMode] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const move = (tab: string, offset: number) => {
    const currentIndex = order.indexOf(tab);
    const minimumIndex = order[0] === ALL_EMPLOYEES_TAB ? 1 : 0;
    const nextIndex = Math.max(minimumIndex, Math.min(order.length - 1, currentIndex + offset));
    if (currentIndex < 0 || nextIndex === currentIndex) return;
    const next = [...order];
    next.splice(currentIndex, 1);
    next.splice(nextIndex, 0, tab);
    onReorder(next);
    setAnnouncement(`${tab} moved to position ${nextIndex + 1} of ${order.length}.`);
  };

  return (
    <div className="stack-xs">
      <div className="manager-tabs__toolbar">
        <TabList
          className="manager-tabs"
          aria-label="Active task tab"
          selectedTabId={managerTabId(active)}
          onChange={(id) => {
            const selected = order.find((tab) => managerTabId(tab) === id);
            if (selected) onSelect(selected);
          }}
          tabs={order.map((tab) => ({
            id: managerTabId(tab),
            panelId: "tasks-main",
            label: tab === ALL_EMPLOYEES_TAB ? "All members" : tab
          }))}
        />
        <button
          className="button button--secondary"
          type="button"
          aria-pressed={reorderMode}
          onClick={() => setReorderMode((current) => !current)}
        >
          {reorderMode ? "Done reordering" : "Reorder member tabs"}
        </button>
      </div>
      {reorderMode ? (
        <div className="tab-reorder-list" aria-label="Reorder member tabs">
          <p className="muted-row">
            Use Move earlier and Move later. Changes are announced and saved automatically.
          </p>
          {order.filter((tab) => tab !== ALL_EMPLOYEES_TAB).map((tab, index, members) => (
            <div className="tab-reorder-row" key={tab}>
              <span>{tab}</span>
              <button
                className="button button--ghost"
                type="button"
                onClick={() => move(tab, -1)}
                disabled={index === 0}
                aria-label={`Move ${tab} earlier`}
              >
                Move earlier
              </button>
              <button
                className="button button--ghost"
                type="button"
                onClick={() => move(tab, 1)}
                disabled={index === members.length - 1}
                aria-label={`Move ${tab} later`}
              >
                Move later
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}

export function managerTabId(tab: string) {
  return `manager-tab-${tab.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

interface EmployeeFilterProps {
  labMembers: string[];
  selected: Set<string>;
  profiles: Record<string, LabMemberProfile>;
  onSelectAll: () => void;
  onSelectNone: () => void;
  onToggle: (labMember: string, selected: boolean) => void;
}

export function EmployeeFilter({
  labMembers,
  selected,
  profiles,
  onSelectAll,
  onSelectNone,
  onToggle
}: EmployeeFilterProps) {
  return (
    <section className="employee-filter-card" aria-label="Filter members">
      <header className="employee-filter-card__header">
        <div>
          <strong>Member filter</strong>
          <p className="muted-row">
            {selected.size} of {labMembers.length} members in this view
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

export function ManagerWarnings({
  dataset,
  onOpenSetup,
  recoveryBusyKey,
  onGrantMemberAccess,
  onRetryMember,
  onDeactivateMember
}: {
  dataset: DashboardDataset;
  onOpenSetup: () => void;
  recoveryBusyKey: string | null;
  onGrantMemberAccess: (issue: MemberLoadIssue) => void | Promise<void>;
  onRetryMember: (issue: MemberLoadIssue) => void | Promise<void>;
  onDeactivateMember: (issue: MemberLoadIssue) => void | Promise<void>;
}) {
  const [confirmDeactivation, setConfirmDeactivation] =
    useState<MemberLoadIssue | null>(null);
  const recoveryInProgress = recoveryBusyKey !== null;
  const isBusy = (
    issue: MemberLoadIssue,
    action: MemberLoadRecoveryAction
  ) => recoveryBusyKey === memberLoadRecoveryKey(issue, action);

  return (
    <>
      {dataset.registryProblems?.length ? (
        <div className="callout callout--warning stack-xs">
          <strong>
            {dataset.registryProblems.length} member row
            {dataset.registryProblems.length === 1 ? "" : "s"} skipped because of incomplete data.
          </strong>
          <ul className="compact-list">
            {dataset.registryProblems.slice(0, 5).map((problem) => {
              const issues = problem.issues
                .map((issue) =>
                  issue === "missingLabMember"
                    ? "missing member name"
                    : issue === "missingTaskLogUrl"
                      ? "missing Task-log workbook URL"
                      : issue === "missingActiveSheetName"
                        ? "missing Active task tab"
                        : "Task-log workbook URL is invalid"
                )
                .join(", ");
              return (
                <li key={`${problem.rowNumber}-${problem.labMember || "row"}`}>
                  Row {problem.rowNumber}
                  {problem.labMember ? ` · ${problem.labMember}` : ""}: {issues}.
                </li>
              );
            })}
            {dataset.registryProblems.length > 5 ? (
              <li>And {dataset.registryProblems.length - 5} more...</li>
            ) : null}
          </ul>
          <p className="muted-row">
            Open <strong>Team setup</strong> to fix these rows. They are not included in the dashboard
            until they are complete.
          </p>
          <div className="button-row">
            <button className="button button--secondary" type="button" onClick={onOpenSetup}>
              Open Team setup
            </button>
          </div>
        </div>
      ) : null}
      {dataset.staleTaskLogs?.length ? (
        <div className="callout callout--warning stack-xs">
          <strong>
            {dataset.staleTaskLogs.length} task-log tab
            {dataset.staleTaskLogs.length === 1 ? "" : "s"} no longer exist in the referenced
            workbook.
          </strong>
          <ul className="compact-list">
            {dataset.staleTaskLogs.slice(0, 5).map((stale) => (
              <li key={`${stale.labMember}-${stale.taskLogUrl}`}>
                <strong>{stale.labMember}</strong>: tab "{stale.activeSheetName}" not found.
              </li>
            ))}
            {dataset.staleTaskLogs.length > 5 ? (
              <li>And {dataset.staleTaskLogs.length - 5} more...</li>
            ) : null}
          </ul>
          <p className="muted-row">
            The member may have renamed the Active task tab in their Task-log workbook. Update it
            in <strong>Team setup</strong> so their data appears here.
          </p>
          <div className="button-row">
            <button className="button button--secondary" type="button" onClick={onOpenSetup}>
              Open Team setup
            </button>
          </div>
        </div>
      ) : null}
      {dataset.memberLoadIssues?.length ? (
        <div className="callout callout--warning stack-xs">
          <strong>
            {dataset.memberLoadIssues.length} Task-log workbook
            {dataset.memberLoadIssues.length === 1 ? "" : "s"} could not be loaded.
          </strong>
          <p className="muted-row">
            Data from accessible Task-log workbooks is still shown. These members may be
            missing or showing last-known records.
          </p>
          <ul className="compact-list member-recovery-list">
            {dataset.memberLoadIssues.map((issue) => {
              const spreadsheetId = extractIdFromUrl(issue.taskLogUrl);
              return (
                <li
                  className="member-recovery-item stack-xs"
                  key={`${issue.memberId ?? issue.labMember}-${issue.taskLogUrl}`}
                  aria-busy={
                    (["picker", "retry", "deactivate"] as const).some(
                      (action) => isBusy(issue, action)
                    ) || undefined
                  }
                >
                  <div>
                    <strong>{issue.labMember}</strong>: {issue.message}
                    {issue.status ? ` (HTTP ${issue.status})` : ""}
                  </div>
                  {spreadsheetId ? (
                    <p className="muted-row">
                      Configured spreadsheet ID: <code>{spreadsheetId}</code>
                    </p>
                  ) : (
                    <p className="muted-row">
                      No configured spreadsheet ID is available for exact-file recovery.
                    </p>
                  )}
                  <div
                    className="button-row member-recovery-item__actions"
                    aria-label={`Recovery actions for ${issue.labMember}`}
                  >
                    <button
                      className="button button--secondary"
                      type="button"
                      onClick={() => void onGrantMemberAccess(issue)}
                      disabled={recoveryInProgress || !spreadsheetId}
                    >
                      {isBusy(issue, "picker")
                        ? "Opening Drive…"
                        : "Grant / verify exact file"}
                    </button>
                    <button
                      className="button button--ghost"
                      type="button"
                      onClick={() => void onRetryMember(issue)}
                      disabled={recoveryInProgress}
                    >
                      {isBusy(issue, "retry") ? "Retrying…" : "Retry member"}
                    </button>
                    <button
                      className="button button--danger"
                      type="button"
                      onClick={() => setConfirmDeactivation(issue)}
                      disabled={recoveryInProgress || !issue.memberId}
                      title={
                        issue.memberId
                          ? `Deactivate ${issue.labMember} in the authoritative backend`
                          : "A stable backend Member ID is required for deactivation."
                      }
                    >
                      Deactivate member
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          <ConfirmDialog
            open={confirmDeactivation !== null}
            title={`Deactivate ${confirmDeactivation?.labMember ?? "member"}?`}
            message={
              <>
                This removes the member from active authoritative access and dashboard loading.
                Healthy member data remains available. The current backend revision will be fetched
                again immediately before deactivation.
              </>
            }
            confirmLabel="Deactivate Member"
            confirmingLabel="Deactivating…"
            tone="danger"
            busy={
              confirmDeactivation
                ? isBusy(confirmDeactivation, "deactivate")
                : false
            }
            onCancel={() => setConfirmDeactivation(null)}
            onConfirm={async () => {
              if (!confirmDeactivation) return;
              await onDeactivateMember(confirmDeactivation);
              setConfirmDeactivation(null);
            }}
          />
        </div>
      ) : null}
    </>
  );
}

export function ManagerMetrics({
  metrics
}: {
  metrics: { total: number; compliant: number; overdue: number; missingCloseout: number };
}) {
  return (
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
  );
}

function dateMeta(value: string, strategy: "first" | "last" = "first") {
  const raw = String(value ?? "").trim();
  const parsed = parseTimelineDate(value, strategy);
  return {
    label: raw && !parsed ? "Invalid format" : formatDateLabel(parsed ?? value),
    invalid: !!raw && !parsed
  };
}

function ManagerTaskCard({
  record,
  profile,
  expanded,
  onToggleExpanded,
  onEdit,
  disabled = false
}: {
  record: ExperimentRecord;
  profile: LabMemberProfile;
  expanded: boolean;
  onToggleExpanded: () => void;
  onEdit: () => void;
  disabled?: boolean;
}) {
  const compliance = evaluateCompliance(record);
  const startDate = dateMeta(record.startDateRaw, "first");
  const endDate = dateMeta(record.projectedEndDateRaw, "last");
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
      {startDate.invalid ? (
        <p className="kanban-card__date-warning">
          Start date has an invalid format. Use YYYY-MM-DD or M/D/YYYY.
        </p>
      ) : null}
      {endDate.invalid ? (
        <p className="kanban-card__date-warning">
          Projected end date has an invalid format. Use YYYY-MM-DD or M/D/YYYY.
        </p>
      ) : null}
      {expanded ? <TaskDetailGrid record={record} /> : null}
      <div className="kanban-card__actions">
        <button className="button button--ghost" type="button" onClick={onEdit} disabled={disabled}>
          Edit task
        </button>
        <button
          className="button button--ghost kanban-card__see-more"
          type="button"
          onClick={onToggleExpanded}
          aria-expanded={expanded}
        >
          {expanded ? "See less" : "See more"}
        </button>
      </div>
    </article>
  );
}

interface ManagerKanbanProps {
  activeTab: string;
  activeLabMembers: string[];
  lanes: Record<KanbanLane, ExperimentRecord[]>;
  ownerGroupedLanes: Record<
    KanbanLane,
    Array<{ labMember: string; records: ExperimentRecord[] }>
  >;
  profiles: Record<string, LabMemberProfile>;
  expandedTaskIds: Set<string>;
  onToggleExpanded: (recordId: string) => void;
  onEditTask: (record: ExperimentRecord) => void;
  mutationsDisabled?: boolean;
}

export function ManagerKanban({
  activeTab,
  activeLabMembers,
  lanes,
  ownerGroupedLanes,
  profiles,
  expandedTaskIds,
  onToggleExpanded,
  onEditTask,
  mutationsDisabled = false
}: ManagerKanbanProps) {
  if (activeTab === ALL_EMPLOYEES_TAB && activeLabMembers.length === 0) {
    return (
      <section className="stack-md">
        <h2 className="sr-only">Task board</h2>
        <p className="empty-state">Select at least one member to show task cards.</p>
      </section>
    );
  }

  return (
    <section className="stack-md">
      <h2 className="sr-only">Task board</h2>
      <div
        className={`kanban-board kanban-board--four${
          activeTab === ALL_EMPLOYEES_TAB ? " kanban-board--owners" : ""
        }`}
      >
        {MANAGER_LANES.map((lane) => (
          <section
            className={`kanban-column kanban-column--${lane.key}`}
            key={lane.key}
            aria-label={lane.label}
          >
            <header className="kanban-column__header">
              <h3>{lane.label}</h3>
              <span className="kanban-column__count">{lanes[lane.key].length}</span>
            </header>
            <div
              className={`kanban-column__body${
                activeTab === ALL_EMPLOYEES_TAB ? " kanban-column__body--owners" : ""
              }`}
            >
              {lanes[lane.key].length === 0 ? (
                <p className="empty-state">No tasks here.</p>
              ) : activeTab === ALL_EMPLOYEES_TAB ? (
                ownerGroupedLanes[lane.key].map(({ labMember, records }) => (
                  <div
                    className="kanban-owner-group"
                    style={memberStyleVars(profiles[labMember])}
                    key={labMember}
                    aria-label={`${labMember} ${lane.label}`}
                  >
                    <header className="kanban-owner-group__header">
                      <LabMemberAvatar
                        profile={profiles[labMember]}
                        className="lab-member-avatar--sm"
                      />
                      <span className="kanban-owner-group__name">{labMember}</span>
                      <span className="kanban-owner-group__count">{records.length}</span>
                    </header>
                    <div className="kanban-owner-group__cards">
                      {records.map((record) => (
                        <ManagerTaskCard
                          key={record.id}
                          record={record}
                          profile={profiles[labMember]}
                          expanded={expandedTaskIds.has(record.id)}
                          onToggleExpanded={() => onToggleExpanded(record.id)}
                          onEdit={() => onEditTask(record)}
                          disabled={mutationsDisabled}
                        />
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                lanes[lane.key].map((record) => (
                  <ManagerTaskCard
                    key={record.id}
                    record={record}
                    profile={profiles[record.labMember]}
                    expanded={expandedTaskIds.has(record.id)}
                    onToggleExpanded={() => onToggleExpanded(record.id)}
                    onEdit={() => onEditTask(record)}
                    disabled={mutationsDisabled}
                  />
                ))
              )}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

export function EmployeeRollup({ reports }: { reports: EmployeeReport[] }) {
  return (
    <section className="stack-md">
      <h3>Member rollup</h3>
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
  );
}

export function ManagerActions({
  refreshing,
  lastRun,
  onRunSummary,
  onAddTask
}: {
  refreshing: boolean;
  lastRun: ManagerLastRun | null;
  onRunSummary: () => void;
  onAddTask: () => void;
}) {
  return (
    <div className="fab-group">
      <button
        className={`fab fab--secondary${refreshing ? " is-loading" : ""}`}
        type="button"
        onClick={onRunSummary}
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
        onClick={onAddTask}
        title="Add task"
        aria-label="Add task"
        disabled={refreshing}
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
  );
}
