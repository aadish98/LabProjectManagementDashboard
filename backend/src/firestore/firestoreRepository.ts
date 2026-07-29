import { createHash, randomUUID } from "node:crypto";
import {
  FieldPath,
  Firestore,
  type DocumentData,
  type DocumentReference,
  type Transaction
} from "@google-cloud/firestore";
import {
  advanceOnboarding,
  blockOnboarding,
  completeManagerFileProof,
  initialOnboardingState,
  resumeOnboarding,
  STATUS_DEFAULTS
} from "../domain/lifecycle.js";
import type {
  BootstrapClaim,
  DriveProvisioningContext,
  DriveResource,
  Identity,
  Invitation,
  InvitationInput,
  InvitationPatch,
  Lab,
  ManagerFileProgress,
  ManagerRequiredFile,
  Member,
  MemberConfig,
  MemberConfigPatch,
  Membership,
  MemberPatch,
  OnboardingEvent
} from "../domain/types.js";
import { ApiError } from "../http/errors.js";
import type { OnboardingRepository, Versioned } from "./repository.js";

const normalizeEmail = (email: string): string => email.trim().toLowerCase();
const nowIso = (): string => new Date().toISOString();

export class FirestoreOnboardingRepository implements OnboardingRepository {
  constructor(private readonly db: Firestore) {}

  async createBootstrapClaim(
    identity: Identity,
    input: { labName: string; adminSpreadsheetId: string; ttlSeconds: number },
    idempotencyKey: string
  ): Promise<Versioned<BootstrapClaim>> {
    const id = randomUUID();
    const claimRef = this.db.collection("bootstrapClaims").doc(id);
    const keyRef = this.globalIdempotencyRef(identity.subject, "bootstrap", idempotencyKey);
    return this.db.runTransaction(async (transaction) => {
      const keySnapshot = await transaction.get(keyRef);
      if (keySnapshot.exists) {
        const priorId = requiredString(keySnapshot.data(), "claimId");
        return { value: await getInTransaction<BootstrapClaim>(transaction, this.db.collection("bootstrapClaims").doc(priorId), "BOOTSTRAP_CLAIM_NOT_FOUND"), replayed: true };
      }
      const createdAt = nowIso();
      const claim: BootstrapClaim = {
        id,
        ownerSubject: identity.subject,
        ownerEmail: normalizeEmail(identity.email),
        ownerName: identity.name?.trim() || identity.email,
        labName: input.labName.trim(),
        adminSpreadsheetId: input.adminSpreadsheetId.trim(),
        createdAt,
        expiresAt: new Date(Date.now() + input.ttlSeconds * 1000).toISOString()
      };
      transaction.create(claimRef, claim);
      transaction.create(keyRef, { claimId: id, createdAt });
      return { value: claim, replayed: false };
    });
  }

  async claimLab(
    identity: Identity,
    claimId: string,
    idempotencyKey: string
  ): Promise<Versioned<{ lab: Lab; member: Member }>> {
    const claimRef = this.db.collection("bootstrapClaims").doc(claimId);
    const keyRef = this.globalIdempotencyRef(
      identity.subject,
      `claim:${claimId}`,
      idempotencyKey
    );
    return this.db.runTransaction(async (transaction) => {
      const claim = await getInTransaction<BootstrapClaim>(
        transaction,
        claimRef,
        "BOOTSTRAP_CLAIM_NOT_FOUND"
      );
      if (claim.ownerSubject !== identity.subject || claim.ownerEmail !== normalizeEmail(identity.email)) {
        forbidden("Only the Google account that verified the empty Roles sheet can claim this lab.");
      }
      const keySnapshot = await transaction.get(keyRef);
      if (keySnapshot.exists) {
        const labId = requiredString(keySnapshot.data(), "labId");
        const memberId = requiredString(keySnapshot.data(), "memberId");
        const lab = await getInTransaction<Lab>(
          transaction,
          this.labRef(labId),
          "LAB_NOT_FOUND"
        );
        const member = await getInTransaction<Member>(
          transaction,
          this.memberRef(labId, memberId),
          "MEMBER_NOT_FOUND"
        );
        return { value: { lab, member }, replayed: true };
      }
      if (claim.claimedAt && claim.labId) {
        const lab = await getInTransaction<Lab>(
          transaction,
          this.labRef(claim.labId),
          "LAB_NOT_FOUND"
        );
        const member = await this.findMemberByEmailInTransaction(
          transaction,
          claim.labId,
          identity.email
        );
        if (!member) notFound("MEMBER_NOT_FOUND", "The bootstrap owner member is missing.");
        return { value: { lab, member }, replayed: true };
      }
      if (new Date(claim.expiresAt).getTime() <= Date.now()) {
        throw new ApiError({
          status: 410,
          code: "BOOTSTRAP_CLAIM_EXPIRED",
          message: "The empty-Roles verification claim has expired.",
          action: "Verify the empty canonical Roles sheet again to create a new claim."
        });
      }

      const labId = randomUUID();
      const memberId = randomUUID();
      const createdAt = nowIso();
      const lab: Lab = {
        id: labId,
        name: claim.labName,
        adminSpreadsheetId: claim.adminSpreadsheetId,
        revision: 1,
        createdAt,
        createdBy: identity.subject,
        updatedAt: createdAt
      };
      const member: Member = {
        id: memberId,
        labId,
        email: normalizeEmail(identity.email),
        normalizedEmail: normalizeEmail(identity.email),
        displayName: identity.name?.trim() || claim.ownerName,
        roles: ["manager", "pi"],
        active: true,
        revision: 1,
        onboarding: {
          status: "needsPicker",
          owner: "member",
          reason: "The lab claim is complete; exact-file Picker proof is still required.",
          nextAction: "Select the exact Admin workbook to complete first-run verification.",
          updatedAt: createdAt
        },
        createdAt,
        createdBy: identity.subject,
        updatedAt: createdAt
      };
      transaction.create(this.labRef(labId), lab);
      transaction.create(this.memberRef(labId, memberId), member);
      transaction.create(keyRef, { labId, memberId, createdAt });
      transaction.update(claimRef, { claimedAt: createdAt, labId });
      this.appendEvent(transaction, labId, {
        actor: identity,
        memberId,
        type: "lab.claimed",
        toStatus: "needsPicker",
        revision: member.revision
      });
      return { value: { lab, member }, replayed: false };
    });
  }

