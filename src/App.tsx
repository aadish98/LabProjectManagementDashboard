import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  deriveLabMemberFromEmail,
  type AppConfig,
  type EmployeeSheetPrefs,
  type UserSession
} from "./domain/app";
import type {
  DashboardDataset,
  ExperimentDraft,
  ExperimentRecord,
  SheetRegistryEntry
} from "./domain/experiment";
import { resolveViewerContext } from "./auth/roles";
import {
  readEmployeePrefs,
  readStoredConfig,
  readStoredSession,
  writeEmployeePrefs,
  writeStoredConfig,
  writeStoredSession
} from "./services/cache";
import {
  completeTaskInSheet,
  createTaskInSheet,
  loadEmployeeDataset,
  loadGoogleSheetsDataset,
  isGoogleSheetsAuthError,
  resolveOverdueTaskInSheet,
  updateTaskInSheet
} from "./services/googleSheets";
import { signInWithGoogle } from "./auth/googleIdentity";
import { ConfigPanel } from "./components/ConfigPanel";
import { SignedOutScreen } from "./components/SignedOutScreen";
import { UnauthorizedScreen } from "./components/UnauthorizedScreen";
import { EmployeeSetupGate } from "./components/EmployeeSetupGate";
import {
  EmployeeWorkspace,
  type CompletionPayload,
  type OverduePayload
} from "./features/employee/EmployeeWorkspace";
import { ManagerWorkspace } from "./features/manager/ManagerWorkspace";

type StatusMessage =
  | { kind: "info" | "error" | "success"; text: string }
  | null;

