import type {
  DriveProvisioningContext,
  Identity,
  Invitation,
  InvitationInput,
  InvitationPatch,
  Lab,
  ManagerFileProgress,
  Member,
  MemberConfig,
  MemberConfigPatch,
  Membership,
  MemberPatch
} from "../domain/types.js";

export interface Versioned<T> {
  value: T;
  replayed: boolean;
}

export interface OnboardingRepository {
  listInvitationsForEmail(email: string): Promise<Invitation[]>;
  listInvitations(labId: string): Promise<Invitation[]>;
  getInvitation(labId: string, invitationId: string): Promise<Invitation>;
  createInvitation(
    labId: string,
    actor: Identity,
    input: InvitationInput,
    idempotencyKey: string
  ): Promise<Versioned<{ invitation: Invitation; member: Member; config: MemberConfig }>>;
  updateInvitation(
    labId: string,
    invitationId: string,
    actor: Identity,
    expectedRevision: number,
    patch: InvitationPatch
  ): Promise<{ invitation: Invitation; member: Member; config: MemberConfig }>;
  acceptInvitation(
    labId: string,
    invitationId: string,
    actor: Identity,
    expectedRevision: number
  ): Promise<{ invitation: Invitation; member: Member }>;
  revokeInvitation(
    labId: string,
    invitationId: string,
    actor: Identity,
    expectedRevision: number
  ): Promise<Invitation>;

  getLab(labId: string): Promise<Lab>;
  listMembershipsForEmail(email: string): Promise<Membership[]>;
  getMember(labId: string, memberId: string): Promise<Member>;
  findMemberByEmail(labId: string, email: string): Promise<Member | null>;
  listMembers(labId: string): Promise<Member[]>;
  createMember(
    labId: string,
    actor: Identity,
    input: Omit<InvitationInput, "expiresAt">,
    idempotencyKey: string
  ): Promise<Versioned<{ member: Member; config: MemberConfig }>>;
  updateMember(
    labId: string,
    memberId: string,
    actor: Identity,
    expectedRevision: number,
    patch: MemberPatch
  ): Promise<Member>;
  updateMemberSetup(
    labId: string,
    memberId: string,
    actor: Identity,
    expectedMemberRevision: number,
    expectedConfigRevision: number,
    memberPatch: MemberPatch,
    configPatch: MemberConfigPatch
  ): Promise<{ member: Member; config: MemberConfig }>;
  deactivateMember(
    labId: string,
    memberId: string,
    actor: Identity,
    expectedRevision: number,
    invitation?: { id: string; expectedRevision: number }
  ): Promise<Member>;

  getConfig(labId: string, memberId: string): Promise<MemberConfig>;
  updateConfig(
    labId: string,
    memberId: string,
    actor: Identity,
    expectedRevision: number,
    patch: MemberConfigPatch,
    columnReviewComplete: boolean
  ): Promise<{ config: MemberConfig; member: Member }>;
  recordPickerProof(
    labId: string,
    memberId: string,
    actor: Identity,
    spreadsheetId: string,
    expectedRevision: number
  ): Promise<{ config: MemberConfig; member: Member }>;
  getManagerFileProgress(
    labId: string,
    memberId: string,
    actor: Identity
  ): Promise<{ member: Member; progress: ManagerFileProgress }>;
  recordManagerFileProof(
    labId: string,
    memberId: string,
    actor: Identity,
    selectedFileIds: string[],
    expectedRevision: number
  ): Promise<{ member: Member; progress: ManagerFileProgress }>;
  blockMember(
    labId: string,
    memberId: string,
    actor: Identity,
    expectedRevision: number,
    reason: string,
    nextAction: string
  ): Promise<Member>;
  resumeMember(
    labId: string,
    memberId: string,
    actor: Identity,
    expectedRevision: number
  ): Promise<Member>;

  getDriveProvisioningContext(
    labId: string,
    actorEmail: string,
    targetMemberId: string
  ): Promise<DriveProvisioningContext>;
  recordDriveSharing(
    labId: string,
    targetMemberId: string,
    actor: Identity,
    grantedFileIds: string[],
    expectedRevision: number
  ): Promise<{ config: MemberConfig; member: Member }>;
}
