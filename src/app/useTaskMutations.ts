import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import type { EmployeeSheetPrefs, UserSession } from "../domain/app";
import type {
  DashboardDataset,
  ExperimentDraft,
  ExperimentRecord,
  SheetRegistryEntry
} from "../domain/experiment";
import type { Membership } from "../domain/onboarding";
import type { CompletionPayload, OverduePayload } from "../features/employee/EmployeeWorkspace";
import { loadGoogleSheetsDataset } from "../services/sheets/dataset";
import {
  isGoogleSheetsAuthError,
  SheetRevisionConflictError,
  sheetsErrorStatusFields
} from "../services/sheets/errors";
import {
  backfillTaskIdsInSheet,
  completeTaskInSheet,
  createTaskInSheet,
  loadEmployeeDataset,
  resolveOverdueTaskInSheet,
  updateTaskInSheet
} from "../services/sheets/taskLog";
import type { ManagerFileAccessIssue, StatusMessage } from "./screens";

export type DatasetScope = {
  role: "employee" | "manager" | "pi";
  email: string;
};

type FreshSessionRunner = <T>(
  operation: (freshSession: UserSession) => Promise<T>
) => Promise<T>;

export type MemberTaskPrefsResolver = (
  memberId: string,
  session: UserSession
) => Promise<EmployeeSheetPrefs>;

interface TaskMutationOptions {
  session: UserSession | null;
  employeePrefs: EmployeeSheetPrefs | null;
  employeeLabMember: string;
  managerRole: "manager" | "pi";
  activeLabId: string | null;
  managerOwnEntry: SheetRegistryEntry | null;
  loadAuthoritativeManagerMembers: (
    labId: string,
    session: UserSession
  ) => Promise<Array<Pick<Membership, "member" | "config">>>;
  resolveMemberTaskPrefs: MemberTaskPrefsResolver;
  withFreshSession: FreshSessionRunner;
  requireFreshGoogleSignIn: () => void;
  setDataset: Dispatch<SetStateAction<DashboardDataset | null>>;
  setDatasetScope: Dispatch<SetStateAction<DatasetScope | null>>;
  setManagerFileAccessIssue: Dispatch<SetStateAction<ManagerFileAccessIssue | null>>;
  setStatus: Dispatch<SetStateAction<StatusMessage>>;
}

const normalizeEmail = (email: string) => email.trim().toLowerCase();

function requireAuditableMember(
  destination: Pick<SheetRegistryEntry, "memberId" | "labMember">
): void {
  if (destination.memberId?.trim()) return;
  throw new Error(
    `Refresh Team setup before changing tasks for ${destination.labMember}; its immutable member ID is missing.`
  );
}

function requireTaskId(taskId: string | undefined): string {
  const stableId = taskId?.trim();
  if (stableId) return stableId;
  throw new Error(
    "The task still has no immutable Task ID after backfill. Refresh before retrying."
  );
}

function legacyTaskReopenError(): Error {
  return new Error(
    "Task IDs/revisions were backfilled and the dataset was refreshed. Reopen the task before retrying so the mutation uses its immutable Task ID and latest Task Revision."
  );
}

function refreshedTaskConflict(error: SheetRevisionConflictError): SheetRevisionConflictError {
  return new SheetRevisionConflictError(
    "This task changed since you opened it. Latest data was refreshed and your draft is still open. Compare the latest task with your draft, then retry.",
    error.context
  );
}

