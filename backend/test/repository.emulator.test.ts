import type { Firestore } from "@google-cloud/firestore";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Identity, InvitationInput } from "../src/domain/types.js";
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

  it("claims a lab and creates an invitation transaction idempotently", async () => {
    const owner: Identity = {
      subject: "owner-google-subject",
      email: "owner@example.com",
      emailVerified: true,
      name: "Lab Owner"
    };
    const claim = await repository.createBootstrapClaim(
      owner,
      {
        labName: "Emulator Lab",
        adminSpreadsheetId: "admin-file-id",
        ttlSeconds: 600
      },
      "bootstrap-idempotency-key"
    );
    const claimed = await repository.claimLab(
      owner,
      claim.value.id,
      "claim-idempotency-key"
    );
    expect(claimed.value.member.roles).toEqual(["manager", "pi"]);
    expect(claimed.value.member.onboarding.status).toBe("needsPicker");
    const firstRun = await repository.recordManagerFileProof(
      claimed.value.lab.id,
      claimed.value.member.id,
      owner,
      ["admin-file-id"],
      claimed.value.member.revision
    );
    expect(firstRun.progress).toMatchObject({
      verifiedFileIds: ["admin-file-id"],
      remainingFileIds: [],
      complete: true,
      requiresColumnReview: false
    });
    expect(firstRun.member.onboarding.status).toBe("ready");

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
      claimed.value.lab.id,
      owner,
      invitationInput,
      "invitation-idempotency-key"
    );
    const replay = await repository.createInvitation(
      claimed.value.lab.id,
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
