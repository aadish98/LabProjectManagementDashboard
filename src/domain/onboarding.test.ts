import { describe, expect, it } from "vitest";
import { acceptedMemberPrefs, type MemberConfig } from "./onboarding";

const baseConfig: MemberConfig = {
  memberId: "member-1",
  labId: "lab-1",
  spreadsheetId: "sheet-1",
  taskLogUrl: "https://docs.google.com/spreadsheets/d/sheet-1/edit",
  activeSheetName: "Tasks",
  proposedColumnMap: {
    project: { mode: "existing", header: "Device Guess" }
  },
  revision: 1,
  updatedAt: "2026-07-14T12:00:00.000Z",
  updatedBy: "manager@example.com"
};

describe("authoritative member task preferences", () => {
  it("never substitutes a proposed map for backend acceptance", () => {
    expect(acceptedMemberPrefs(baseConfig)).toBeNull();
  });

  it("returns the accepted map in strict mode", () => {
    expect(
      acceptedMemberPrefs({
        ...baseConfig,
        acceptedColumnMap: {
          project: { mode: "existing", header: "Accepted Project" }
        }
      })
    ).toEqual({
      taskLogUrl: baseConfig.taskLogUrl,
      activeSheetName: "Tasks",
      columnMap: {
        project: { mode: "existing", header: "Accepted Project" }
      },
      strictColumnMap: true
    });
  });
});
