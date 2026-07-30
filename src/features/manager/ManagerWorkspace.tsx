import { useEffect, useState } from "react";
import type { EmployeeSheetPrefs, UserSession } from "../../domain/app";
import type {
  DashboardDataset,
  ExperimentDraft,
  ExperimentRecord,
  MemberLoadIssue,
  SheetRegistryEntry
} from "../../domain/experiment";
import { formatDateLabel } from "../../utils/date";
import { readManagerScopeMode, writeManagerScopeMode } from "../../services/cache";
import { GanttView } from "../gantt/GanttView";
import { SegmentedControl, SyncStatus } from "../../components/ui";
import {
  EmployeeWorkspace,
  type CompletionPayload,
  type OverduePayload
} from "../employee/EmployeeWorkspace";
import { ChangeLogPanel } from "./ChangeLogPanel";
import {
  EmployeeFilter,
  EmployeeRollup,
  ManagerActions,
  ManagerKanban,
  ManagerMetrics,
  ManagerWarnings,
  ReorderableTabs,
  managerTabId
} from "./ManagerDashboardComponents";
import { AddTaskDialog, EditTaskDialog } from "./ManagerTaskDialogs";
import {
  ALL_EMPLOYEES_TAB,
  useManagerDashboard
} from "./useManagerDashboard";
import { useManagerRunSummary } from "./useManagerRunSummary";

type WorkspaceView = "kanban" | "gantt";

interface ManagerWorkspaceProps {
  session: UserSession;
  labId: string;
  viewerRole: "manager" | "pi";
  dataset: DashboardDataset;
  visibleLabMembers: string[];
  managerOwnLabMember: string | null;
  managerOwnPrefs: EmployeeSheetPrefs | null;
  managerOwnExperiments: ExperimentRecord[];
  saving: boolean;
  refreshing: boolean;
  onRefresh: () => Promise<DashboardDataset | null>;
  onReconnect: () => void;
  onSignOut: () => void;
  onOpenSetup: () => void;
  memberRecoveryBusyKey: string | null;
  onGrantMemberAccess: (issue: MemberLoadIssue) => void | Promise<void>;
  onRetryMember: (issue: MemberLoadIssue) => void | Promise<void>;
  onDeactivateMember: (issue: MemberLoadIssue) => void | Promise<void>;
  onCreateTask: (entry: SheetRegistryEntry, draft: ExperimentDraft) => Promise<void>;
  onUpdateTask: (record: ExperimentRecord, draft: ExperimentDraft) => Promise<void>;
  onCreateOwnTask: (draft: ExperimentDraft) => Promise<void>;
  onUpdateOwnTask: (record: ExperimentRecord, draft: ExperimentDraft) => Promise<void>;
  onCompleteOwnTask: (payload: CompletionPayload) => Promise<void>;
  onResolveOwnOverdue: (payload: OverduePayload) => Promise<void>;
  reconnecting: boolean;
}