export function useTaskMutations({
  session,
  employeePrefs,
  employeeLabMember,
  managerRole,
  activeLabId,
  managerOwnEntry,
  loadAuthoritativeManagerMembers,
  resolveMemberTaskPrefs,
  withFreshSession,
  requireFreshGoogleSignIn,
  setDataset,
  setDatasetScope,
  setManagerFileAccessIssue,
  setStatus
}: TaskMutationOptions) {
  const [saving, setSaving] = useState(false);

  const saveEmployeeDataset = useCallback(
    async (
      mutate: (prefs: EmployeeSheetPrefs, freshSession: UserSession) => Promise<void>,
      successText: string,
      fallbackError: string
    ) => {
      if (!session || !employeePrefs) return;
      setSaving(true);
      try {
        await withFreshSession(async (freshSession) => {
          try {
            await mutate(employeePrefs, freshSession);
          } catch (error) {
            if (error instanceof SheetRevisionConflictError) {
              const latest = await loadEmployeeDataset(
                employeePrefs,
                employeeLabMember,
                freshSession
              );
              setDataset(latest);
              setDatasetScope({
                role: "employee",
                email: normalizeEmail(freshSession.email)
              });
              throw refreshedTaskConflict(error);
            }
            throw error;
          }
          const next = await loadEmployeeDataset(employeePrefs, employeeLabMember, freshSession);
          setDataset(next);
          setDatasetScope({ role: "employee", email: normalizeEmail(freshSession.email) });
        });
        setStatus({ kind: "success", text: successText });
      } catch (error) {
        if (isGoogleSheetsAuthError(error)) {
          requireFreshGoogleSignIn();
          return;
        }
        setStatus({
          kind: "error",
          ...sheetsErrorStatusFields(error),
          text: error instanceof Error ? error.message : fallbackError
        });
        throw error;
      } finally {
        setSaving(false);
      }
    },
    [
      employeeLabMember,
      employeePrefs,
      requireFreshGoogleSignIn,
      session,
      setDataset,
      setDatasetScope,
      setStatus,
      withFreshSession
    ]
  );

  const reloadManagerDataset = useCallback(
    async (freshSession: UserSession) => {
      if (!activeLabId) {
        throw new Error("Verified lab access is required to reload manager data.");
      }
      const authoritativeMembers = await loadAuthoritativeManagerMembers(
        activeLabId,
        freshSession
      );
      const next = await loadGoogleSheetsDataset(freshSession, {
        labId: activeLabId,
        viewerRole: managerRole,
        authoritativeMembers
      });
      setDataset(next);
      setDatasetScope({ role: managerRole, email: normalizeEmail(freshSession.email) });
      setManagerFileAccessIssue(null);
      return next;
    },
    [
      activeLabId,
      loadAuthoritativeManagerMembers,
      managerRole,
      setDataset,
      setDatasetScope,
      setManagerFileAccessIssue
    ]
  );

  const resolveEmployeeIdentity = useCallback(
    async (
      prefs: EmployeeSheetPrefs,
      identity: { taskId?: string; expectedRevision?: number },
      freshSession: UserSession
    ) => {
      if (
        identity.taskId?.trim() &&
        Number.isSafeInteger(identity.expectedRevision) &&
        (identity.expectedRevision ?? 0) >= 1
      ) {
        return {
          taskId: identity.taskId.trim(),
          expectedRevision: identity.expectedRevision
        };
      }
      await backfillTaskIdsInSheet(prefs, freshSession);
      const refreshed = await loadEmployeeDataset(
        prefs,
        employeeLabMember,
        freshSession
      );
      setDataset(refreshed);
      setDatasetScope({
        role: "employee",
        email: normalizeEmail(freshSession.email)
      });
      // Never correlate the reopened dataset by the legacy row number: a sort
      // can happen between backfill and reload. The user must reopen the record,
      // whose next mutation will carry the immutable ID from the fresh dataset.
      throw legacyTaskReopenError();
    },
    [employeeLabMember, setDataset, setDatasetScope]
  );

  const resolveManagerIdentity = useCallback(
    async (
      prefs: EmployeeSheetPrefs,
      identity: { taskId?: string; expectedRevision?: number },
      freshSession: UserSession
    ) => {
      if (
        identity.taskId?.trim() &&
        Number.isSafeInteger(identity.expectedRevision) &&
        (identity.expectedRevision ?? 0) >= 1
      ) {
        return {
          taskId: identity.taskId.trim(),
          expectedRevision: identity.expectedRevision
        };
      }
      await backfillTaskIdsInSheet(prefs, freshSession);
      await reloadManagerDataset(freshSession);
      throw legacyTaskReopenError();
    },
    [reloadManagerDataset]
  );

  const saveManagerTask = useCallback(
    async (
      mutate: (freshSession: UserSession) => Promise<void>,
      successText: string,
      fallbackError = "Unable to update the task."
    ) => {
      if (!session) return;
      setSaving(true);
      try {
        await withFreshSession(async (freshSession) => {
          try {
            await mutate(freshSession);
          } catch (error) {
            if (error instanceof SheetRevisionConflictError) {
              await reloadManagerDataset(freshSession);
              throw refreshedTaskConflict(error);
            }
            throw error;
          }
          await reloadManagerDataset(freshSession);
        });
        setStatus({ kind: "success", text: successText });
      } catch (error) {
        if (isGoogleSheetsAuthError(error)) {
          requireFreshGoogleSignIn();
          return;
        }
        setStatus({
          kind: "error",
          ...sheetsErrorStatusFields(error),
          text: error instanceof Error ? error.message : fallbackError
        });
        throw error;
      } finally {
        setSaving(false);
      }
    },
    [reloadManagerDataset, requireFreshGoogleSignIn, session, setStatus, withFreshSession]
  );

  return {
    saving,
    handleEmployeeCreate: (draft: ExperimentDraft) =>
      saveEmployeeDataset(
        async (prefs, fresh) => {
          await createTaskInSheet(prefs, fresh, draft);
        },
        "Task created.",
        "Unable to create the task."
      ),
    handleEmployeeUpdate: (record: ExperimentRecord, draft: ExperimentDraft) =>
      saveEmployeeDataset(
        async (prefs, fresh) => {
          const identity = await resolveEmployeeIdentity(
            prefs,
            {
              taskId: record.taskId,
              expectedRevision: record.taskRevision
            },
            fresh
          );
          await updateTaskInSheet(prefs, fresh, identity, draft);
        },
        "Task updated.",
        "Unable to update the task."
      ),
    handleEmployeeComplete: (payload: CompletionPayload) =>
      saveEmployeeDataset(
        async (prefs, fresh) => {
          const identity = await resolveEmployeeIdentity(prefs, payload, fresh);
          await completeTaskInSheet(prefs, fresh, { ...payload, ...identity });
        },
        "Task marked complete.",
        "Unable to mark the task complete."
      ),
    handleEmployeeOverdue: (payload: OverduePayload) =>
      saveEmployeeDataset(
        async (prefs, fresh) => {
          const identity = await resolveEmployeeIdentity(prefs, payload, fresh);
          await resolveOverdueTaskInSheet(prefs, fresh, {
            ...payload,
            ...identity
          });
        },
        "Overdue task updated.",
        "Unable to record overdue resolution."
      ),
    handleManagerCreateOwnTask: (draft: ExperimentDraft) =>
      managerOwnEntry
        ? saveManagerTask(
            async (fresh) => {
              requireAuditableMember(managerOwnEntry);
              const memberId = managerOwnEntry.memberId as string;
              const prefs = await resolveMemberTaskPrefs(memberId, fresh);
              requireTaskId(await createTaskInSheet(prefs, fresh, draft));
            },
            "Task created."
          )
        : Promise.resolve(),
    handleManagerUpdateOwnTask: (record: ExperimentRecord, draft: ExperimentDraft) =>
      managerOwnEntry
        ? saveManagerTask(
            async (fresh) => {
              requireAuditableMember(managerOwnEntry);
              const memberId = managerOwnEntry.memberId as string;
              const prefs = await resolveMemberTaskPrefs(memberId, fresh);
              const identity = await resolveManagerIdentity(
                prefs,
                {
                  taskId: record.taskId,
                  expectedRevision: record.taskRevision
                },
                fresh
              );
              await updateTaskInSheet(
                prefs,
                fresh,
                identity,
                draft
              );
            },
            "Task updated."
          )
        : Promise.resolve(),
    handleManagerCompleteOwnTask: (payload: CompletionPayload) =>
      managerOwnEntry
        ? saveManagerTask(
            async (fresh) => {
              requireAuditableMember(managerOwnEntry);
              const memberId = managerOwnEntry.memberId as string;
              const prefs = await resolveMemberTaskPrefs(memberId, fresh);
              const identity = await resolveManagerIdentity(
                prefs,
                payload,
                fresh
              );
              await completeTaskInSheet(prefs, fresh, {
                ...payload,
                ...identity
              });
            },
            "Task marked complete."
          )
        : Promise.resolve(),
    handleManagerResolveOwnOverdue: (payload: OverduePayload) =>
      managerOwnEntry
        ? saveManagerTask(
            async (fresh) => {
              requireAuditableMember(managerOwnEntry);
              const memberId = managerOwnEntry.memberId as string;
              const prefs = await resolveMemberTaskPrefs(memberId, fresh);
              const identity = await resolveManagerIdentity(
                prefs,
                payload,
                fresh
              );
              await resolveOverdueTaskInSheet(prefs, fresh, {
                ...payload,
                ...identity
              });
            },
            "Overdue task updated."
          )
        : Promise.resolve(),
    handleManagerCreateTask: (entry: SheetRegistryEntry, draft: ExperimentDraft) =>
      saveManagerTask(
        async (fresh) => {
          requireAuditableMember(entry);
          const memberId = entry.memberId as string;
          const prefs = await resolveMemberTaskPrefs(memberId, fresh);
          requireTaskId(await createTaskInSheet(prefs, fresh, draft));
        },
        `Task added for ${entry.labMember}.`,
        `Unable to add task for ${entry.labMember}.`
      ),
    handleManagerUpdateTask: (record: ExperimentRecord, draft: ExperimentDraft) => {
      if (!session) return Promise.resolve();
      return saveManagerTask(
        async (fresh) => {
          requireAuditableMember(record);
          const memberId = record.memberId as string;
          const prefs = await resolveMemberTaskPrefs(memberId, fresh);
          const identity = await resolveManagerIdentity(
            prefs,
            {
              taskId: record.taskId,
              expectedRevision: record.taskRevision
            },
            fresh
          );
          await updateTaskInSheet(
            prefs,
            fresh,
            identity,
            draft
          );
        },
        `Task updated for ${record.labMember}.`,
        `Unable to update task for ${record.labMember}.`
      );
    }
  };
}
