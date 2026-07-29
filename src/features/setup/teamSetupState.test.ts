import { describe, expect, it } from "vitest";
import {
  buildPeopleFromOverview,
  makePerson,
  splitForSave,
  validatePeople
} from "./teamSetupState";

describe("team setup state", () => {
  it("merges registry and role rows into one person", () => {
    const people = buildPeopleFromOverview({
      spreadsheetId: "admin",
      spreadsheetTitle: "Admin",
      setupRepairIssues: [],
      rolesState: "canonicalNonEmpty",
      registry: [
        {
          labMember: "Ada Lovelace",
          taskLogUrl: " workbook ",
          activeSheetName: "Tasks",
          active: true
        }
      ],
      registryProblems: [],
      roles: [
        { email: "ada@example.com", role: "employee", labMember: "Ada Lovelace" },
        { email: "ada@example.com", role: "manager", labMember: "Ada Lovelace" }
      ]
    });

    expect(people).toHaveLength(1);
    expect(people[0]).toMatchObject({
      name: "Ada Lovelace",
      email: "ada@example.com",
      roles: { employee: true, manager: true, pi: false }
    });
  });

  it("reports duplicate email-role and task-log names", () => {
    const first = makePerson({
      name: "Ada",
      email: "ada@example.com",
      roles: { employee: true, manager: false, pi: false },
      taskLogUrl: "workbook-1",
      activeSheetName: "Tasks"
    });
    const second = makePerson({
      name: "Ada",
      email: "ADA@example.com",
      roles: { employee: true, manager: false, pi: false },
      taskLogUrl: "workbook-2",
      activeSheetName: "Tasks"
    });

    const issues = validatePeople([first, second]).byPerson.get(second.id);

    expect(issues).toContain(
      "This email already has the Member Access role on another row."
    );
    expect(issues).toContain('Two Members share the name "Ada".');
  });

  it("normalizes draft values into registry and role writes", () => {
    const person = makePerson({
      name: " Ada ",
      email: " ada@example.com ",
      roles: { employee: false, manager: true, pi: true },
      taskLogUrl: " workbook ",
      activeSheetName: " Tasks ",
      active: false
    });

    expect(splitForSave([person])).toEqual({
      registryRows: [
        {
          memberId: person.id,
          labMember: "Ada",
          taskLogUrl: "workbook",
          activeSheetName: "Tasks",
          active: false
        }
      ],
      roleRows: [
        {
          memberId: person.id,
          email: "ada@example.com",
          role: "manager",
          labMember: "Ada"
        },
        {
          memberId: person.id,
          email: "ada@example.com",
          role: "pi",
          labMember: "Ada"
        }
      ]
    });
  });

  it("keeps immutable member IDs across registry and roles", () => {
    const [person] = buildPeopleFromOverview({
      spreadsheetId: "admin",
      spreadsheetTitle: "Admin",
      setupRepairIssues: [],
      rolesState: "canonicalNonEmpty",
      registry: [
        {
          memberId: "member_123",
          labMember: "Renamed Person",
          taskLogUrl: "workbook",
          activeSheetName: "Tasks",
          active: true
        }
      ],
      registryProblems: [],
      roles: [
        {
          memberId: "member_123",
          email: "person@example.com",
          role: "employee",
          labMember: "Old Name"
        }
      ]
    });

    expect(person.id).toBe("member_123");
    expect(person.email).toBe("person@example.com");
    expect(splitForSave([person]).roleRows[0]?.memberId).toBe("member_123");
  });
});