  async listInvitationsForEmail(email: string): Promise<Invitation[]> {
    const now = nowIso();
    const snapshot = await this.db
      .collectionGroup("invitations")
      .where("normalizedEmail", "==", normalizeEmail(email))
      .where("status", "==", "pending")
      .where("expiresAt", ">", now)
      .orderBy("expiresAt", "asc")
      .get();
    return snapshot.docs
      .map((document) => document.data() as Invitation)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async listInvitations(labId: string): Promise<Invitation[]> {
    const snapshot = await this.labRef(labId).collection("invitations").orderBy("createdAt", "desc").get();
    return snapshot.docs.map((document) => document.data() as Invitation);
  }

  async getInvitation(labId: string, invitationId: string): Promise<Invitation> {
    return getDocument<Invitation>(this.invitationRef(labId, invitationId), "INVITATION_NOT_FOUND");
  }

  async createInvitation(
    labId: string,
    actor: Identity,
    input: InvitationInput,
    idempotencyKey: string
  ): Promise<Versioned<{ invitation: Invitation; member: Member; config: MemberConfig }>> {
    const invitationId = randomUUID();
    const memberId = randomUUID();
    const invitationRef = this.invitationRef(labId, invitationId);
    const keyRef = this.labIdempotencyRef(labId, actor.subject, "invitation", idempotencyKey);
    return this.db.runTransaction(async (transaction) => {
      await getInTransaction<Lab>(transaction, this.labRef(labId), "LAB_NOT_FOUND");
      const priorKey = await transaction.get(keyRef);
      if (priorKey.exists) {
        const priorInvitationId = requiredString(priorKey.data(), "invitationId");
        const invitation = await getInTransaction<Invitation>(
          transaction,
          this.invitationRef(labId, priorInvitationId),
          "INVITATION_NOT_FOUND"
        );
        const member = await getInTransaction<Member>(
          transaction,
          this.memberRef(labId, invitation.memberId),
          "MEMBER_NOT_FOUND"
        );
        const config = await getInTransaction<MemberConfig>(
          transaction,
          this.configRef(labId, invitation.memberId),
          "CONFIG_NOT_FOUND"
        );
        return { value: { invitation, member, config }, replayed: true };
      }
      const existing = await this.findMemberByEmailInTransaction(transaction, labId, input.email);
      if (existing?.active) {
        throw new ApiError({
          status: 409,
          code: "MEMBER_EMAIL_EXISTS",
          message: "An active lab member already uses this email.",
          action: "Update the existing member instead of creating another invitation."
        });
      }
      if (existing && existing.onboarding.status !== "invited") {
        conflict(
          "MEMBER_ONBOARDING_EXISTS",
          "This email already has a non-invited onboarding record."
        );
      }
      const createdAt = nowIso();
      const targetMemberId = existing?.id ?? memberId;
      const memberRef = this.memberRef(labId, targetMemberId);
      const configRef = this.configRef(labId, targetMemberId);
      const existingConfig = existing
        ? await getInTransaction<MemberConfig>(
            transaction,
            configRef,
            "CONFIG_NOT_FOUND"
          )
        : null;
      const member: Member = existing
        ? {
            ...existing,
            email: normalizeEmail(input.email),
            normalizedEmail: normalizeEmail(input.email),
            displayName: input.displayName.trim(),
            roles: [...input.roles],
            revision: existing.revision + 1,
            updatedAt: createdAt
          }
        : makeMember(labId, targetMemberId, actor, input, createdAt);
      const invitation: Invitation = {
        id: invitationId,
        labId,
        memberId: targetMemberId,
        email: normalizeEmail(input.email),
        normalizedEmail: normalizeEmail(input.email),
        roles: [...input.roles],
        status: "pending",
        revision: 1,
        expiresAt: input.expiresAt,
        createdAt,
        createdBy: actor.subject,
        updatedAt: createdAt
      };
      const config: MemberConfig = existingConfig
        ? {
            ...existingConfig,
            spreadsheetId: input.spreadsheetId.trim(),
            ...(input.taskLogUrl?.trim()
              ? { taskLogUrl: input.taskLogUrl.trim() }
              : {}),
            activeSheetName: input.activeSheetName.trim(),
            proposedColumnMap: input.proposedColumnMap,
            revision: existingConfig.revision + 1,
            updatedAt: createdAt,
            updatedBy: actor.subject
          }
        : makeConfig(labId, targetMemberId, actor, input, createdAt);
      if (existing) {
        transaction.set(memberRef, member);
        transaction.set(configRef, config);
      } else {
        transaction.create(memberRef, member);
        transaction.create(configRef, config);
      }
      transaction.create(invitationRef, invitation);
      transaction.create(keyRef, {
        invitationId,
        memberId: targetMemberId,
        createdAt
      });
      this.appendEvent(transaction, labId, {
        actor,
        memberId: targetMemberId,
        invitationId,
        type: "invitation.created",
        toStatus: "invited",
        revision: 1
      });
      return { value: { invitation, member, config }, replayed: false };
    });
  }

  async updateInvitation(
    labId: string,
    invitationId: string,
    actor: Identity,
    expectedRevision: number,
    patch: InvitationPatch
  ): Promise<{ invitation: Invitation; member: Member; config: MemberConfig }> {
    return this.db.runTransaction(async (transaction) => {
      const invitationRef = this.invitationRef(labId, invitationId);
      const invitation = await getInTransaction<Invitation>(
        transaction,
        invitationRef,
        "INVITATION_NOT_FOUND"
      );
      assertRevision(invitation.revision, expectedRevision, invitation, {
        entity: "invitation",
        labId,
        invitationId
      });
      if (invitation.status !== "pending") {
        conflict("INVITATION_NOT_PENDING", "Only pending invitations can be edited.");
      }
      const memberRef = this.memberRef(labId, invitation.memberId);
      const configRef = this.configRef(labId, invitation.memberId);
      const member = await getInTransaction<Member>(transaction, memberRef, "MEMBER_NOT_FOUND");
      const config = await getInTransaction<MemberConfig>(transaction, configRef, "CONFIG_NOT_FOUND");
      const updatedAt = nowIso();
      const nextInvitation: Invitation = {
        ...invitation,
        ...(patch.roles ? { roles: [...patch.roles] } : {}),
        ...(patch.expiresAt ? { expiresAt: patch.expiresAt } : {}),
        revision: invitation.revision + 1,
        updatedAt
      };
      const nextMember: Member = {
        ...member,
        ...(patch.displayName ? { displayName: patch.displayName } : {}),
        ...(patch.roles ? { roles: [...patch.roles] } : {}),
        revision: member.revision + 1,
        updatedAt
      };
      const nextConfig: MemberConfig = {
        ...config,
        ...(patch.spreadsheetId ? { spreadsheetId: patch.spreadsheetId } : {}),
        ...(patch.taskLogUrl !== undefined ? { taskLogUrl: patch.taskLogUrl } : {}),
        ...(patch.activeSheetName ? { activeSheetName: patch.activeSheetName } : {}),
        ...(patch.proposedColumnMap ? { proposedColumnMap: patch.proposedColumnMap } : {}),
        revision: config.revision + 1,
        updatedAt,
        updatedBy: actor.subject
      };
      transaction.set(invitationRef, nextInvitation);
      transaction.set(memberRef, nextMember);
      transaction.set(configRef, nextConfig);
      this.appendEvent(transaction, labId, {
        actor,
        memberId: member.id,
        invitationId,
        type: "invitation.updated",
        revision: nextInvitation.revision
      });
      return { invitation: nextInvitation, member: nextMember, config: nextConfig };
    });
  }

  async acceptInvitation(
    labId: string,
    invitationId: string,
    actor: Identity,
    expectedRevision: number
  ): Promise<{ invitation: Invitation; member: Member }> {
    return this.db.runTransaction(async (transaction) => {
      const invitationRef = this.invitationRef(labId, invitationId);
      const invitation = await getInTransaction<Invitation>(
        transaction,
        invitationRef,
        "INVITATION_NOT_FOUND"
      );
      assertRevision(invitation.revision, expectedRevision, invitation, {
        entity: "invitation",
        labId,
        invitationId
      });
      if (invitation.normalizedEmail !== normalizeEmail(actor.email)) {
        forbidden("This invitation belongs to a different Google account.");
      }
      if (invitation.status === "accepted") {
        const member = await getInTransaction<Member>(
          transaction,
          this.memberRef(labId, invitation.memberId),
          "MEMBER_NOT_FOUND"
        );
        return { invitation, member };
      }
      if (invitation.status !== "pending") {
        conflict("INVITATION_NOT_PENDING", "This invitation can no longer be accepted.");
      }
      if (Date.parse(invitation.expiresAt) <= Date.now()) {
        transaction.update(invitationRef, {
          status: "expired",
          revision: invitation.revision + 1,
          updatedAt: nowIso()
        });
        throw new ApiError({
          status: 410,
          code: "INVITATION_EXPIRED",
          message: "This invitation has expired.",
          action: "Ask a manager or PI to send a new invitation."
        });
      }
      const memberRef = this.memberRef(labId, invitation.memberId);
      const member = await getInTransaction<Member>(transaction, memberRef, "MEMBER_NOT_FOUND");
      const updatedAt = nowIso();
      const onboarding = advanceOnboarding(member.onboarding, "needsSharing", updatedAt);
      const nextMember: Member = {
        ...member,
        onboarding,
        active: true,
        revision: member.revision + 1,
        updatedAt
      };
      const nextInvitation: Invitation = {
        ...invitation,
        status: "accepted",
        revision: invitation.revision + 1,
        acceptedAt: updatedAt,
        acceptedBy: actor.subject,
        updatedAt
      };
      transaction.set(memberRef, nextMember);
      transaction.set(invitationRef, nextInvitation);
      this.appendEvent(transaction, labId, {
        actor,
        memberId: member.id,
        invitationId,
        type: "invitation.accepted",
        fromStatus: "invited",
        toStatus: "needsSharing",
        revision: nextMember.revision
      });
      return { invitation: nextInvitation, member: nextMember };
    });
  }

  async revokeInvitation(
    labId: string,
    invitationId: string,
    actor: Identity,
    expectedRevision: number
  ): Promise<Invitation> {
    return this.db.runTransaction(async (transaction) => {
      const ref = this.invitationRef(labId, invitationId);
      const invitation = await getInTransaction<Invitation>(
        transaction,
        ref,
        "INVITATION_NOT_FOUND"
      );
      assertRevision(invitation.revision, expectedRevision, invitation, {
        entity: "invitation",
        labId,
        invitationId
      });
      if (invitation.status === "revoked") return invitation;
      if (invitation.status === "accepted") {
        conflict("INVITATION_ALREADY_ACCEPTED", "Accepted invitations cannot be revoked.");
      }
      const updatedAt = nowIso();
      const next: Invitation = {
        ...invitation,
        status: "revoked",
        revision: invitation.revision + 1,
        updatedAt
      };
      transaction.set(ref, next);
      this.appendEvent(transaction, labId, {
        actor,
        memberId: invitation.memberId,
        invitationId,
        type: "invitation.revoked",
        revision: next.revision
      });
      return next;
    });
  }

  async getLab(labId: string): Promise<Lab> {
    return getDocument<Lab>(this.labRef(labId), "LAB_NOT_FOUND");
  }

  async listMembershipsForEmail(email: string): Promise<Membership[]> {
    const snapshot = await this.db
      .collectionGroup("members")
      .where("normalizedEmail", "==", normalizeEmail(email))
      .get();
    const members = snapshot.docs
      .map((document) => document.data() as Member)
      .filter((member) => member.active);
    return Promise.all(
      members.map(async (member) => {
        const [lab, configSnapshot] = await Promise.all([
          this.getLab(member.labId),
          this.configRef(member.labId, member.id).get()
        ]);
        return {
          member,
          lab,
          config: configSnapshot.exists ? (configSnapshot.data() as MemberConfig) : null
        };
      })
    );
  }

  async getMember(labId: string, memberId: string): Promise<Member> {
    return getDocument<Member>(this.memberRef(labId, memberId), "MEMBER_NOT_FOUND");
  }

  async findMemberByEmail(labId: string, email: string): Promise<Member | null> {
    const snapshot = await this.labRef(labId)
      .collection("members")
      .where("normalizedEmail", "==", normalizeEmail(email))
      .limit(1)
      .get();
    return snapshot.empty ? null : (snapshot.docs[0]?.data() as Member);
  }

  async listMembers(labId: string): Promise<Member[]> {
    const snapshot = await this.labRef(labId).collection("members").orderBy("displayName").get();
    return snapshot.docs.map((document) => document.data() as Member);
  }

  async createMember(
    labId: string,
    actor: Identity,
    input: Omit<InvitationInput, "expiresAt">,
    idempotencyKey: string
  ): Promise<Versioned<{ member: Member; config: MemberConfig }>> {
    const memberId = randomUUID();
    const keyRef = this.labIdempotencyRef(labId, actor.subject, "member", idempotencyKey);
    return this.db.runTransaction(async (transaction) => {
      await getInTransaction<Lab>(transaction, this.labRef(labId), "LAB_NOT_FOUND");
      const priorKey = await transaction.get(keyRef);
      if (priorKey.exists) {
        const priorMemberId = requiredString(priorKey.data(), "memberId");
        return {
          value: {
            member: await getInTransaction<Member>(
              transaction,
              this.memberRef(labId, priorMemberId),
              "MEMBER_NOT_FOUND"
            ),
            config: await getInTransaction<MemberConfig>(
              transaction,
              this.configRef(labId, priorMemberId),
              "CONFIG_NOT_FOUND"
            )
          },
          replayed: true
        };
      }
      const existing = await this.findMemberByEmailInTransaction(transaction, labId, input.email);
      if (existing?.active) {
        conflict("MEMBER_EMAIL_EXISTS", "An active member already uses this email.");
      }
      const createdAt = nowIso();
      const member = makeMember(labId, memberId, actor, input, createdAt);
      const config = makeConfig(labId, memberId, actor, input, createdAt);
      transaction.create(this.memberRef(labId, memberId), member);
      transaction.create(this.configRef(labId, memberId), config);
      transaction.create(keyRef, { memberId, createdAt });
      this.appendEvent(transaction, labId, {
        actor,
        memberId,
        type: "member.created",
        toStatus: "invited",
        revision: 1
      });
      return { value: { member, config }, replayed: false };
    });
  }

  async updateMember(
    labId: string,
    memberId: string,
    actor: Identity,
    expectedRevision: number,
    patch: MemberPatch
  ): Promise<Member> {
    return this.db.runTransaction(async (transaction) => {
      const ref = this.memberRef(labId, memberId);
      const member = await getInTransaction<Member>(transaction, ref, "MEMBER_NOT_FOUND");
      assertRevision(member.revision, expectedRevision, member, {
        entity: "member",
        labId,
        memberId
      });
      const next: Member = {
        ...member,
        ...(patch.displayName !== undefined ? { displayName: patch.displayName } : {}),
        ...(patch.roles !== undefined ? { roles: [...patch.roles] } : {}),
        ...(patch.active !== undefined ? { active: patch.active } : {}),
        revision: member.revision + 1,
        updatedAt: nowIso()
      };
      transaction.set(ref, next);
      this.appendEvent(transaction, labId, {
        actor,
        memberId,
        type: "member.updated",
        revision: next.revision
      });
      return next;
    });
  }

  async updateMemberSetup(
    labId: string,
    memberId: string,
    actor: Identity,
    expectedMemberRevision: number,
    expectedConfigRevision: number,
    memberPatch: MemberPatch,
    configPatch: MemberConfigPatch
  ): Promise<{ member: Member; config: MemberConfig }> {
    return this.db.runTransaction(async (transaction) => {
      const memberRef = this.memberRef(labId, memberId);
      const configRef = this.configRef(labId, memberId);
      const member = await getInTransaction<Member>(transaction, memberRef, "MEMBER_NOT_FOUND");
      const config = await getInTransaction<MemberConfig>(
        transaction,
        configRef,
        "CONFIG_NOT_FOUND"
      );
      assertRevision(member.revision, expectedMemberRevision, member, {
        entity: "member",
        labId,
        memberId
      });
      assertRevision(config.revision, expectedConfigRevision, config, {
        entity: "memberConfig",
        labId,
        memberId
      });
      const updatedAt = nowIso();
      const spreadsheetChanged =
        configPatch.spreadsheetId !== undefined &&
        configPatch.spreadsheetId !== config.spreadsheetId;
      const sheetChanged =
        configPatch.activeSheetName !== undefined &&
        configPatch.activeSheetName !== config.activeSheetName;
      const patchedConfig: MemberConfig = {
        ...config,
        ...(configPatch.spreadsheetId !== undefined
          ? { spreadsheetId: configPatch.spreadsheetId }
          : {}),
        ...(configPatch.taskLogUrl !== undefined
          ? { taskLogUrl: configPatch.taskLogUrl }
          : {}),
        ...(configPatch.activeSheetName !== undefined
          ? { activeSheetName: configPatch.activeSheetName }
          : {}),
        ...(configPatch.proposedColumnMap !== undefined
          ? { proposedColumnMap: configPatch.proposedColumnMap }
          : {}),
        revision: config.revision + 1,
        updatedAt,
        updatedBy: actor.subject
      };
      const nextConfig = spreadsheetChanged
        ? withoutVerificationProof(patchedConfig)
        : sheetChanged
          ? withoutAcceptedMap(patchedConfig)
          : patchedConfig;
      const onboarding =
        member.onboarding.status !== "invited" &&
        member.onboarding.status !== "blocked" &&
        (spreadsheetChanged || (sheetChanged && member.onboarding.status === "ready"))
          ? {
              status: spreadsheetChanged ? "needsSharing" as const : "needsColumnReview" as const,
              ...STATUS_DEFAULTS[spreadsheetChanged ? "needsSharing" : "needsColumnReview"],
              updatedAt
            }
          : member.onboarding;
      const nextMember: Member = {
        ...member,
        ...(memberPatch.displayName !== undefined
          ? { displayName: memberPatch.displayName }
          : {}),
        ...(memberPatch.roles !== undefined ? { roles: [...memberPatch.roles] } : {}),
        ...(memberPatch.active !== undefined ? { active: memberPatch.active } : {}),
        onboarding,
        revision: member.revision + 1,
        updatedAt
      };
      transaction.set(memberRef, nextMember);
      transaction.set(configRef, nextConfig);
      this.appendEvent(transaction, labId, {
        actor,
        memberId,
        type: "member.setupUpdated",
        revision: nextMember.revision,
        metadata: { configRevision: nextConfig.revision }
      });
      return { member: nextMember, config: nextConfig };
    });
  }

  async deactivateMember(
    labId: string,
    memberId: string,
    actor: Identity,
    expectedRevision: number,
    invitation?: { id: string; expectedRevision: number }
  ): Promise<Member> {
    return this.db.runTransaction(async (transaction) => {
      const memberRef = this.memberRef(labId, memberId);
      const member = await getInTransaction<Member>(
        transaction,
        memberRef,
        "MEMBER_NOT_FOUND"
      );
      assertRevision(member.revision, expectedRevision, member, {
        entity: "member",
        labId,
        memberId,
        operation: "deactivate"
      });
      let pendingInvitation: Invitation | undefined;
      if (invitation) {
        const invitationRef = this.invitationRef(labId, invitation.id);
        pendingInvitation = await getInTransaction<Invitation>(
          transaction,
          invitationRef,
          "INVITATION_NOT_FOUND"
        );
        assertRevision(
          pendingInvitation.revision,
          invitation.expectedRevision,
          pendingInvitation,
          { entity: "invitation", labId, memberId, invitationId: invitation.id }
        );
        if (
          pendingInvitation.memberId !== memberId ||
          pendingInvitation.status !== "pending"
        ) {
          conflict(
            "INVITATION_NOT_PENDING",
            "Only this member's pending invitation can be revoked during removal."
          );
        }
      }
      if (!member.active && (!pendingInvitation || pendingInvitation.status === "revoked")) {
        return member;
      }
      const updatedAt = nowIso();
      const next: Member = {
        ...member,
        active: false,
        revision: member.revision + 1,
        updatedAt
      };
      transaction.set(memberRef, next);
      if (pendingInvitation) {
        transaction.set(this.invitationRef(labId, pendingInvitation.id), {
          ...pendingInvitation,
          status: "revoked",
          revision: pendingInvitation.revision + 1,
          updatedAt
        });
      }
      this.appendEvent(transaction, labId, {
        actor,
        memberId,
        ...(pendingInvitation ? { invitationId: pendingInvitation.id } : {}),
        type: "member.deactivated",
        revision: next.revision
      });
      return next;
    });
  }

  async getConfig(labId: string, memberId: string): Promise<MemberConfig> {
    return getDocument<MemberConfig>(this.configRef(labId, memberId), "CONFIG_NOT_FOUND");
  }

  async updateConfig(
    labId: string,
    memberId: string,
    actor: Identity,
    expectedRevision: number,
    patch: MemberConfigPatch,
    columnReviewComplete: boolean
  ): Promise<{ config: MemberConfig; member: Member }> {
    return this.db.runTransaction(async (transaction) => {
      const configRef = this.configRef(labId, memberId);
      const memberRef = this.memberRef(labId, memberId);
      const config = await getInTransaction<MemberConfig>(transaction, configRef, "CONFIG_NOT_FOUND");
      const member = await getInTransaction<Member>(transaction, memberRef, "MEMBER_NOT_FOUND");
      assertRevision(config.revision, expectedRevision, config, {
        entity: "memberConfig",
        labId,
        memberId
      });
      const updatedAt = nowIso();
      const spreadsheetChanged =
        patch.spreadsheetId !== undefined && patch.spreadsheetId !== config.spreadsheetId;
      const sheetChanged =
        patch.activeSheetName !== undefined &&
        patch.activeSheetName !== config.activeSheetName;
      const patchedConfig: MemberConfig = {
        ...config,
        ...(patch.spreadsheetId !== undefined
          ? { spreadsheetId: patch.spreadsheetId }
          : {}),
        ...(patch.taskLogUrl !== undefined ? { taskLogUrl: patch.taskLogUrl } : {}),
        ...(patch.activeSheetName !== undefined
          ? { activeSheetName: patch.activeSheetName }
          : {}),
        ...(patch.proposedColumnMap !== undefined
          ? { proposedColumnMap: patch.proposedColumnMap }
          : {}),
        ...(patch.acceptedColumnMap !== undefined
          ? { acceptedColumnMap: patch.acceptedColumnMap }
          : {}),
        revision: config.revision + 1,
        updatedAt,
        updatedBy: actor.subject
      };
      const nextConfig: MemberConfig = spreadsheetChanged
        ? withoutVerificationProof(patchedConfig)
        : sheetChanged
          ? withoutAcceptedMap(patchedConfig)
          : patchedConfig;
      let nextMember = member;
      if (
        !columnReviewComplete &&
        member.onboarding.status !== "invited" &&
        member.onboarding.status !== "blocked" &&
        (spreadsheetChanged || (sheetChanged && member.onboarding.status === "ready"))
      ) {
        const status = spreadsheetChanged ? "needsSharing" : "needsColumnReview";
        nextMember = {
          ...member,
          onboarding: {
            status,
            ...STATUS_DEFAULTS[status],
            updatedAt
          },
          revision: member.revision + 1,
          updatedAt
        };
        transaction.set(memberRef, nextMember);
      }
      if (columnReviewComplete) {
        if (!nextConfig.acceptedColumnMap || Object.keys(nextConfig.acceptedColumnMap).length === 0) {
          throw new ApiError({
            status: 400,
            code: "ACCEPTED_COLUMN_MAP_REQUIRED",
            message: "A non-empty accepted column map is required to complete column review.",
            action: "Send acceptedColumnMap and set columnReviewComplete to true."
          });
        }
        nextMember = {
          ...member,
          onboarding: advanceOnboarding(member.onboarding, "ready", updatedAt),
          active: true,
          revision: member.revision + 1,
          updatedAt
        };
        transaction.set(memberRef, nextMember);
      }
      transaction.set(configRef, nextConfig);
      this.appendEvent(transaction, labId, {
        actor,
        memberId,
        type: columnReviewComplete ? "config.columnReviewCompleted" : "config.updated",
        ...(columnReviewComplete
          ? {
              fromStatus: member.onboarding.status,
              toStatus: nextMember.onboarding.status,
              revision: nextMember.revision
            }
          : { revision: nextConfig.revision })
      });
      return { config: nextConfig, member: nextMember };
    });
  }

  async recordPickerProof(
    labId: string,
    memberId: string,
    actor: Identity,
    spreadsheetId: string,
    expectedRevision: number
  ): Promise<{ config: MemberConfig; member: Member }> {
    return this.db.runTransaction(async (transaction) => {
      const configRef = this.configRef(labId, memberId);
      const memberRef = this.memberRef(labId, memberId);
      const config = await getInTransaction<MemberConfig>(transaction, configRef, "CONFIG_NOT_FOUND");
      const member = await getInTransaction<Member>(transaction, memberRef, "MEMBER_NOT_FOUND");
      assertRevision(config.revision, expectedRevision);
      if (config.spreadsheetId !== spreadsheetId) {
        throw new ApiError({
          status: 409,
          code: "WRONG_PICKER_FILE",
          message: "The selected Drive file does not match the authoritative task-log workbook.",
          action: "Open Picker again and select the exact workbook shown in the invitation.",
          details: { expectedSpreadsheetId: config.spreadsheetId }
        });
      }
      const updatedAt = nowIso();
      const nextConfig: MemberConfig = {
        ...config,
        pickerVerifiedAt: updatedAt,
        pickerVerifiedBy: actor.subject,
        revision: config.revision + 1,
        updatedAt,
        updatedBy: actor.subject
      };
      const nextMember: Member = {
        ...member,
        onboarding: advanceOnboarding(member.onboarding, "needsColumnReview", updatedAt),
        revision: member.revision + 1,
        updatedAt
      };
      transaction.set(configRef, nextConfig);
      transaction.set(memberRef, nextMember);
      this.appendEvent(transaction, labId, {
        actor,
        memberId,
        type: "picker.verified",
        fromStatus: member.onboarding.status,
        toStatus: "needsColumnReview",
        revision: nextMember.revision
      });
      return { config: nextConfig, member: nextMember };
    });
  }

  async getManagerFileProgress(
    labId: string,
    memberId: string,
    actor: Identity
  ): Promise<{ member: Member; progress: ManagerFileProgress }> {
    const [lab, member, membersSnapshot, configsSnapshot] = await Promise.all([
      this.getLab(labId),
      this.getMember(labId, memberId),
      this.labRef(labId).collection("members").where("active", "==", true).get(),
      this.labRef(labId).collection("configs").get()
    ]);
    assertManagerProofOwner(member, actor);
    const progress = managerFileProgress(
      lab,
      member,
      membersSnapshot.docs.map((document) => document.data() as Member),
      configsSnapshot.docs.map((document) => document.data() as MemberConfig)
    );
    return { member, progress };
  }

  async recordManagerFileProof(
    labId: string,
    memberId: string,
    actor: Identity,
    selectedFileIds: string[],
    expectedRevision: number
  ): Promise<{ member: Member; progress: ManagerFileProgress }> {
    return this.db.runTransaction(async (transaction) => {
      const lab = await getInTransaction<Lab>(
        transaction,
        this.labRef(labId),
        "LAB_NOT_FOUND"
      );
      const memberRef = this.memberRef(labId, memberId);
      const member = await getInTransaction<Member>(
        transaction,
        memberRef,
        "MEMBER_NOT_FOUND"
      );
      assertManagerProofOwner(member, actor);
      assertRevision(member.revision, expectedRevision, member, {
        entity: "member",
        labId,
        memberId,
        operation: "managerFileProof"
      });
      if (member.onboarding.status !== "needsPicker") {
        throw new ApiError({
          status: 409,
          code: "MANAGER_FILE_PROOF_NOT_READY",
          message: `Manager file proof cannot be recorded while onboarding is ${member.onboarding.status}.`,
          action: "Refresh the membership and complete the current onboarding prerequisite."
        });
      }

      const membersSnapshot = await transaction.get(
        this.labRef(labId).collection("members").where("active", "==", true)
      );
      const configsSnapshot = await transaction.get(
        this.labRef(labId).collection("configs")
      );
      const activeMembers = membersSnapshot.docs.map(
        (document) => document.data() as Member
      );
      const configs = configsSnapshot.docs.map(
        (document) => document.data() as MemberConfig
      );
      const currentProgress = managerFileProgress(lab, member, activeMembers, configs);
      const requiredIds = new Set(
        currentProgress.requiredFiles.map((resource) => resource.fileId)
      );
      const uniqueSelected = [...new Set(selectedFileIds.map((id) => id.trim()).filter(Boolean))];
      const unexpected = uniqueSelected.filter((id) => !requiredIds.has(id));
      if (unexpected.length > 0) {
        throw new ApiError({
          status: 409,
          code: "UNEXPECTED_MANAGER_PICKER_FILE",
          message: "Picker proof included a file that is not currently required for this lab.",
          action: "Retry and select only the exact files listed in the first-run checklist.",
          details: {
            unexpectedFileIds: unexpected,
            requiredFileIds: [...requiredIds]
          }
        });
      }

      const verifiedFileIds = [
        ...new Set([...currentProgress.verifiedFileIds, ...uniqueSelected])
      ].filter((id) => requiredIds.has(id));
      const updatedAt = nowIso();
      const remainingFileIds = [...requiredIds].filter(
        (id) => !verifiedFileIds.includes(id)
      );
      const onboarding =
        remainingFileIds.length === 0
          ? completeManagerFileProof(
              member.onboarding,
              currentProgress.requiresColumnReview,
              updatedAt
            )
          : member.onboarding;
      const nextMember: Member = {
        ...member,
        managerFileProof: {
          verifiedFileIds,
          updatedAt,
          updatedBy: actor.subject
        },
        onboarding,
        revision: member.revision + 1,
        updatedAt
      };
      transaction.set(memberRef, nextMember);
      this.appendEvent(transaction, labId, {
        actor,
        memberId,
        type:
          remainingFileIds.length === 0
            ? "managerFileProof.completed"
            : "managerFileProof.updated",
        fromStatus: member.onboarding.status,
        toStatus: onboarding.status,
        revision: nextMember.revision,
        metadata: {
          verifiedCount: verifiedFileIds.length,
          requiredCount: requiredIds.size,
          remainingCount: remainingFileIds.length
        }
      });
      return {
        member: nextMember,
        progress: managerFileProgress(lab, nextMember, activeMembers, configs)
      };
    });
  }

  async blockMember(
    labId: string,
    memberId: string,
    actor: Identity,
    expectedRevision: number,
    reason: string,
    nextAction: string
  ): Promise<Member> {
    return this.updateOnboarding(labId, memberId, actor, expectedRevision, (member, updatedAt) =>
      blockOnboarding(member.onboarding, reason, nextAction, updatedAt)
    , "onboarding.blocked");
  }

  async resumeMember(
    labId: string,
    memberId: string,
    actor: Identity,
    expectedRevision: number
  ): Promise<Member> {
    return this.updateOnboarding(
      labId,
      memberId,
      actor,
      expectedRevision,
      (member, updatedAt) => resumeOnboarding(member.onboarding, updatedAt),
      "onboarding.resumed"
    );
  }

  async getDriveProvisioningContext(
    labId: string,
    actorEmail: string,
    targetMemberId: string
  ): Promise<DriveProvisioningContext> {
    const [lab, actor, target, targetConfig] = await Promise.all([
      this.getLab(labId),
      this.findMemberByEmail(labId, actorEmail),
      this.getMember(labId, targetMemberId),
      this.getConfig(labId, targetMemberId)
    ]);
    if (!actor?.active || !actor.roles.some((role) => role === "manager" || role === "pi")) {
      forbidden("Only an active Firestore manager or PI can provision Drive access.");
    }
    if (!target.active) {
      forbidden("Drive access cannot be provisioned for an inactive member.");
    }

    let members: Member[] = [];
    let configs: MemberConfig[] = [];
    if (target.roles.some((role) => role === "manager" || role === "pi")) {
      const [memberDocuments, configDocuments] = await Promise.all([
        this.labRef(labId).collection("members").where("active", "==", true).get(),
        this.labRef(labId).collection("configs").get()
      ]);
      members = memberDocuments.docs.map((document) => document.data() as Member);
      configs = configDocuments.docs.map((document) => document.data() as MemberConfig);
    }

    return {
      actor,
      target,
      resources: buildDriveProvisioningResources(lab, target, targetConfig, members, configs)
    };
  }

  async recordDriveSharing(
    labId: string,
    targetMemberId: string,
    actor: Identity,
    grantedFileIds: string[],
    expectedRevision: number
  ): Promise<{ config: MemberConfig; member: Member }> {
    return this.db.runTransaction(async (transaction) => {
      const configRef = this.configRef(labId, targetMemberId);
      const memberRef = this.memberRef(labId, targetMemberId);
      const config = await getInTransaction<MemberConfig>(transaction, configRef, "CONFIG_NOT_FOUND");
      const member = await getInTransaction<Member>(transaction, memberRef, "MEMBER_NOT_FOUND");
      assertRevision(member.revision, expectedRevision);
      if (!grantedFileIds.includes(config.spreadsheetId)) {
        throw new ApiError({
          status: 409,
          code: "TASK_LOG_NOT_SHARED",
          message: "The authoritative task-log workbook was not successfully shared.",
          action: "Resolve the Drive error for the task log, then retry provisioning."
        });
      }
      const updatedAt = nowIso();
      const nextConfig: MemberConfig = {
        ...config,
        sharingVerifiedAt: updatedAt,
        revision: config.revision + 1,
        updatedAt,
        updatedBy: actor.subject
      };
      const nextMember: Member = {
        ...member,
        onboarding: advanceOnboarding(member.onboarding, "needsPicker", updatedAt),
        revision: member.revision + 1,
        updatedAt
      };
      transaction.set(configRef, nextConfig);
      transaction.set(memberRef, nextMember);
      this.appendEvent(transaction, labId, {
        actor,
        memberId: targetMemberId,
        type: "drive.sharingVerified",
        fromStatus: member.onboarding.status,
        toStatus: "needsPicker",
        revision: nextMember.revision,
        metadata: { fileCount: grantedFileIds.length }
      });
      return { config: nextConfig, member: nextMember };
    });
  }

  private async updateOnboarding(
    labId: string,
    memberId: string,
    actor: Identity,
    expectedRevision: number,
    update: (member: Member, updatedAt: string) => Member["onboarding"],
    eventType: string
  ): Promise<Member> {
    return this.db.runTransaction(async (transaction) => {
      const ref = this.memberRef(labId, memberId);
      const member = await getInTransaction<Member>(transaction, ref, "MEMBER_NOT_FOUND");
      assertRevision(member.revision, expectedRevision);
      const updatedAt = nowIso();
      const onboarding = update(member, updatedAt);
      const next: Member = {
        ...member,
        onboarding,
        revision: member.revision + 1,
        updatedAt
      };
      transaction.set(ref, next);
      this.appendEvent(transaction, labId, {
        actor,
        memberId,
        type: eventType,
        fromStatus: member.onboarding.status,
        toStatus: onboarding.status,
        revision: next.revision
      });
      return next;
    });
  }

  private async findMemberByEmailInTransaction(
    transaction: Transaction,
    labId: string,
    email: string
  ): Promise<Member | null> {
    const query = this.labRef(labId)
      .collection("members")
      .where("normalizedEmail", "==", normalizeEmail(email))
      .limit(1);
    const snapshot = await transaction.get(query);
    return snapshot.empty ? null : (snapshot.docs[0]?.data() as Member);
  }

  private appendEvent(
    transaction: Transaction,
    labId: string,
    input: {
      actor: Identity;
      type: string;
      memberId?: string;
      invitationId?: string;
      fromStatus?: Member["onboarding"]["status"];
      toStatus?: Member["onboarding"]["status"];
      revision?: number;
      metadata?: OnboardingEvent["metadata"];
    }
  ): void {
    const id = randomUUID();
    const event: OnboardingEvent = {
      id,
      labId,
      actorSubject: input.actor.subject,
      actorEmail: normalizeEmail(input.actor.email),
      type: input.type,
      occurredAt: nowIso(),
      ...(input.memberId ? { memberId: input.memberId } : {}),
      ...(input.invitationId ? { invitationId: input.invitationId } : {}),
      ...(input.fromStatus ? { fromStatus: input.fromStatus } : {}),
      ...(input.toStatus ? { toStatus: input.toStatus } : {}),
      ...(input.revision !== undefined ? { revision: input.revision } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {})
    };
    transaction.create(this.labRef(labId).collection("events").doc(id), event);
  }

  private labRef(labId: string): DocumentReference<DocumentData> {
    return this.db.collection("labs").doc(labId);
  }

  private memberRef(labId: string, memberId: string): DocumentReference<DocumentData> {
    return this.labRef(labId).collection("members").doc(memberId);
  }

  private configRef(labId: string, memberId: string): DocumentReference<DocumentData> {
    return this.labRef(labId).collection("configs").doc(memberId);
  }

  private invitationRef(labId: string, invitationId: string): DocumentReference<DocumentData> {
    return this.labRef(labId).collection("invitations").doc(invitationId);
  }

  private globalIdempotencyRef(
    subject: string,
    operation: string,
    key: string
  ): DocumentReference<DocumentData> {
    return this.db.collection("idempotency").doc(idempotencyId(subject, operation, key));
  }

  private labIdempotencyRef(
    labId: string,
    subject: string,
    operation: string,
    key: string
  ): DocumentReference<DocumentData> {
    return this.labRef(labId)
      .collection("idempotency")
      .doc(idempotencyId(subject, operation, key));
  }
}

function assertManagerProofOwner(member: Member, actor: Identity): void {
  if (
    member.normalizedEmail !== normalizeEmail(actor.email) ||
    !member.active ||
    !member.roles.some((role) => role === "manager" || role === "pi")
  ) {
    throw new ApiError({
      status: 403,
      code: "MANAGER_FILE_PROOF_MUST_BE_SELF_REPORTED",
      message: "Exact-file proof must come from this active manager or PI account.",
      action: "Sign in as the manager or PI whose first-run checklist is being completed."
    });
  }
}

function managerFileProgress(
  lab: Lab,
  manager: Member,
  activeMembers: Member[],
  configs: MemberConfig[]
): ManagerFileProgress {
  const activeById = new Map(activeMembers.map((member) => [member.id, member]));
  const required = new Map<string, ManagerRequiredFile>();
  required.set(lab.adminSpreadsheetId, {
    fileId: lab.adminSpreadsheetId,
    purpose: "adminWorkbook",
    label: "Admin workbook"
  });
  for (const config of configs) {
    const member = activeById.get(config.memberId);
    if (!member || !config.spreadsheetId.trim()) continue;
    required.set(config.spreadsheetId, {
      fileId: config.spreadsheetId,
      purpose: "requiredTaskLog",
      label: `${member.displayName} Task-log workbook`,
      memberId: member.id,
      ...(config.activeSheetName ? { activeSheetName: config.activeSheetName } : {})
    });
  }
  const requiredFiles = [...required.values()].sort((left, right) => {
    if (left.purpose !== right.purpose) {
      return left.purpose === "adminWorkbook" ? -1 : 1;
    }
    return left.label.localeCompare(right.label);
  });
  const requiredIds = new Set(requiredFiles.map((resource) => resource.fileId));
  const verifiedFileIds = (manager.managerFileProof?.verifiedFileIds ?? []).filter((id) =>
    requiredIds.has(id)
  );
  const remainingFileIds = requiredFiles
    .map((resource) => resource.fileId)
    .filter((id) => !verifiedFileIds.includes(id));
  return {
    requiredFiles,
    verifiedFileIds,
    remainingFileIds,
    complete: remainingFileIds.length === 0,
    requiresColumnReview: configs.some(
      (config) =>
        config.memberId === manager.id &&
        Boolean(config.spreadsheetId.trim() && config.activeSheetName.trim())
    )
  };
}

function withoutVerificationProof(config: MemberConfig): MemberConfig {
  const next = { ...config };
  delete next.pickerVerifiedAt;
  delete next.pickerVerifiedBy;
  delete next.sharingVerifiedAt;
  delete next.acceptedColumnMap;
  return next;
}

export function buildDriveProvisioningResources(
  lab: Lab,
  target: Member,
  targetConfig: MemberConfig,
  members: Member[],
  configs: MemberConfig[]
): DriveResource[] {
  const resources = new Map<string, DriveResource>();
  const addResource = (resource: DriveResource): void => {
    if (resource.fileId && !resources.has(resource.fileId)) {
      resources.set(resource.fileId, resource);
    }
  };

  addResource({ fileId: targetConfig.spreadsheetId, purpose: "taskLog" });
  if (!target.roles.some((role) => role === "manager" || role === "pi")) {
    return [...resources.values()];
  }

  addResource({ fileId: lab.adminSpreadsheetId, purpose: "adminWorkbook" });
  const activeMemberFiles = managerFileProgress(
    lab,
    target,
    members.filter((member) => member.active),
    configs
  );
  for (const resource of activeMemberFiles.requiredFiles) {
    addResource({ fileId: resource.fileId, purpose: resource.purpose });
  }
  return [...resources.values()];
}

function withoutAcceptedMap(config: MemberConfig): MemberConfig {
  const next = { ...config };
  delete next.acceptedColumnMap;
  return next;
}

function makeMember(
  labId: string,
  memberId: string,
  actor: Identity,
  input: Pick<InvitationInput, "email" | "displayName" | "roles">,
  createdAt: string
): Member {
  return {
    id: memberId,
    labId,
    email: normalizeEmail(input.email),
    normalizedEmail: normalizeEmail(input.email),
    displayName: input.displayName.trim(),
    roles: [...input.roles],
    active: false,
    revision: 1,
    onboarding: initialOnboardingState(createdAt),
    createdAt,
    createdBy: actor.subject,
    updatedAt: createdAt
  };
}

function makeConfig(
  labId: string,
  memberId: string,
  actor: Identity,
  input: Pick<
    InvitationInput,
    "spreadsheetId" | "taskLogUrl" | "activeSheetName" | "proposedColumnMap"
  >,
  createdAt: string
): MemberConfig {
  return {
    memberId,
    labId,
    spreadsheetId: input.spreadsheetId.trim(),
    ...(input.taskLogUrl?.trim() ? { taskLogUrl: input.taskLogUrl.trim() } : {}),
    activeSheetName: input.activeSheetName.trim(),
    proposedColumnMap: input.proposedColumnMap,
    revision: 1,
    updatedAt: createdAt,
    updatedBy: actor.subject
  };
}

async function getDocument<T>(
  reference: DocumentReference<DocumentData>,
  code: string
): Promise<T> {
  const snapshot = await reference.get();
  if (!snapshot.exists) notFound(code, "The requested record does not exist.");
  return snapshot.data() as T;
}

async function getInTransaction<T>(
  transaction: Transaction,
  reference: DocumentReference<DocumentData>,
  code: string
): Promise<T> {
  const snapshot = await transaction.get(reference);
  if (!snapshot.exists) notFound(code, "The requested record does not exist.");
  return snapshot.data() as T;
}

function assertRevision(
  actual: number,
  expected: number,
  currentRecord?: unknown,
  context?: Record<string, unknown>
): void {
  if (actual !== expected) {
    throw new ApiError({
      status: 409,
      code: "REVISION_CONFLICT",
      message: "The record changed after it was loaded.",
      action: "Fetch the latest record, merge the intended change, and retry.",
      details: {
        expectedRevision: expected,
        currentRevision: actual,
        ...(currentRecord !== undefined ? { currentRecord } : {}),
        ...(context ? { context } : {})
      }
    });
  }
}

function requiredString(data: DocumentData | undefined, key: string): string {
  const value = data?.[key];
  if (typeof value !== "string" || !value) {
    throw new Error(`Corrupt idempotency record: missing ${key}.`);
  }
  return value;
}

function idempotencyId(subject: string, operation: string, key: string): string {
  return createHash("sha256").update(`${subject}\u0000${operation}\u0000${key}`).digest("hex");
}

function notFound(code: string, message: string): never {
  throw new ApiError({
    status: 404,
    code,
    message,
    action: "Refresh the lab data and verify the identifier."
  });
}

function conflict(code: string, message: string): never {
  throw new ApiError({
    status: 409,
    code,
    message,
    action: "Refresh the record and use the current state."
  });
}

function forbidden(message: string): never {
  throw new ApiError({
    status: 403,
    code: "FORBIDDEN",
    message,
    action: "Use an active Google account with manager or PI access for this lab."
  });
}

export function createFirestore(projectId?: string, databaseId = "(default)"): Firestore {
  return new Firestore({
    ...(projectId ? { projectId } : {}),
    databaseId,
    ignoreUndefinedProperties: true
  });
}

export { FieldPath };
