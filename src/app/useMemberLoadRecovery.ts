import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import type { AppConfig, UserSession } from "../domain/app";
import type { DashboardDataset, MemberLoadIssue } from "../domain/experiment";
import { invalidateDatasetCaches } from "../services/cache";
import { openSpreadsheetPicker } from "../services/googleDrivePicker";
import {
  OnboardingApi,
  OnboardingApiError
} from "../services/onboardingApi";
import {
  GoogleSheetsAuthError,
  isGoogleSheetsAuthError,
  sheetsErrorMessage,
  sheetsErrorStatusFields
} from "../services/sheets/errors";
import { extractIdFromUrl } from "../services/sheets/helpers";
import type { StatusMessage } from "./screens";

export type MemberLoadRecoveryAction = "picker" | "retry" | "deactivate";

type FreshSessionRunner = <T>(
  operation: (freshSession: UserSession) => Promise<T>
) => Promise<T>;

interface MemberLoadRecoveryOptions {
  session: UserSession | null;
  config: AppConfig;
  activeLabId: string | null;
  withFreshSession: FreshSessionRunner;
  requireFreshGoogleSignIn: () => void;
  loadManagerData: () => Promise<DashboardDataset | null>;
  probeAdminAccess: () => Promise<void>;
  invalidateMemberConfigCache: () => void;
  setStatus: Dispatch<SetStateAction<StatusMessage>>;
}

export function memberLoadRecoveryKey(
  issue: MemberLoadIssue,
  action: MemberLoadRecoveryAction
): string {
  return `${action}:${issue.memberId ?? issue.labMember}:${extractIdFromUrl(issue.taskLogUrl)}`;
}

