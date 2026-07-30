import { useCallback, useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { EmployeeSheetPrefs, UserSession, ViewerContext } from "../domain/app";
import type { DashboardDataset } from "../domain/experiment";
import type { Membership } from "../domain/onboarding";
import {
  isGoogleSheetsAuthError,
  isGoogleSheetsFileAccessError,
  sheetsErrorMessage,
  sheetsErrorStatusFields
} from "../services/sheets/errors";
import {
  loadGoogleSheetsDataset
} from "../services/sheets/dataset";
import { extractIdFromUrl } from "../services/sheets/helpers";
import { loadEmployeeDataset } from "../services/sheets/taskLog";
import type { DatasetScope } from "./useTaskMutations";
import type { ManagerFileAccessIssue, StatusMessage } from "./screens";

type FreshSessionRunner = <T>(
  operation: (freshSession: UserSession) => Promise<T>
) => Promise<T>;

interface DatasetSyncOptions {
  session: UserSession | null;
  sessionEmailKey: string;
  viewer: ViewerContext;
  onboardingReady: boolean;
  activeLabId: string | null;
  loadAuthoritativeManagerMembers: (
    labId: string,
    session: UserSession
  ) => Promise<Array<Pick<Membership, "member" | "config">>>;
  employeePrefs: EmployeeSheetPrefs | null;
  employeeLabMember: string;
  activeDataset: DashboardDataset | null;
  datasetScope: DatasetScope | null;
  previousEmployeePrefsRef: MutableRefObject<string>;
  withFreshSession: FreshSessionRunner;
  requireFreshGoogleSignIn: () => void;
  setDataset: Dispatch<SetStateAction<DashboardDataset | null>>;
  setDatasetScope: Dispatch<SetStateAction<DatasetScope | null>>;
  setLoading: Dispatch<SetStateAction<boolean>>;
  setStatus: Dispatch<SetStateAction<StatusMessage>>;
  setEmployeeForceSetup: Dispatch<SetStateAction<boolean>>;
  setManagerFileAccessIssue: Dispatch<SetStateAction<ManagerFileAccessIssue | null>>;
}

const normalizeEmail = (email: string) => email.trim().toLowerCase();

export function useDatasetSync(options: DatasetSyncOptions) {
  const {
    session,
    sessionEmailKey,
    viewer,
    onboardingReady,
    activeLabId,
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
  } = options;

  const loadManagerData = useCallback(async (): Promise<DashboardDataset | null> => {
    if (!session || !activeLabId) return null;
    setLoading(true);
    try {
      const { dataset: next, freshSession } = await withFreshSession(async (freshSession) => {
        const authoritativeMembers = await loadAuthoritativeManagerMembers(
          activeLabId,
          freshSession
        );
        return {
          dataset: await loadGoogleSheetsDataset(freshSession, {
            labId: activeLabId,
            viewerRole: viewer.role === "pi" ? "pi" : "manager",
            authoritativeMembers
          }),
          freshSession
        };
      });
      setDataset(next);
      setDatasetScope({
        role: viewer.role === "pi" ? "pi" : "manager",
        email: normalizeEmail(freshSession.email)
      });
      const pickerIssues =
        next.memberLoadIssues?.filter((issue) => issue.code === "pickerGrant") ??
        [];
      setManagerFileAccessIssue(
        pickerIssues.length > 0
          ? {
              message: `Drive Picker access is needed for ${pickerIssues.length} Task-log workbook${
                pickerIssues.length === 1 ? "" : "s"
              }.`,
              missingSpreadsheets: pickerIssues.map((issue) => ({
                spreadsheetId: extractIdFromUrl(issue.taskLogUrl),
                taskLogUrl: issue.taskLogUrl,
                labMember: issue.labMember,
                activeSheetName: issue.activeSheetName
              }))
            }
          : null
      );
      setStatus(null);
      return next;
    } catch (error) {
      if (isGoogleSheetsAuthError(error)) {
        requireFreshGoogleSignIn();
        return null;
      }
      if (isGoogleSheetsFileAccessError(error)) {
        setManagerFileAccessIssue({
          message: error.message,
          missingSpreadsheets: error.missingSpreadsheets
        });
        setStatus({
          kind: "error",
          ...sheetsErrorStatusFields(error),
          text: error.message
        });
      } else {
        setStatus({
          kind: "error",
          ...sheetsErrorStatusFields(error),
          text: sheetsErrorMessage(error)
        });
      }
      // Preserve the current scoped dataset on refresh failure. Clearing it
      // would turn a transient outage into apparent data loss.
      if (!activeDataset) {
        setDataset(null);
        setDatasetScope(null);
      }
      return null;
    } finally {
      setLoading(false);
    }
  }, [
    activeLabId,
    activeDataset,
    loadAuthoritativeManagerMembers,
    requireFreshGoogleSignIn,
    session,
    setDataset,
    setDatasetScope,
    setLoading,
    setManagerFileAccessIssue,
    setStatus,
    viewer.role,
    withFreshSession
  ]);

  const loadEmployeeData = useCallback(
    async (prefs: EmployeeSheetPrefs) => {
      if (!session) return;
      setLoading(true);
      try {
        const { dataset: next, freshSession } = await withFreshSession(async (freshSession) => ({
          dataset: await loadEmployeeDataset(prefs, employeeLabMember, freshSession),
          freshSession
        }));
        setDataset(next);
        setDatasetScope({ role: "employee", email: normalizeEmail(freshSession.email) });
        setStatus(null);
      } catch (error) {
        if (isGoogleSheetsAuthError(error)) {
          requireFreshGoogleSignIn();
          return;
        }
        const message =
          error instanceof Error
            ? sheetsErrorMessage(error)
            : "Unable to load your Task-log workbook. Re-check the URL and Active task tab.";
        setStatus({
          kind: "error",
          ...sheetsErrorStatusFields(error),
          text: message
        });
        if (activeDataset) {
          setDataset((current) =>
            current
              ? {
                  ...current,
                  cacheStaleReason: `Refresh failed: ${message}`,
                  cacheInvalidatedAt: new Date().toISOString()
                }
              : current
          );
        }
        if (
          (!activeDataset && isGoogleSheetsFileAccessError(error)) ||
          (!activeDataset && /not found in this spreadsheet/i.test(message)) ||
          (!activeDataset && /doesn't look like a valid Google Sheets URL/i.test(message)) ||
          (!activeDataset && /both the Task-log workbook URL/i.test(message))
        ) {
          setDataset(null);
          setDatasetScope(null);
          setEmployeeForceSetup(true);
        }
      } finally {
        setLoading(false);
      }
    },
    [
      employeeLabMember,
      activeDataset,
      requireFreshGoogleSignIn,
      session,
      setDataset,
      setDatasetScope,
      setEmployeeForceSetup,
      setLoading,
      setStatus,
      withFreshSession
    ]
  );

  useEffect(() => {
    if (!onboardingReady) return;
    if (!session || (viewer.role !== "manager" && viewer.role !== "pi")) return;
    if (
      (datasetScope?.role === "manager" || datasetScope?.role === "pi") &&
      datasetScope.email === sessionEmailKey
    ) {
      return;
    }
    void loadManagerData();
  }, [datasetScope, loadManagerData, onboardingReady, session, sessionEmailKey, viewer.role]);

  useEffect(() => {
    if (!onboardingReady) return;
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
  }, [
    activeDataset,
    employeePrefs,
    loadEmployeeData,
    onboardingReady,
    previousEmployeePrefsRef,
    session?.accessToken,
    setDataset,
    setDatasetScope,
    viewer.role
  ]);

  return { loadManagerData, loadEmployeeData };
}
