import {
  normalizeEmail,
  type RoleCapability
} from "../../domain/access";
import type { UserSession } from "../../domain/app";
import {
  acceptedMemberPrefs,
  type Membership
} from "../../domain/onboarding";
import type {
  DashboardDataset,
  ExperimentRecord,
  LabMemberProfilePicture,
  MemberLoadIssue,
  StaleTaskLogTab
} from "../../domain/experiment";
import {
  getDatasetCacheKey,
  readDatasetCache,
  writeDatasetCache
} from "../cache";
import { getValuesForSheet } from "./client";
import {
  GoogleSheetsAuthError,
  GoogleSheetsFileAccessError,
  isGoogleSheetsAuthError,
  isGoogleSheetsFileAccessError,
  isSheetsError,
  isStaleTabError,
  sheetsErrorMessage,
  SheetsError
} from "./errors";
import { extractIdFromUrl } from "./helpers";
import { readEmployeeProfileForManager } from "./profile";
import {
  parseExperimentRows
} from "./taskLog";

export function mergeLastKnownExperiments(
  live: ExperimentRecord[],
  cached: ExperimentRecord[],
  issues: MemberLoadIssue[]
): { experiments: ExperimentRecord[]; restoredCount: number } {
  const failedMemberIds = new Set(
    issues
      .map((issue) => issue.memberId)
      .filter((memberId): memberId is string => !!memberId)
  );
  const failedNames = new Set(
    issues.map((issue) => normalizeEmail(issue.labMember))
  );
  const existingIds = new Set(live.map((record) => record.id));
  const restored = cached.filter((record) => {
    const belongsToFailedMember = record.memberId
      ? failedMemberIds.has(record.memberId)
      : failedNames.has(normalizeEmail(record.labMember));
    return belongsToFailedMember && !existingIds.has(record.id);
  });
  return {
    experiments: [...live, ...restored],
    restoredCount: restored.length
  };
}