export function useMemberLoadRecovery({
  session,
  config,
  activeLabId,
  withFreshSession,
  requireFreshGoogleSignIn,
  loadManagerData,
  probeAdminAccess,
  invalidateMemberConfigCache,
  setStatus
}: MemberLoadRecoveryOptions) {
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const reportError = useCallback(
    (error: unknown, operation: string) => {
      if (isGoogleSheetsAuthError(error)) {
        requireFreshGoogleSignIn();
        return;
      }
      if (error instanceof OnboardingApiError) {
        setStatus({
          kind: "error",
          text: `${error.message} ${error.action}`,
          errorCode: error.code,
          httpStatus: error.status,
          operation
        });
        return;
      }
      setStatus({
        kind: "error",
        text: sheetsErrorMessage(error),
        ...sheetsErrorStatusFields(error),
        operation
      });
    },
    [requireFreshGoogleSignIn, setStatus]
  );

  const reloadIssue = useCallback(
    async (issue: MemberLoadIssue, operation: string) => {
      const next = await loadManagerData();
      if (!next) return null;
      const remaining = next.memberLoadIssues?.find((candidate) =>
        issue.memberId
          ? candidate.memberId === issue.memberId
          : candidate.labMember === issue.labMember &&
            extractIdFromUrl(candidate.taskLogUrl) === extractIdFromUrl(issue.taskLogUrl)
      );
      setStatus(
        remaining
          ? {
              kind: "info",
              text: `${issue.labMember} still could not be loaded: ${remaining.message}`,
              errorCode: remaining.code,
              httpStatus: remaining.status,
              operation
            }
          : {
              kind: "success",
              text: `${issue.labMember}'s Task-log workbook loaded successfully.`,
              operation
            }
      );
      return next;
    },
    [loadManagerData, setStatus]
  );

  const grantAndVerify = useCallback(
    async (issue: MemberLoadIssue) => {
      if (!session || busyKey) return;
      const key = memberLoadRecoveryKey(issue, "picker");
      setBusyKey(key);
      try {
        const expectedSpreadsheetId = extractIdFromUrl(issue.taskLogUrl);
        if (!expectedSpreadsheetId) {
          throw new Error(
            `No exact spreadsheet ID is available for ${issue.labMember}. Retry the authoritative load before granting access.`
          );
        }
        const picked = await withFreshSession(async (freshSession) => {
          if (!freshSession.accessToken || !freshSession.idToken) {
            throw new GoogleSheetsAuthError({
              operation: "grantMemberTaskLogAccess",
              spreadsheetId: expectedSpreadsheetId,
              memberId: issue.memberId
            });
          }
          return openSpreadsheetPicker({
            accessToken: freshSession.accessToken,
            apiKey: config.googleApiKey,
            appId: config.googleAppId,
            multiselect: false,
            query: expectedSpreadsheetId,
            title: `Grant access to ${issue.labMember}'s Task-log workbook`
          });
        });
        if (picked.length === 0) {
          setStatus({
            kind: "info",
            text: `Drive Picker was closed without selecting ${issue.labMember}'s exact Task-log workbook.`,
            operation: "grantMemberTaskLogAccess"
          });
          return;
        }
        const selectedId = picked[0]?.id.trim() ?? "";
        if (selectedId !== expectedSpreadsheetId) {
          setStatus({
            kind: "error",
            text: `The selected workbook did not match ${issue.labMember}'s configured spreadsheet ID. No recovery change was accepted.`,
            errorCode: "PICKER_FILE_MISMATCH",
            operation: "verifyMemberTaskLogPicker"
          });
          return;
        }
        setStatus({
          kind: "info",
          text: `Verified the exact Drive Picker selection for ${issue.labMember}. Retrying the authoritative dataset load.`,
          operation: "verifyMemberTaskLogPicker"
        });
        await reloadIssue(issue, "reloadAfterPickerGrant");
      } catch (error) {
        reportError(error, "grantMemberTaskLogAccess");
      } finally {
        setBusyKey(null);
      }
    },
    [
      busyKey,
      config.googleApiKey,
      config.googleAppId,
      reloadIssue,
      reportError,
      session,
      setStatus,
      withFreshSession
    ]
  );

  const retry = useCallback(
    async (issue: MemberLoadIssue) => {
      if (!session || busyKey) return;
      setBusyKey(memberLoadRecoveryKey(issue, "retry"));
      setStatus({
        kind: "info",
        text: `Retrying ${issue.labMember}'s Task-log workbook against current authoritative configuration.`,
        operation: "retryMemberTaskLog"
      });
      try {
        await reloadIssue(issue, "retryMemberTaskLog");
      } catch (error) {
        reportError(error, "retryMemberTaskLog");
      } finally {
        setBusyKey(null);
      }
    },
    [busyKey, reloadIssue, reportError, session, setStatus]
  );

  const deactivate = useCallback(
    async (issue: MemberLoadIssue) => {
      if (!session || !activeLabId || !issue.memberId || busyKey) return;
      setBusyKey(memberLoadRecoveryKey(issue, "deactivate"));
      try {
        await withFreshSession(async (freshSession) => {
          if (!freshSession.idToken) {
            throw new GoogleSheetsAuthError({
              operation: "deactivateMember",
              memberId: issue.memberId
            });
          }
          const api = new OnboardingApi({ idToken: freshSession.idToken });
          const { members } = await api.listMembers(activeLabId);
          const current = members.find((member) => member.id === issue.memberId);
          if (!current) {
            throw new OnboardingApiError({
              kind: "http",
              code: "MEMBER_NOT_FOUND",
              message: `${issue.labMember} is no longer present in the authoritative member list.`,
              action: "Reload the dashboard before attempting another recovery action.",
              status: 404
            });
          }
          if (!current.active) {
            return;
          }
          await api.deactivateMember(activeLabId, current.id, current.revision);
        });
        const reason = `${issue.labMember} was deactivated in the authoritative backend.`;
        invalidateDatasetCaches(
          extractIdFromUrl(config.adminSpreadsheetId),
          reason
        );
        invalidateMemberConfigCache();
        await probeAdminAccess();
        const next = await loadManagerData();
        if (!next) return;
        setStatus({
          kind: "success",
          text: `${reason} Authoritative member data and the dashboard were reloaded.`,
          operation: "deactivateMember"
        });
      } catch (error) {
        reportError(error, "deactivateMember");
      } finally {
        setBusyKey(null);
      }
    },
    [
      activeLabId,
      busyKey,
      config.adminSpreadsheetId,
      invalidateMemberConfigCache,
      loadManagerData,
      probeAdminAccess,
      reportError,
      session,
      setStatus,
      withFreshSession
    ]
  );

  return {
    busyKey,
    grantAndVerify,
    retry,
    deactivate
  };
}
