import { describe, expect, it } from "vitest";
import { makePerson, splitForSave, validatePeople } from "./teamSetupState";

describe("team setup state", () => {
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

  it("carries an immutable member ID into registry and role projections", () => {
    const person = makePerson({
      id: "member_123",
      name: "Renamed Person",
      email: "person@example.com",
      roles: { employee: true, manager: false, pi: false },
      taskLogUrl: "workbook",
      activeSheetName: "Tasks"
    });

    const { registryRows, roleRows } = splitForSave([person]);
    expect(registryRows[0]?.memberId).toBe("member_123");
    expect(roleRows[0]?.memberId).toBe("member_123");
    expect(roleRows[0]?.email).toBe("person@example.com");
  });
});
