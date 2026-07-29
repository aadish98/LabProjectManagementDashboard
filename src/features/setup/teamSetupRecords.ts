import type {
  Invitation,
  Member,
  MemberConfig
} from "../../domain/onboarding";
import { OnboardingApiError } from "../../services/onboardingApi";
import type { PersonDraft } from "./teamSetupState";

export function personFromRecords(
  member: Member,
  config: MemberConfig | null,
  invitation?: Invitation
): PersonDraft {
  return {
    id: member.id,
    labId: member.labId,
    name: member.displayName,
    email: member.email,
    roles: {
      employee: member.roles.includes("employee"),
      manager: member.roles.includes("manager"),
      pi: member.roles.includes("pi")
    },
    taskLogUrl: config?.taskLogUrl ?? "",
    taskLogTitle: "",
    activeSheetName: config?.activeSheetName ?? "",
    active: member.active,
    availableTabs: [],
    loadingTabs: false,
    tabError: "",
    memberRevision: member.revision,
    configRevision: config?.revision,
    invitationId: invitation?.id,
    invitationRevision: invitation?.revision,
    onboarding: member.onboarding
  };
}

export function apiMessage(error: unknown): string {
  if (error instanceof OnboardingApiError) {
    return `${error.message} ${error.action}`;
  }
  return error instanceof Error ? error.message : "The onboarding operation failed.";
}

export function memberIssueFieldId(memberId: string, issue: string): string {
  const prefix = `member-${memberId.replace(/[^a-zA-Z0-9_-]+/g, "-")}`;
  if (/email/i.test(issue)) return `${prefix}-email`;
  if (/role/i.test(issue)) return `${prefix}-access-role`;
  if (/tab/i.test(issue)) return `${prefix}-active-task-tab`;
  if (/workbook|spreadsheet/i.test(issue)) return `${prefix}-task-log-workbook`;
  return `${prefix}-name`;
}
