import type { RoleCapability } from "./access";
import type { EmployeeSheetColumnMap } from "./app";

export const ONBOARDING_STATUSES = [
  "invited",
  "needsSharing",
  "needsPicker",
  "needsColumnReview",
  "ready",
  "blocked"
] as const;

export type OnboardingStatus = (typeof ONBOARDING_STATUSES)[number];
export type OnboardingOwner = "manager" | "member" | "system";

export interface OnboardingState {
  status: OnboardingStatus;
  owner: OnboardingOwner;
  reason: string;
  nextAction: string;
  updatedAt: string;
  blockedFrom?: Exclude<OnboardingStatus, "blocked">;
}

export interface Lab {
  id: string;
  name: string;
  revision: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

export interface Member {
  id: string;
  labId: string;
  email: string;
  normalizedEmail: string;
  displayName: string;
  roles: RoleCapability[];
  active: boolean;
  revision: number;
  onboarding: OnboardingState;
  managerFileProof?: {
    verifiedFileIds: string[];
    updatedAt: string;
    updatedBy: string;
  };
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

export interface ManagerRequiredFile {
  fileId: string;
  purpose: "requiredTaskLog";
  label: string;
  memberId?: string;
  activeSheetName?: string;
}

export interface ManagerFileProgress {
  requiredFiles: ManagerRequiredFile[];
  verifiedFileIds: string[];
  remainingFileIds: string[];
  complete: boolean;
  requiresColumnReview: boolean;
}

export interface MemberConfig {
  memberId: string;
  labId: string;
  spreadsheetId: string;
  taskLogUrl?: string;
  activeSheetName: string;
  proposedColumnMap: EmployeeSheetColumnMap;
  acceptedColumnMap?: EmployeeSheetColumnMap;
  pickerVerifiedAt?: string;
  pickerVerifiedBy?: string;
  sharingVerifiedAt?: string;
  revision: number;
  updatedAt: string;
  updatedBy: string;
}

export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";

export interface Invitation {
  id: string;
  labId: string;
  memberId: string;
  email: string;
  normalizedEmail: string;
  roles: RoleCapability[];
  status: InvitationStatus;
  revision: number;
  expiresAt: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  acceptedAt?: string;
  acceptedBy?: string;
}

export interface Membership {
  member: Member;
  lab: Lab;
  config: MemberConfig | null;
}

export interface InvitationBundle {
  invitation: Invitation;
  member?: Member;
  lab?: Lab;
  config?: MemberConfig;
}

export const ONBOARDING_STATUS_LABELS: Record<OnboardingStatus, string> = {
  invited: "Invited",
  needsSharing: "Needs sharing",
  needsPicker: "Needs Picker",
  needsColumnReview: "Needs column review",
  ready: "Ready",
  blocked: "Blocked"
};

export function primaryRole(roles: RoleCapability[]): RoleCapability | null {
  if (roles.includes("pi")) return "pi";
  if (roles.includes("manager")) return "manager";
  if (roles.includes("employee")) return "employee";
  return null;
}

export function membershipPrefs(membership: Membership) {
  const config = membership.config;
  if (!config?.taskLogUrl || !config.activeSheetName) return null;
  return {
    taskLogUrl: config.taskLogUrl,
    activeSheetName: config.activeSheetName,
    columnMap: config.acceptedColumnMap ?? config.proposedColumnMap,
    strictColumnMap: config.acceptedColumnMap !== undefined
  };
}

export function acceptedMemberPrefs(config: MemberConfig | null | undefined) {
  if (
    !config?.taskLogUrl ||
    !config.activeSheetName ||
    config.acceptedColumnMap === undefined
  ) {
    return null;
  }
  return {
    taskLogUrl: config.taskLogUrl,
    activeSheetName: config.activeSheetName,
    columnMap: config.acceptedColumnMap,
    strictColumnMap: true
  };
}
