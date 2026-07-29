import { describe, expect, it } from "vitest";
import { visibleRegistryForRole } from "./access";

describe("compatibility Roles visibility", () => {
  it("fails closed when immutable member linkage is missing", () => {
    const registry = [
      {
        labMember: "Same Name",
        taskLogUrl: "tasks",
        activeSheetName: "Tasks",
        active: true
      },
      {
        memberId: "member-verified",
        labMember: "Renamed Person",
        taskLogUrl: "verified",
        activeSheetName: "Tasks",
        active: true
      }
    ];
    const roles = [
      {
        email: "employee@example.com",
        role: "employee" as const,
        labMember: "Same Name"
      },
      {
        memberId: "member-verified",
        email: "verified@example.com",
        role: "employee" as const,
        labMember: "Old Name"
      }
    ];

    expect(
      visibleRegistryForRole(
        registry,
        roles,
        "manager",
        "manager@example.com"
      ).map((entry) => entry.memberId)
    ).toEqual(["member-verified"]);
  });
});
