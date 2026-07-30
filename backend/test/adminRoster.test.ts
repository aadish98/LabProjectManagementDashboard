import { describe, expect, it } from "vitest";
import {
  AdminRosterValidationError,
  deterministicUuid,
  parseAdminRoster
} from "../src/ops/adminRoster.js";

const LAB_ID = "52cfe7ab-b9f4-4f69-8afe-ef5308780094";

describe("parseAdminRoster", () => {
  it("aggregates role rows and joins the task-log registry", () => {
    const result = parseAdminRoster(
      [
        ["Email", "Role", "Lab Member", "Member ID", "Revision", "Active"],
        ["Ada@Example.com", "employee", "Ada Lovelace", "", "1", "TRUE"],
        ["ada@example.com", "manager", "Ada Lovelace", "", "1", "yes"],
        ["grace@example.com", "employee", "Grace Hopper", "", "1", "TRUE"],
        ["off@example.com", "employee", "Inactive", "", "1", "FALSE"]
      ],
      [
        ["Lab Member", "Task Log URL", "Active Sheet", "Active", "Member ID"],
        [
          "Ada Lovelace",
          "https://docs.google.com/spreadsheets/d/adaWorkbook123/edit",
          "Tasks",
          "TRUE",
          ""
        ],
        ["Grace Hopper", "graceWorkbook123", "Queue", "TRUE", ""]
      ],
      LAB_ID
    );

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      email: "ada@example.com",
      displayName: "Ada Lovelace",
      roles: ["employee", "manager"],
      config: {
        spreadsheetId: "adaWorkbook123",
        activeSheetName: "Tasks"
      }
    });
    expect(result[0]?.memberId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });

  it("preserves a valid UUID supplied by the compatibility sheet", () => {
    const memberId = "613622e3-21f4-4caf-a81c-8d456b77c2b8";
    const [member] = parseAdminRoster(
      [
        ["Email", "Role", "Lab Member", "Member ID"],
        ["pi@example.com", "pi", "Principal Investigator", memberId]
      ],
      [["Lab Member", "Task Log URL", "Active Sheet"]],
      LAB_ID
    );
    expect(member?.memberId).toBe(memberId);
  });

  it("fails closed when an employee has no unique active registry row", () => {
    expect(() =>
      parseAdminRoster(
        [
          ["Email", "Role", "Lab Member"],
          ["employee@example.com", "employee", "Missing Workbook"]
        ],
        [["Lab Member", "Task Log URL", "Active Sheet"]],
        LAB_ID
      )
    ).toThrowError(AdminRosterValidationError);
  });

  it("rejects conflicting duplicate people and invalid roles", () => {
    expect(() =>
      parseAdminRoster(
        [
          ["Email", "Role", "Lab Member"],
          ["same@example.com", "employee", "First Name"],
          ["same@example.com", "owner", "Second Name"]
        ],
        [
          ["Lab Member", "Task Log URL", "Active Sheet"],
          ["First Name", "firstWorkbook123", "Tasks"]
        ],
        LAB_ID
      )
    ).toThrow(/role must be employee, manager, or pi/);
  });
});

describe("deterministicUuid", () => {
  it("returns the same RFC-compatible UUID for the same seed", () => {
    expect(deterministicUuid("one")).toBe(deterministicUuid("one"));
    expect(deterministicUuid("one")).not.toBe(deterministicUuid("two"));
  });
});
