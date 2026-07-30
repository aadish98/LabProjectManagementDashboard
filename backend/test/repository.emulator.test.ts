import type { Firestore } from "@google-cloud/firestore";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Identity, InvitationInput, Lab, Member } from "../src/domain/types.js";
import {
  createFirestore,
  FirestoreOnboardingRepository
} from "../src/firestore/firestoreRepository.js";

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
const projectId =
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.GCLOUD_PROJECT ||
  "lab-workflow-backend-test";
const emulatorRequired = process.env.REQUIRE_FIRESTORE_EMULATOR === "1";

if (emulatorRequired && !emulatorHost) {
  throw new Error(
    "REQUIRE_FIRESTORE_EMULATOR=1 but FIRESTORE_EMULATOR_HOST is missing; the integration test cannot be skipped."
  );
}

const describeEmulator = emulatorRequired ? describe : describe.skipIf(!emulatorHost);

describeEmulator("FirestoreOnboardingRepository emulator", () => {
  let firestore: Firestore;
  let repository: FirestoreOnboardingRepository;

  beforeAll(async () => {
    if (!emulatorHost) return;
    await fetch(
      `http://${emulatorHost}/emulator/v1/projects/${projectId}/databases/(default)/documents`,
      { method: "DELETE" }
    );
    firestore = createFirestore(projectId);
    repository = new FirestoreOnboardingRepository(firestore);
  });

  afterAll(async () => {
    if (firestore) await firestore.terminate();
  });

  it("uses an operator-provisioned lab to create an invitation idempotently", async () => {
    const owner: Identity = {
      subject: "owner-google-subject",
      email: "owner@example.com",
      emailVerified: true,
      name: "Lab Owner"
    };
    const labId = "9f62dce9-752e-4c39-91b3-98e35fffd1e9";
    const ownerId = "ad0de8ec-6bce-4c26-9f3a-b5ca56e70c86";
    const createdAt = "2026-01-01T00:00:00.000Z";
    const lab: Lab = {
      id: labId,
      name: "Emulator Lab",
      adminSpreadsheetId: "operator-only-admin-file-id",
      revision: 1,
      createdAt,
      createdBy: owner.subject,
      updatedAt: createdAt
    };
    const ownerMember: Member = {
      id: ownerId,
      labId,
      email: owner.email,
      normalizedEmail: owner.email,
      displayName: owner.name ?? owner.email,
      roles: ["manager", "pi"],
      active: true,
      revision: 1,
      onboarding: {
        status: "ready",
        owner: "system",
        reason: "Imported by an operator.",
        nextAction: "Open the manager workspace.",
        updatedAt: createdAt
      },
      createdAt,
      createdBy: owner.subject,
      updatedAt: createdAt
    };
    await Promise.all([
      firestore.collection("labs").doc(labId).set(lab),
      firestore.collection("labs").doc(labId).collection("members").doc(ownerId).set(ownerMember)
    ]);

    const invitationInput: InvitationInput = {
      email: "new.member@example.com",
      displayName: "New Member",
      roles: ["employee"],
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      spreadsheetId: "task-log-file-id",
      taskLogUrl: "https://docs.google.com/spreadsheets/d/task-log-file-id/edit",
      activeSheetName: "Current Tasks",
      proposedColumnMap: {
        project: { mode: "existing", header: "Project" }
      }
    };
    const first = await repository.createInvitation(
      labId,
      owner,
      invitationInput,
      "invitation-idempotency-key"
    );
    const replay = await repository.createInvitation(
      labId,
      owner,
      invitationInput,
      "invitation-idempotency-key"
    );

    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.value.invitation.id).toBe(first.value.invitation.id);
    expect(replay.value.member.id).toBe(first.value.member.id);
    expect(first.value.member.onboarding.status).toBe("invited");
    expect(first.value.config.revision).toBe(1);

    const discovered = await repository.listInvitationsForEmail(
      "NEW.MEMBER@example.com"
    );
    expect(discovered.map((invitation) => invitation.id)).toEqual([
      first.value.invitation.id
    ]);
  });
});
