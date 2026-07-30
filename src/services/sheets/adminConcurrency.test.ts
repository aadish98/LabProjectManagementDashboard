import { afterEach, describe, expect, it, vi } from "vitest";
import type { UserSession } from "../../domain/app";
import { mirrorMemberCompatibilityRows, upsertRegistryRow } from "./admin";
import { SheetRevisionConflictError } from "./errors";

const config = { adminSpreadsheetId: "admin" };
const session: UserSession = {
  email: "manager@example.com",
  name: "Manager",
  accessToken: "token"
};

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

function metadata() {
  return json({
    spreadsheetId: "admin",
    properties: { title: "Admin" },
    sheets: [
      { properties: { sheetId: 1, title: "SheetRegistry" } },
      { properties: { sheetId: 2, title: "Roles" } }
    ]
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("row-scoped admin compatibility writes", () => {
  it("rejects a stale manager revision before any write", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = decodeURIComponent(String(input));
      if (url.includes("?fields=")) return metadata();
      if (url.includes("'SheetRegistry'!1:1")) {
        return json({
          values: [[
            "Lab Member",
            "Task Log URL",
            "Active Sheet",
            "Active",
            "Member ID",
            "Revision"
          ]]
        });
      }
      if (url.includes("'SheetRegistry'!A:Z")) {
        return json({
          values: [
            ["Lab Member", "Task Log URL", "Active Sheet", "Active", "Member ID", "Revision"],
            ["Ada", "old", "Tasks", "TRUE", "member_ada", "3"]
          ]
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      upsertRegistryRow(config, session, {
        memberId: "member_ada",
        labMember: "Ada",
        taskLogUrl: "new",
        activeSheetName: "Tasks",
        active: true,
        expectedRevision: 2,
        revision: 3
      })
    ).rejects.toBeInstanceOf(SheetRevisionConflictError);
    expect(
      fetchMock.mock.calls.some(
        (call) =>
          (call as unknown as [RequestInfo | URL, RequestInit?])[1]?.method ===
          "POST"
      )
    ).toBe(false);
  });

  it("writes only the selected member and never clears a tab on failure", async () => {
    const writes: Array<{ url: string; body: unknown }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = decodeURIComponent(String(input));
      if (url.includes("?fields=")) return metadata();
      if (url.includes("!1:1")) {
        return url.includes("SheetRegistry")
          ? json({ values: [[
              "Lab Member",
              "Task Log URL",
              "Active Sheet",
              "Active",
              "Member ID",
              "Revision"
            ]] })
          : json({ values: [[
              "Email",
              "Role",
              "Lab Member",
              "Member ID",
              "Revision",
              "Active"
            ]] });
      }
      if (url.includes("'SheetRegistry'!A:Z")) {
        return json({
          values: [
            ["Lab Member", "Task Log URL", "Active Sheet", "Active", "Member ID", "Revision"],
            ["Ada", "ada-log", "Tasks", "TRUE", "member_ada", "1"],
            ["Grace", "grace-log", "Tasks", "TRUE", "member_grace", "7"]
          ]
        });
      }
      if (url.includes("'Roles'!A:Z")) {
        return json({
          values: [
            ["Email", "Role", "Lab Member", "Member ID", "Revision", "Active"],
            ["ada@example.com", "employee", "Ada", "member_ada", "1", "TRUE"],
            ["grace@example.com", "manager", "Grace", "member_grace", "7", "TRUE"]
          ]
        });
      }
      if (url.endsWith("/values:batchUpdate") && init?.method === "POST") {
        writes.push({ url, body: JSON.parse(String(init.body)) });
        throw new TypeError("offline");
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      mirrorMemberCompatibilityRows(config, session, {
        memberId: "member_ada",
        revision: 2,
        registry: {
          memberId: "member_ada",
          labMember: "Ada Updated",
          taskLogUrl: "ada-log",
          activeSheetName: "Tasks",
          active: true
        },
        roles: [{
          memberId: "member_ada",
          email: "ada@example.com",
          role: "employee",
          labMember: "Ada Updated"
        }]
      })
    ).rejects.toMatchObject({ code: "network" });

    expect(writes).toHaveLength(1);
    expect(JSON.stringify(writes[0])).toContain("SheetRegistry");
    expect(JSON.stringify(writes[0])).toContain("Roles");
    expect(JSON.stringify(writes)).not.toContain("member_grace");
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes(":clear"))
    ).toBe(false);
  });

  it("treats an exact same-revision scoped mirror retry as idempotent", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = decodeURIComponent(String(input));
      if (url.includes("?fields=")) return metadata();
      if (url.includes("'SheetRegistry'!1:1")) {
        return json({
          values: [[
            "Lab Member",
            "Task Log URL",
            "Active Sheet",
            "Active",
            "Member ID",
            "Revision"
          ]]
        });
      }
      if (url.includes("'Roles'!1:1")) {
        return json({
          values: [[
            "Email",
            "Role",
            "Lab Member",
            "Member ID",
            "Revision",
            "Active"
          ]]
        });
      }
      if (url.includes("'SheetRegistry'!A:Z")) {
        return json({
          values: [
            ["Lab Member", "Task Log URL", "Active Sheet", "Active", "Member ID", "Revision"],
            ["Ada", "ada-log", "Tasks", "TRUE", "member_ada", "2"],
            ["Grace", "grace-log", "Tasks", "TRUE", "member_grace", "7"]
          ]
        });
      }
      if (url.includes("'Roles'!A:Z")) {
        return json({
          values: [
            ["Email", "Role", "Lab Member", "Member ID", "Revision", "Active"],
            ["ada@example.com", "employee", "Ada", "member_ada", "2", "TRUE"],
            ["grace@example.com", "manager", "Grace", "member_grace", "7", "TRUE"]
          ]
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      mirrorMemberCompatibilityRows(config, session, {
        memberId: "member_ada",
        expectedRevision: 1,
        revision: 2,
        registry: {
          memberId: "member_ada",
          labMember: "Ada",
          taskLogUrl: "ada-log",
          activeSheetName: "Tasks",
          active: true
        },
        roles: [{
          memberId: "member_ada",
          email: "ada@example.com",
          role: "employee",
          labMember: "Ada",
          active: true
        }]
      })
    ).resolves.toBeUndefined();

    expect(
      fetchMock.mock.calls.some(
        (call) =>
          (call as unknown as [RequestInfo | URL, RequestInit?])[1]?.method ===
          "POST"
      )
    ).toBe(false);
  });
});