type DatasetScope = {
  role: "employee" | "manager";
  email: string;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export default function App() {
  const [config, setConfig] = useState<AppConfig>(() => readStoredConfig());
  const [session, setSession] = useState<UserSession | null>(() => readStoredSession());
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const [employeePrefs, setEmployeePrefs] = useState<EmployeeSheetPrefs | null>(null);
  const [employeeForceSetup, setEmployeeForceSetup] = useState(false);
  const [dataset, setDataset] = useState<DashboardDataset | null>(null);
  const [datasetScope, setDatasetScope] = useState<DatasetScope | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState<StatusMessage>(null);
  const [showSetup, setShowSetup] = useState(false);

  useEffect(() => {
    writeStoredConfig(config);
  }, [config]);

  useEffect(() => {
    writeStoredSession(session);
  }, [session]);

  useEffect(() => {
    if (!session) {
      setEmployeePrefs(null);
      return;
    }
    setEmployeePrefs(readEmployeePrefs(session.email));
  }, [session?.email]);

  const viewer = useMemo(
    () => resolveViewerContext(session, dataset, config),
    [session, dataset, config]
  );

  const sessionEmailKey = session ? normalizeEmail(session.email) : "";
  const activeDataset =
    session &&
    datasetScope?.email === sessionEmailKey &&
    datasetScope.role === viewer.role
      ? dataset
      : null;

  const visibleLabMembers = useMemo(() => {
    if (viewer.role !== "manager") return viewer.accessibleLabMembers;
    return Array.from(new Set(activeDataset?.registry.map((entry) => entry.labMember) ?? [])).sort();
  }, [viewer.role, viewer.accessibleLabMembers, activeDataset]);

  const employeeLabMember = useMemo(() => {
    if (viewer.role !== "employee" || !session) return "";
    return viewer.labMember ?? deriveLabMemberFromEmail(session.email, session.name);
  }, [viewer.role, viewer.labMember, session]);

  const previousEmployeePrefsRef = useRef<string>("");
  const requireFreshGoogleSignIn = useCallback(() => {
    setAuthError("");
    setAuthNotice("Google needs a fresh sign-in to continue.");
    setSession(null);
    setDataset(null);
    setDatasetScope(null);
    setStatus(null);
    setShowSetup(false);
    setEmployeeForceSetup(false);
    setSaving(false);
    setRefreshing(false);
    previousEmployeePrefsRef.current = "";
  }, []);

  const previousAccessKeyRef = useRef(session ? `${viewer.role}:${sessionEmailKey}` : "guest");
  useEffect(() => {
    const nextAccessKey = session ? `${viewer.role}:${sessionEmailKey}` : "guest";
    if (previousAccessKeyRef.current === nextAccessKey) return;

    previousAccessKeyRef.current = nextAccessKey;
    setDataset(null);
    setDatasetScope(null);
    setStatus(null);
    setSaving(false);
    setRefreshing(false);
    setShowSetup(false);
    previousEmployeePrefsRef.current = "";
    if (viewer.role !== "employee") {
      setEmployeeForceSetup(false);
    }
  }, [session, sessionEmailKey, viewer.role]);

  const loadManagerData = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const next = await loadGoogleSheetsDataset(config, session);
      setDataset(next);
      setDatasetScope({ role: "manager", email: normalizeEmail(session.email) });
      setStatus(null);
    } catch (error) {
      if (isGoogleSheetsAuthError(error)) {
        requireFreshGoogleSignIn();
        return;
      }
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Unable to load manager data."
      });
      setDataset(null);
      setDatasetScope(null);
    } finally {
      setLoading(false);
    }
  }, [config, requireFreshGoogleSignIn, session]);

  const loadEmployeeData = useCallback(
    async (prefs: EmployeeSheetPrefs) => {
      if (!session) return;
      setLoading(true);
      try {
        const next = await loadEmployeeDataset(prefs, employeeLabMember, session);
        setDataset(next);
        setDatasetScope({ role: "employee", email: normalizeEmail(session.email) });
        setStatus(null);
      } catch (error) {
        if (isGoogleSheetsAuthError(error)) {
          requireFreshGoogleSignIn();
          return;
        }
        setStatus({
          kind: "error",
          text:
            error instanceof Error
              ? error.message
              : "Unable to load your task log. Re-check the URL and tab name."
        });
        setDataset(null);
        setDatasetScope(null);
        setEmployeeForceSetup(true);
      } finally {
        setLoading(false);
      }
    },
    [employeeLabMember, requireFreshGoogleSignIn, session]
  );

  useEffect(() => {
    if (!session) {
      setDataset(null);
      setDatasetScope(null);
      return;
    }
    if (viewer.role === "manager") {
      void loadManagerData();
    }
  }, [session?.accessToken, viewer.role, loadManagerData]);

  useEffect(() => {
    if (!session || viewer.role !== "employee") return;
    if (!employeePrefs) {
      setDataset(null);
      setDatasetScope(null);
      return;
    }
    const key = `${employeePrefs.taskLogUrl}::${employeePrefs.activeSheetName}`;
    if (key === previousEmployeePrefsRef.current && activeDataset) return;
    previousEmployeePrefsRef.current = key;
    void loadEmployeeData(employeePrefs);
  }, [session?.accessToken, viewer.role, employeePrefs, loadEmployeeData, activeDataset]);

  const requestGoogleSession = async () => {
    setAuthError("");
    setAuthNotice("");
    setSigningIn(true);
    try {
      const next = await signInWithGoogle(config.googleClientId);
      setSession(next);
      setStatus(null);
      setEmployeeForceSetup(false);
      previousEmployeePrefsRef.current = "";
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to complete Google sign-in.";
      setAuthError(message);
      setAuthNotice("");
      setStatus({ kind: "error", text: message });
    } finally {
      setSigningIn(false);
    }
  };

  const handleSignIn = () => {
    void requestGoogleSession();
  };

  const handleReconnect = () => {
    void requestGoogleSession();
  };

  const handleSignOut = () => {
    setAuthError("");
    setAuthNotice("");
    setSession(null);
    setDataset(null);
    setDatasetScope(null);
    setStatus(null);
    setShowSetup(false);
    setEmployeeForceSetup(false);
    previousEmployeePrefsRef.current = "";
  };

  const handleEmployeePrefsValidated = (prefs: EmployeeSheetPrefs) => {
    if (!session) return;
    writeEmployeePrefs(session.email, prefs);
    setEmployeePrefs(prefs);
    setEmployeeForceSetup(false);
    previousEmployeePrefsRef.current = "";
    setStatus({ kind: "success", text: "Task log connected." });
  };

  const handleChangePrefs = () => {
    setEmployeeForceSetup(true);
  };

  const handleEmployeeCreate = async (draft: ExperimentDraft) => {
    if (!session || !employeePrefs) return;
    setSaving(true);
    try {
      await createTaskInSheet(employeePrefs, session, draft);
      await loadEmployeeData(employeePrefs);
      setStatus({ kind: "success", text: "Task created." });
    } catch (error) {
      if (isGoogleSheetsAuthError(error)) {
        requireFreshGoogleSignIn();
        return;
      }
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Unable to create the task."
      });
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const handleEmployeeUpdate = async (rowNumber: number, draft: ExperimentDraft) => {
    if (!session || !employeePrefs) return;
    setSaving(true);
    try {
      await updateTaskInSheet(employeePrefs, session, rowNumber, draft);
      await loadEmployeeData(employeePrefs);
      setStatus({ kind: "success", text: "Task updated." });
    } catch (error) {
      if (isGoogleSheetsAuthError(error)) {
        requireFreshGoogleSignIn();
        return;
      }
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Unable to update the task."
      });
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const handleEmployeeComplete = async (payload: CompletionPayload) => {
    if (!session || !employeePrefs) return;
    setSaving(true);
    try {
      await completeTaskInSheet(employeePrefs, session, payload);
      await loadEmployeeData(employeePrefs);
      setStatus({ kind: "success", text: "Task marked complete." });
    } catch (error) {
      if (isGoogleSheetsAuthError(error)) {
        requireFreshGoogleSignIn();
        return;
      }
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Unable to mark the task complete."
      });
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const handleEmployeeOverdue = async (payload: OverduePayload) => {
    if (!session || !employeePrefs) return;
    setSaving(true);
    try {
      await resolveOverdueTaskInSheet(employeePrefs, session, payload);
      await loadEmployeeData(employeePrefs);
      setStatus({ kind: "success", text: "Overdue task updated." });
    } catch (error) {
      if (isGoogleSheetsAuthError(error)) {
        requireFreshGoogleSignIn();
        return;
      }
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Unable to record overdue resolution."
      });
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const handleManagerRefresh = async () => {
    if (!session) return;
    setRefreshing(true);
    try {
      await loadManagerData();
    } finally {
      setRefreshing(false);
    }
  };

  const handleManagerCreateTask = async (
    entry: SheetRegistryEntry,
    draft: ExperimentDraft
  ) => {
    if (!session) return;
    setSaving(true);
    try {
      await createTaskInSheet(
        { taskLogUrl: entry.taskLogUrl, activeSheetName: entry.activeSheetName },
        session,
        draft
      );
      await loadManagerData();
      setStatus({ kind: "success", text: `Task added for ${entry.labMember}.` });
    } catch (error) {
      if (isGoogleSheetsAuthError(error)) {
        requireFreshGoogleSignIn();
        return;
      }
      setStatus({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : `Unable to add task for ${entry.labMember}.`
      });
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const handleManagerUpdateTask = async (
    record: ExperimentRecord,
    draft: ExperimentDraft
  ) => {
    if (!session) return;
    if (record.rowNumber == null) {
      throw new Error("Cannot update a task without a row number.");
    }

    setSaving(true);
    try {
      await updateTaskInSheet(
        { taskLogUrl: record.taskLogUrl, activeSheetName: record.activeSheetName },
        session,
        record.rowNumber,
        draft
      );
      await loadManagerData();
      setStatus({ kind: "success", text: `Task updated for ${record.labMember}.` });
    } catch (error) {
      if (isGoogleSheetsAuthError(error)) {
        requireFreshGoogleSignIn();
        return;
      }
      setStatus({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : `Unable to update task for ${record.labMember}.`
      });
      throw error;
    } finally {
      setSaving(false);
    }
  };

  if (!session) {
    return (
      <SignedOutScreen
        onSignIn={handleSignIn}
        signingIn={signingIn}
        errorMessage={authError}
        noticeMessage={authNotice}
      />
    );
  }

  if (viewer.role === "unauthorized") {
    return (
      <div className="page-shell">
        {status ? (
          <div className={`banner banner--${status.kind === "error" ? "error" : "info"}`}>
            {status.text}
          </div>
        ) : null}
        <UnauthorizedScreen
          email={session.email}
          reconnecting={signingIn}
          onReconnect={handleReconnect}
          onOpenSetup={() => setShowSetup(true)}
          onSignOut={handleSignOut}
        />
        {showSetup ? (
          <ConfigPanel
            config={config}
            onChange={setConfig}
            onReload={() => {
              void loadManagerData();
            }}
            onClose={() => setShowSetup(false)}
          />
        ) : null}
      </div>
    );
  }

  if (viewer.role === "employee") {
    if (!employeePrefs || employeeForceSetup) {
      return (
        <EmployeeSetupGate
          session={session}
          initialPrefs={employeePrefs}
          onValidated={handleEmployeePrefsValidated}
          onReconnect={handleReconnect}
          onSignOut={handleSignOut}
          reconnecting={signingIn}
        />
      );
    }

    return (
      <div className="page-shell">
        {status ? (
          <div className={`banner banner--${status.kind === "error" ? "error" : "info"}`}>
            {status.text}
          </div>
        ) : null}
        <EmployeeWorkspace
          session={session}
          labMember={employeeLabMember}
          prefs={employeePrefs}
          experiments={activeDataset?.experiments ?? []}
          saving={saving}
          loading={loading}
          onCreate={handleEmployeeCreate}
          onUpdate={handleEmployeeUpdate}
          onComplete={handleEmployeeComplete}
          onResolveOverdue={handleEmployeeOverdue}
          onChangePrefs={handleChangePrefs}
          onReconnect={handleReconnect}
          onSignOut={handleSignOut}
          reconnecting={signingIn}
        />
      </div>
    );
  }

  return (
    <div className="page-shell">
      {status ? (
        <div className={`banner banner--${status.kind === "error" ? "error" : "info"}`}>
          {status.text}
        </div>
      ) : null}
      {showSetup ? (
        <ConfigPanel
          config={config}
          onChange={setConfig}
          onReload={() => {
            void loadManagerData();
          }}
          onClose={() => setShowSetup(false)}
        />
      ) : null}
      {activeDataset ? (
        <ManagerWorkspace
          session={session}
          config={config}
          dataset={activeDataset}
          visibleLabMembers={visibleLabMembers}
          saving={saving}
          refreshing={refreshing || loading}
          onRefresh={handleManagerRefresh}
          onReconnect={handleReconnect}
          onSignOut={handleSignOut}
          onOpenSetup={() => setShowSetup(true)}
          onCreateTask={handleManagerCreateTask}
          onUpdateTask={handleManagerUpdateTask}
          reconnecting={signingIn}
        />
      ) : (
        <div className="manager-shell">
          <header className="manager-topbar">
            <div>
              <h1>Manager dashboard</h1>
              <p className="muted-row">{loading ? "Loading dataset…" : "No data loaded."}</p>
            </div>
            <div className="manager-topbar__actions">
              <span className="muted-row">{session.email}</span>
              <button
                className="button button--ghost"
                type="button"
                onClick={() => setShowSetup(true)}
              >
                Setup
              </button>
              <button
                className="button button--ghost"
                type="button"
                onClick={handleReconnect}
                disabled={signingIn}
              >
                {signingIn ? "Reconnecting..." : "Reconnect Google"}
              </button>
              <button className="button button--secondary" type="button" onClick={handleSignOut}>
                Sign out
              </button>
            </div>
          </header>
          <div className="callout">
            {loading ? (
              <p>Loading…</p>
            ) : (
              <>
                <p>
                  Couldn’t load the manager dataset. Open Setup to update the admin spreadsheet ID
                  or sheet names, then click <strong>Reload data</strong>.
                </p>
                <button
                  className="button button--primary"
                  type="button"
                  onClick={() => void loadManagerData()}
                >
                  Try again
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
