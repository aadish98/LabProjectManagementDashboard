import { describe, expect, it } from "vitest";
import type { Lab, Member, MemberConfig } from "../src/domain/types.js";
import { buildDriveProvisioningResources } from "../src/firestore/firestoreRepository.js";

const lab: Lab = {
  id: "lab-1",
  name: "Example Lab",
  adminSpreadsheetId: "admin-workbook",
  revision: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  createdBy: "owner-subject",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

function member(id: string, roles: Member["roles"], active = true): Member {
  return {
    id,
    labId: lab.id,
    email: `${id}@example.com`,
    normalizedEmail: `${id}@example.com`,
    displayName: id,
    roles,
    active,
    revision: 1,
    onboarding: {
      status: "ready",
      owner: "system",
      reason: "Ready",
      nextAction: "None",
      updatedAt: "2026-01-01T00:00:00.000Z"
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    createdBy: "owner-subject",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}

function config(memberId: string, spreadsheetId: string): MemberConfig {
  return {
    memberId,
    labId: lab.id,
    spreadsheetId,
    activeSheetName: "Tasks",
    proposedColumnMap: {},
    revision: 1,
    updatedAt: "2026-01-01T00:00:00.000Z",
    updatedBy: "owner-subject"
  };
}

describe("Drive provisioning resources", () => {
  it("gives employees only their configured task log", () => {
    const target = member("employee", ["employee"]);

    expect(
      buildDriveProvisioningResources(
        target,
        config(target.id, "employee-log"),
        [target, member("other", ["employee"])],
        [config("other", "other-log")]
      )
    ).toEqual([{ fileId: "employee-log", purpose: "taskLog" }]);
  });

  it("includes only active member configs for managers and PIs", () => {
    const target = member("manager", ["manager"]);
    const active = member("active-employee", ["employee"]);
    const inactive = member("inactive-employee", ["employee"], false);

    expect(
      buildDriveProvisioningResources(
        target,
        config(target.id, "manager-log"),
        [target, active, inactive],
        [
          config(target.id, "manager-log"),
          config(active.id, "active-log"),
          config(inactive.id, "inactive-log"),
          config("orphaned-member", "orphaned-log")
        ]
      )
    ).toEqual([
      { fileId: "manager-log", purpose: "taskLog" },
      { fileId: "active-log", purpose: "requiredTaskLog" }
    ]);
  });

  it("deduplicates shared files without replacing the target-log purpose", () => {
    const target = member("pi", ["pi"]);
    const colleague = member("colleague", ["employee"]);

    expect(
      buildDriveProvisioningResources(
        target,
        config(target.id, "shared-file"),
        [target, colleague],
        [config(target.id, "shared-file"), config(colleague.id, "shared-file")]
      )
    ).toEqual([{ fileId: "shared-file", purpose: "taskLog" }]);
  });
});