export async function loadGoogleSheetsDataset(
  session: UserSession,
  options: {
    labId: string;
    viewerRole: Extract<RoleCapability, "manager" | "pi">;
    authoritativeMembers: ReadonlyArray<Pick<Membership, "member" | "config">>;
  }
): Promise<DashboardDataset> {
  if (!session.accessToken) throw new GoogleSheetsAuthError();

  const cacheKey = `${getDatasetCacheKey(options.labId)}/${
    options.viewerRole
  }/${normalizeEmail(session.email)}`;

  try {
    const visibleMembers = options.authoritativeMembers.filter(({ member }) => {
      if (!member.active) return false;
      if (options.viewerRole === "pi") return true;
      return member.roles.includes("employee") && !member.roles.includes("pi");
    });
    const roles = visibleMembers.flatMap(({ member }) =>
      member.roles.map((role) => ({
        memberId: member.id,
        email: member.email,
        role,
        labMember: member.displayName,
        active: member.active,
        revision: member.revision
      }))
    );
    const memberLoadIssues: MemberLoadIssue[] = [];
    const memberSources = visibleMembers.flatMap(({ member, config: memberConfig }) => {
      const prefs = acceptedMemberPrefs(memberConfig);
      if (!prefs) {
        memberLoadIssues.push({
          memberId: member.id,
          labMember: member.displayName,
          taskLogUrl: memberConfig?.taskLogUrl ?? memberConfig?.spreadsheetId ?? "",
          activeSheetName: memberConfig?.activeSheetName ?? "",
          code: "schema",
          message:
            "The authoritative backend configuration has no accepted column map."
        });
        return [];
      }
      return [{
        entry: {
          memberId: member.id,
          labMember: member.displayName,
          taskLogUrl: prefs.taskLogUrl,
          activeSheetName: prefs.activeSheetName,
          active: true
        },
        prefs
      }];
    });
    const registryEntries = memberSources.map(({ entry }) => entry);

    type TaskLogLoadResult =
      | { records: ExperimentRecord[] }
      | { issue: MemberLoadIssue }
      | { stale: StaleTaskLogTab };

    const accessToken = session.accessToken;
    const taskLogPromises = memberSources.map(async ({ entry, prefs }) => {
      const spreadsheetId = extractIdFromUrl(entry.taskLogUrl);
      try {
        const rows = await getValuesForSheet(
          spreadsheetId,
          entry.activeSheetName,
          "A:ZZ",
          accessToken
        );
        return {
          records: parseExperimentRows(
            entry,
            rows,
            prefs.columnMap,
            prefs.strictColumnMap
          )
        } as TaskLogLoadResult;
      } catch (error) {
        if (isGoogleSheetsAuthError(error)) throw error;
        if (isStaleTabError(error)) {
          return {
            stale: {
              memberId: entry.memberId,
              labMember: entry.labMember,
              taskLogUrl: entry.taskLogUrl,
              activeSheetName: entry.activeSheetName,
              reason:
                error instanceof Error
                  ? error.message
                  : `Active task tab "${entry.activeSheetName}" was not found in the Task-log workbook.`
            }
          } as TaskLogLoadResult;
        }
        const code = isGoogleSheetsFileAccessError(error)
          ? "pickerGrant"
          : isSheetsError(error)
            ? error.code === "auth"
              ? "unknown"
              : error.code
            : "unknown";
        return {
          issue: {
            memberId: entry.memberId,
            labMember: entry.labMember,
            taskLogUrl: entry.taskLogUrl,
            activeSheetName: entry.activeSheetName,
            code,
            message:
              error instanceof Error
                ? error.message
                : "This Task-log workbook could not be loaded.",
            status: error instanceof SheetsError ? error.status : undefined,
            operation:
              error instanceof SheetsError
                ? error.context.operation
                : undefined
          }
        } as TaskLogLoadResult;
      }
    });

    const profilePromises = registryEntries.map(async (entry) => {
      try {
        return await readEmployeeProfileForManager(
          session.email,
          entry.labMember,
          entry.taskLogUrl,
          accessToken
        );
      } catch (error) {
        if (isGoogleSheetsAuthError(error)) throw error;
        return {
          labMember: entry.labMember,
          source: "error"
        } as LabMemberProfilePicture;
      }
    });

    const [taskLogResults, profileResults] = await Promise.all([
      Promise.all(taskLogPromises),
      Promise.allSettled(profilePromises)
    ]);
    const staleTaskLogs: StaleTaskLogTab[] = [];
    const experiments: ExperimentRecord[] = [];
    for (const result of taskLogResults) {
      if ("issue" in result) {
        memberLoadIssues.push(result.issue);
      } else if ("stale" in result) {
        staleTaskLogs.push(result.stale);
      } else {
        experiments.push(...result.records);
      }
    }
    const profilePictures: LabMemberProfilePicture[] =
      profileResults.map((result, index) => {
        if (result.status === "fulfilled") return result.value;
        return {
          labMember: registryEntries[index]?.labMember ?? "",
          source: "error"
        };
      });
    const cached = readDatasetCache(cacheKey);
    const merged = cached
      ? mergeLastKnownExperiments(
          experiments,
          cached.experiments,
          memberLoadIssues
        )
      : { experiments, restoredCount: 0 };
    const dataset: DashboardDataset = {
      source: "googleSheets",
      registry: registryEntries,
      experiments: merged.experiments,
      runLog: [],
      feedbackThreads: [],
      roleDirectory: roles,
      lastSyncedAt: new Date().toISOString(),
      syncNote:
        merged.restoredCount > 0
          ? `Showing ${merged.restoredCount} last-known task${
              merged.restoredCount === 1 ? "" : "s"
            } for Members whose live Task-log workbooks could not be loaded.`
          : undefined,
      staleTaskLogs:
        staleTaskLogs.length > 0 ? staleTaskLogs : undefined,
      memberLoadIssues:
        memberLoadIssues.length > 0 ? memberLoadIssues : undefined,
      profilePictures:
        profilePictures.length > 0 ? profilePictures : undefined
    };

    writeDatasetCache(cacheKey, dataset);
    return dataset;
  } catch (error) {
    if (isGoogleSheetsAuthError(error)) throw error;
    if (isGoogleSheetsFileAccessError(error)) throw error;

    const cached = readDatasetCache(cacheKey);
    if (cached) {
      return {
        ...cached,
        cacheStaleReason:
          cached.cacheStaleReason ??
          "Live sync failed, so this view may not include recent changes.",
        syncNote: `STALE DATA — showing cached data because live sync failed: ${sheetsErrorMessage(
          error
        )}`
      };
    }
    throw error;
  }
}
