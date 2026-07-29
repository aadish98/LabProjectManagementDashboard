export const LAB_ROLES = ["employee", "manager", "pi"] as const;
export type LabRole = (typeof LAB_ROLES)[number];

export const ONBOARDING_STATUSES = [
  "invited",
  "needsSharing",
  "needsPicker",
  "needsColumnReview",
  "ready",
  "blocked"
] as const;
export type OnboardingStatus = (typeof ONBOARDING_STATUSES)[number];

export interface Identity {
  subject: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
}

export interface OnboardingState {
  status: OnboardingStatus;
  owner: "manager" | "member" | "system";
  reason: string;
  nextAction: string;
  updatedAt: string;
  blockedFrom?: Exclude<OnboardingStatus, "blocked">;
}

export interface Lab {
  id: string;
  name: string;
  adminSpreadsheetId: string;
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
  roles: LabRole[];
  active: boolean;
  revision: number;
  onboarding: OnboardingState;
  managerFileProof?: ManagerFileProofRecord;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

export interface ManagerFileProofRecord {
  verifiedFileIds: string[];
  updatedAt: string;
  updatedBy: string;
}

export interface ManagerRequiredFile {
  fileId: string;
  purpose: "adminWorkbook" | "requiredTaskLog";
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

export interface ColumnMapping {
  mode: "existing" | "add";
  header: string;
}

export interface MemberConfig {
  memberId: string;
  labId: string;
  spreadsheetId: string;
  taskLogUrl?: string;
  activeSheetName: string;
  proposedColumnMap: Record<string, ColumnMapping>;
  acceptedColumnMap?: Record<string, ColumnMapping>;
  pickerVerifiedAt?: string;
  pickerVerifiedBy?: string;
  sharingVerifiedAt?: string;
  revision: number;
  updatedAt: string;
  updatedBy: string;
}

export interface Membership {
  member: Member;
  lab: Lab;
  config: MemberConfig | null;
}

export const INVITATION_STATUSES = ["pending", "accepted", "revoked", "expired"] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

export interface Invitation {
  id: string;
  labId: string;
  memberId: string;
  email: string;
  normalizedEmail: string;
  roles: LabRole[];
  status: InvitationStatus;
  revision: number;
  expiresAt: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  acceptedAt?: string;
  acceptedBy?: string;
}

export interface OnboardingEvent {
  id: string;
  labId: string;
  memberId?: string;
  invitationId?: string;
  actorSubject: string;
  actorEmail: string;
  type: string;
  fromStatus?: OnboardingStatus;
  toStatus?: OnboardingStatus;
  revision?: number;
  occurredAt: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface BootstrapClaim {
  id: string;
  ownerSubject: string;
  ownerEmail: string;
  ownerName: string;
  labName: string;
  adminSpreadsheetId: string;
  expiresAt: string;
  createdAt: string;
  claimedAt?: string;
  labId?: string;
}

export interface InvitationInput {
  email: string;
  displayName: string;
  roles: LabRole[];
  expiresAt: string;
  spreadsheetId: string;
  taskLogUrl?: string | undefined;
  activeSheetName: string;
  proposedColumnMap: Record<string, ColumnMapping>;
}

export interface MemberPatch {
  displayName?: string | undefined;
  roles?: LabRole[] | undefined;
  active?: boolean | undefined;
}

export interface InvitationPatch {
  displayName?: string | undefined;
  roles?: LabRole[] | undefined;
  expiresAt?: string | undefined;
  spreadsheetId?: string | undefined;
  taskLogUrl?: string | undefined;
  activeSheetName?: string | undefined;
  proposedColumnMap?: Record<string, ColumnMapping> | undefined;
}

export interface MemberConfigPatch {
  spreadsheetId?: string | undefined;
  taskLogUrl?: string | undefined;
  activeSheetName?: string | undefined;
  proposedColumnMap?: Record<string, ColumnMapping> | undefined;
  acceptedColumnMap?: Record<string, ColumnMapping> | undefined;
}

export interface DriveResource {
  fileId: string;
  purpose: "taskLog" | "adminWorkbook" | "requiredTaskLog";
}

export interface DriveProvisioningContext {
  actor: Member;
  target: Member;
  resources: DriveResource[];
}