export function ManagerWorkspace({
  session,
  labId,
  viewerRole,
  dataset,
  visibleLabMembers,
  managerOwnLabMember,
  managerOwnPrefs,
  managerOwnExperiments,
  saving,
  refreshing,
  onRefresh,
  onReconnect,
  onSignOut,
  onOpenSetup,
  memberRecoveryBusyKey,
  onGrantMemberAccess,
  onRetryMember,
  onDeactivateMember,
  onCreateTask,
  onUpdateTask,
  onCreateOwnTask,
  onUpdateOwnTask,
  onCompleteOwnTask,
  onResolveOwnOverdue,
  reconnecting
}: ManagerWorkspaceProps) {
  const [scopeMode, setScopeMode] = useState(
    () => readManagerScopeMode(session.email) ?? "team"
  );
  const [showAddTask, setShowAddTask] = useState(false);
  const [editingTask, setEditingTask] = useState<ExperimentRecord | null>(null);
  const [view, setView] = useState<WorkspaceView>("kanban");
  const dashboard = useManagerDashboard(session.email, dataset, visibleLabMembers);
  const runSummary = useManagerRunSummary(session.email, labId, onRefresh);

  const canUseMyTasks = !!managerOwnLabMember && !!managerOwnPrefs;
  const primaryScopeLabel = viewerRole === "pi" ? "PI view" : "Manager view";
  const dashboardTitle = viewerRole === "pi" ? "PI dashboard" : "Manager dashboard";
  const scopeLabel =
    dashboard.activeTab === ALL_EMPLOYEES_TAB
      ? `Across ${dashboard.activeLabMembers.length} member${
          dashboard.activeLabMembers.length === 1 ? "" : "s"
        }`
      : `Filtered to ${dashboard.activeTab}`;

  const handleScopeChange = (next: "team" | "mine") => {
    setScopeMode(next);
    writeManagerScopeMode(session.email, next);
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

  useEffect(() => {
    if (!editingTask) return;
    const latest = dataset.experiments.find(
      (record) => record.id === editingTask.id
    );
    if (latest && latest !== editingTask) {
      // Refresh concurrency metadata without replacing the dialog's local draft.
      setEditingTask(latest);
    }
  }, [dataset.experiments, editingTask]);

  return (
    <div
      className={`manager-shell${scopeMode === "team" ? " manager-shell--with-actions" : ""}`}
    >
      <header className="manager-topbar">
        <div>
          <h1>{dashboardTitle}</h1>
          <p className="muted-row">
            Source: <strong>Google Sheets</strong>
            {dataset.lastSyncedAt ? ` · Last sync ${formatDateLabel(dataset.lastSyncedAt)}` : ""}
          </p>
          {dataset.syncNote ? <p className="muted-row">{dataset.syncNote}</p> : null}
        </div>
        <nav className="manager-topbar__actions" aria-label="Account and workspace actions">
          <span className="muted-row">{session.email}</span>
          <button className="button button--ghost" type="button" onClick={onOpenSetup}>
            Team setup
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
        </nav>
      </header>
      <SyncStatus
        state={refreshing ? "syncing" : dataset.cacheStaleReason ? "stale" : "synced"}
        lastSyncedAt={dataset.lastSyncedAt}
      />

      {dataset.cacheStaleReason ? (
        <div className="callout callout--warning stack-xs" role="alert">
          <strong>Stale data — refresh required</strong>
          <p>{dataset.cacheStaleReason}</p>
          {dataset.cacheInvalidatedAt ? (
            <p className="muted-row">
              Invalidated {formatDateLabel(dataset.cacheInvalidatedAt)}
            </p>
          ) : null}
          <button
            className="button button--primary"
            type="button"
            onClick={() => void onRefresh()}
            disabled={refreshing}
          >
            {refreshing ? "Refreshing…" : "Refresh now"}
          </button>
        </div>
      ) : null}

      <ManagerWarnings
        dataset={dataset}
        onOpenSetup={onOpenSetup}
        recoveryBusyKey={memberRecoveryBusyKey}
        onGrantMemberAccess={onGrantMemberAccess}
        onRetryMember={onRetryMember}
        onDeactivateMember={onDeactivateMember}
      />

      <div className="manager-scope-controls">
        <SegmentedControl
          aria-label="Dashboard scope"
          className="view-switcher"
          value={scopeMode}
          onChange={(next) => handleScopeChange(next as "team" | "mine")}
          options={[
            { value: "team", label: primaryScopeLabel, panelId: "tasks-main" },
            { value: "mine", label: "Personal tasks", panelId: "tasks-main" }
          ]}
        />
        {scopeMode === "team" ? (
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
        ) : null}
      </div>

      {scopeMode === "mine" ? (
        canUseMyTasks && managerOwnPrefs && managerOwnLabMember ? (
          <EmployeeWorkspace
            variant="embedded"
            session={session}
            labMember={managerOwnLabMember}
            prefs={managerOwnPrefs}
            experiments={managerOwnExperiments}
            saving={saving}
            loading={refreshing}
            lastSyncedAt={dataset.lastSyncedAt}
            staleReason={dataset.cacheStaleReason}
            onRefresh={onRefresh}
            onCreate={onCreateOwnTask}
            onUpdate={onUpdateOwnTask}
            onComplete={onCompleteOwnTask}
            onResolveOverdue={onResolveOwnOverdue}
            onChangePrefs={onOpenSetup}
            onReconnect={onReconnect}
            onSignOut={onSignOut}
            reconnecting={reconnecting}
          />
        ) : (
          <div className="callout stack-xs">
            <strong>No member linked to your account.</strong>
            <p className="muted-row">
              Add yourself in <strong>Team setup</strong> with a Task-log workbook and the same
              sign-in email, then enable the Member access role.
            </p>
            <div className="button-row">
              <button className="button button--secondary" type="button" onClick={onOpenSetup}>
                Open Team setup
              </button>
            </div>
          </div>
        )
      ) : (
        <>
          <ReorderableTabs
            order={dashboard.tabOrder}
            active={dashboard.activeTab}
            onSelect={dashboard.setActiveTab}
            onReorder={dashboard.handleReorder}
          />
          <div
            id="tasks-main"
            className="stack-md"
            role="tabpanel"
            aria-labelledby={managerTabId(dashboard.activeTab)}
            aria-busy={refreshing || undefined}
            tabIndex={-1}
          >
          <ManagerMetrics metrics={dashboard.metrics} />
          {dashboard.activeTab === ALL_EMPLOYEES_TAB ? (
            <EmployeeFilter
              labMembers={visibleLabMembers}
              selected={dashboard.selectedLabMemberSet}
              profiles={dashboard.labMemberProfiles}
              onSelectAll={() => dashboard.setSelectedLabMembers(visibleLabMembers)}
              onSelectNone={() => dashboard.setSelectedLabMembers([])}
              onToggle={dashboard.handleToggleLabMember}
            />
          ) : null}

          {view === "kanban" ? (
            <ManagerKanban
              activeTab={dashboard.activeTab}
              activeLabMembers={dashboard.activeLabMembers}
              lanes={dashboard.lanes}
              ownerGroupedLanes={dashboard.ownerGroupedLanes}
              profiles={dashboard.labMemberProfiles}
              expandedTaskIds={dashboard.expandedTaskIds}
              onToggleExpanded={dashboard.handleToggleExpandedTask}
              onEditTask={setEditingTask}
              mutationsDisabled={refreshing || saving}
            />
          ) : (
            <GanttView
              mode="manager"
              experiments={dashboard.ganttExperiments}
              labMembers={dashboard.activeLabMembers}
              defaultSelection={dashboard.activeLabMembers}
              labMemberProfiles={dashboard.labMemberProfiles}
              onEditTask={setEditingTask}
            />
          )}

          <EmployeeRollup reports={dashboard.reports} />
          <ChangeLogPanel
            experiments={dashboard.filteredExperiments}
            previousSnapshot={runSummary.previousSnapshot}
            lastRun={runSummary.lastRun}
            scopeLabel={scopeLabel}
          />
          <ManagerActions
            refreshing={refreshing || saving}
            lastRun={runSummary.lastRun}
            onRunSummary={runSummary.runSummary}
            onAddTask={() => setShowAddTask(true)}
          />

          {showAddTask ? (
            <AddTaskDialog
              registry={dataset.registry}
              initialMemberId={
                dashboard.activeTab !== ALL_EMPLOYEES_TAB &&
                dashboard.activeLabMembers.includes(dashboard.activeTab)
                  ? dataset.registry.find(
                      (entry) => entry.labMember === dashboard.activeTab
                    )?.memberId
                  : undefined
              }
              saving={saving}
              onClose={() => setShowAddTask(false)}
              onSubmit={handleAddTask}
            />
          ) : null}
          {editingTask ? (
            <EditTaskDialog
              record={editingTask}
              saving={saving}
              onClose={() => setEditingTask(null)}
              onSubmit={handleUpdateTask}
            />
          ) : null}
          </div>
        </>
      )}
    </div>
  );
}
