import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  deriveLabMemberFromEmail,
  type EmployeeSheetPrefs
} from "../domain/app";
import type { DashboardDataset } from "../domain/experiment";
import {
  acceptedMemberPrefs,
  membershipPrefs
} from "../domain/onboarding";
import { resolveManagerLabMember } from "../domain/people";
import { writeEmployeePrefs } from "../services/cache";
import {
  GoogleSheetsAuthError,
  isGoogleSheetsAuthError
} from "../services/sheets/errors";
import { openSpreadsheetPicker } from "../services/googleDrivePicker";
import type {
  ManagerFileAccessIssue,
  StatusMessage
} from "./screens";
import { markDatasetStale } from "./datasetState";
import { useTaskMutations, type DatasetScope } from "./useTaskMutations";
import { useSessionOrchestration } from "./useSessionOrchestration";
import { useAccessVerification } from "./useAccessVerification";
import { useDatasetSync } from "./useDatasetSync";
import { useMemberLoadRecovery } from "./useMemberLoadRecovery";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function useAppController() {
  const [employeePrefs, setEmployeePrefs] = useState<EmployeeSheetPrefs | null>(null);
  const [employeeForceSetup, setEmployeeForceSetup] = useState(false);
  const [dataset, setDataset] = useState<DashboardDataset | null>(null);
  const [datasetScope, setDatasetScope] = useState<DatasetScope | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState<StatusMessage>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [managerFileAccessIssue, setManagerFileAccessIssue] =
    useState<ManagerFileAccessIssue | null>(null);
  const previousEmployeePrefsRef = useRef<string>("");

  const clearDataset = useCallback(() => {
    setDataset(null);
    setDatasetScope(null);
  }, []);

  const resetWorkspace = useCallback(() => {
    clearDataset();
    setStatus(null);
    setShowSetup(false);
    setEmployeeForceSetup(false);
    setRefreshing(false);
    setManagerFileAccessIssue(null);
    previousEmployeePrefsRef.current = "";
  }, [clearDataset]);

  const {
    config,
    setConfig,
    session,
    sessionLoading,
    signingIn,
    authError,
    authNotice,
    withFreshSession,
    requestGoogleSession,
    requireFreshGoogleSignIn,
    signOut
  } = useSessionOrchestration({
    onSessionStarted: () => {
      setStatus(null);
      setEmployeeForceSetup(false);
      previousEmployeePrefsRef.current = "";
    },
    onSessionCleared: resetWorkspace,
    onAuthError: (message) => setStatus({ kind: "error", text: message })
  });

  useEffect(() => {
    setEmployeePrefs(null);
  }, [session?.email]);

  const {
    viewer,
    probeAdminAccess,
    invitations,
    memberships,
    activeMembership,
    verifiedEmpty,
    accessFailure,
    accessPending,
    resolveMemberTaskPrefs,
    loadAuthoritativeManagerMembers,
    invalidateMemberConfigCache
  } = useAccessVerification({
    session,
    withFreshSession
  });

  useEffect(() => {
    if (!session || (!accessPending && memberships.length === 0)) {
      clearDataset();
    }
  }, [accessPending, clearDataset, memberships.length, session]);

  useEffect(() => {
    if (!activeMembership) return;
    setEmployeePrefs(membershipPrefs(activeMembership));
  }, [activeMembership]);

  const sessionEmailKey = session ? normalizeEmail(session.email) : "";
  const activeDataset =
    session &&
    datasetScope?.email === sessionEmailKey &&
    datasetScope.role === viewer.role
      ? dataset
      : null;

  const visibleLabMembers = useMemo(() => {
    if (viewer.role !== "manager" && viewer.role !== "pi") {
      return viewer.accessibleLabMembers;
    }
    return Array.from(
      new Set(activeDataset?.registry.map((entry) => entry.labMember) ?? [])
    ).sort();
  }, [viewer.role, viewer.accessibleLabMembers, activeDataset]);

  const managerOwnContext = useMemo(() => {
    if (
      (viewer.role !== "manager" && viewer.role !== "pi") ||
      !activeMembership ||
      !activeDataset
    ) {
      return null;
    }
    return resolveManagerLabMember(activeMembership.member.id, activeDataset);
  }, [viewer.role, activeMembership, activeDataset]);

  const managerOwnLabMember = managerOwnContext?.labMember ?? null;

  const managerOwnPrefs = useMemo(() => {
    if (
      !managerOwnContext ||
      !activeMembership ||
      managerOwnContext.registryEntry.memberId !== activeMembership.member.id
    ) {
      return null;
    }
    return acceptedMemberPrefs(activeMembership.config);
  }, [managerOwnContext, activeMembership]);

  const managerOwnExperiments = useMemo(() => {
    const memberId = managerOwnContext?.registryEntry.memberId;
    if (!memberId || !activeDataset) return [];
    return activeDataset.experiments.filter((record) => record.memberId === memberId);
  }, [managerOwnContext, activeDataset]);

  const employeeLabMember = useMemo(() => {
    if (viewer.role !== "employee" || !session) return "";
    return viewer.labMember ?? deriveLabMemberFromEmail(session.email, session.name);
  }, [viewer.role, viewer.labMember, session]);

  const previousAccessKeyRef = useRef(
    session ? `${viewer.role}:${sessionEmailKey}` : "guest"
  );
  useEffect(() => {
    const nextAccessKey = session ? `${viewer.role}:${sessionEmailKey}` : "guest";
    if (previousAccessKeyRef.current === nextAccessKey) return;

    previousAccessKeyRef.current = nextAccessKey;
    setStatus(null);
    setRefreshing(false);
    setShowSetup(false);
    setManagerFileAccessIssue(null);
    previousEmployeePrefsRef.current = "";
    if (viewer.role !== "employee") {
      setEmployeeForceSetup(false);
    }
  }, [session, sessionEmailKey, viewer.role]);

  const { loadManagerData, loadEmployeeData } = useDatasetSync({
    session,
    sessionEmailKey,
    viewer,
    onboardingReady: activeMembership?.member.onboarding.status === "ready",
    activeLabId: activeMembership?.lab.id ?? null,
    loadAuthoritativeManagerMembers,
    employeePrefs,
    employeeLabMember,
    activeDataset,
    datasetScope,
    previousEmployeePrefsRef,
    withFreshSession,
    requireFreshGoogleSignIn,
    setDataset,
    setDatasetScope,
    setLoading,
    setStatus,
    setEmployeeForceSetup,
    setManagerFileAccessIssue
  });

  const memberLoadRecovery = useMemberLoadRecovery({
    session,
    config,
    activeLabId: activeMembership?.lab.id ?? null,
    withFreshSession,
    requireFreshGoogleSignIn,
    loadManagerData,
    probeAdminAccess,
    invalidateMemberConfigCache,
    setStatus
  });

  const handleEmployeePrefsValidated = (prefs: EmployeeSheetPrefs) => {
    if (!session) return;
    writeEmployeePrefs(session.email, prefs);
    setEmployeePrefs(prefs);
    setEmployeeForceSetup(false);
    previousEmployeePrefsRef.current = "";
    setStatus({ kind: "success", text: "Task-log workbook connected." });
  };

  const managerRole: "manager" | "pi" =
    viewer.role === "pi" ? "pi" : "manager";
  const resolveActiveLabMemberTaskPrefs = useCallback(
    (memberId: string, freshSession: Parameters<typeof resolveMemberTaskPrefs>[2]) => {
      if (!activeMembership) {
        return Promise.reject(
          new Error("Verified Member access is required to change tasks.")
        );
      }
      return resolveMemberTaskPrefs(
        activeMembership.lab.id,
        memberId,
        freshSession
      );
    },
    [activeMembership, resolveMemberTaskPrefs]
  );

  const taskMutations = useTaskMutations({
    session,
    employeePrefs,
    employeeLabMember,
    managerRole,
    activeLabId: activeMembership?.lab.id ?? null,
    managerOwnEntry: managerOwnContext?.registryEntry ?? null,
    loadAuthoritativeManagerMembers,
    resolveMemberTaskPrefs: resolveActiveLabMemberTaskPrefs,
    withFreshSession,
    requireFreshGoogleSignIn,
    setDataset,
    setDatasetScope,
    setManagerFileAccessIssue,
    setStatus
  });

  const handleManagerRefresh = async (): Promise<DashboardDataset | null> => {
    if (!session) return null;
    setRefreshing(true);
    try {
      return await loadManagerData();
    } finally {
      setRefreshing(false);
    }
  };

  const handleTeamSetupSaved = async () => {
    const reason = "Team configuration changed; reloading authoritative data.";
    setDataset((current) =>
      current ? markDatasetStale(current, reason) : current
    );
    invalidateMemberConfigCache();
    await probeAdminAccess();
    await loadManagerData();
  };

  const handleGrantManagerTaskLogAccess = async () => {
    if (!session || !managerFileAccessIssue) return;
    const firstMissingTaskLogUrl = managerFileAccessIssue.missingSpreadsheets.find(
      (sheet) => sheet.taskLogUrl.trim()
    )?.taskLogUrl;
    setRefreshing(true);
    try {
      const picked = await withFreshSession(async (freshSession) => {
        if (!freshSession.accessToken) {
          throw new GoogleSheetsAuthError();
        }
        return openSpreadsheetPicker({
          accessToken: freshSession.accessToken,
          apiKey: config.googleApiKey,
          appId: config.googleAppId,
          multiselect: true,
          query: firstMissingTaskLogUrl,
          title: "Choose Task-log workbooks"
        });
      });
      if (picked.length > 0) {
        const requiredIds = new Set(
          managerFileAccessIssue.missingSpreadsheets
            .map((sheet) => sheet.spreadsheetId)
            .filter(Boolean)
        );
        const pickedIds = new Set(picked.map((file) => file.id));
        const verifiedCount = [...requiredIds].filter((id) => pickedIds.has(id)).length;
        const remainingCount = requiredIds.size - verifiedCount;
        setStatus({
          kind: remainingCount === 0 ? "success" : "info",
          text:
            remainingCount === 0
              ? `Selected all ${verifiedCount} requested Task-log workbooks in Drive Picker. Retrying the dataset load.`
              : `Selected ${verifiedCount} of ${requiredIds.size} requested files. ${remainingCount} exact file${remainingCount === 1 ? "" : "s"} still need Picker selection.`
        });
        await loadManagerData();
      }
    } catch (error) {
      if (isGoogleSheetsAuthError(error)) {
        requireFreshGoogleSignIn();
        return;
      }
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Could not open Drive Picker."
      });
    } finally {
      setRefreshing(false);
    }
  };

  return {
    sessionLoading,
    config,
    setConfig,
    session,
    signingIn,
    authError,
    authNotice,
    viewer,
    accessFailure,
    activeMembership,
    invitations,
    verifiedEmpty,
    employeePrefs,
    employeeForceSetup,
    activeDataset,
    visibleLabMembers,
    managerOwnLabMember,
    managerOwnPrefs,
    managerOwnExperiments,
    employeeLabMember,
    managerRole,
    loading,
    refreshing,
    status,
    showSetup,
    managerFileAccessIssue,
    memberLoadRecovery,
    ...taskMutations,
    setStatus,
    setShowSetup,
    setEmployeeForceSetup,
    requestGoogleSession,
    signOut,
    probeAdminAccess,
    loadManagerData,
    loadEmployeeData,
    handleEmployeePrefsValidated,
    handleManagerRefresh,
    handleTeamSetupSaved,
    handleGrantManagerTaskLogAccess
  };
}

export type AppController = ReturnType<typeof useAppController>;
