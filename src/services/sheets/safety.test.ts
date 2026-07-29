import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppConfig, EmployeeSheetPrefs, UserSession } from "../../domain/app";
import type { ExperimentDraft } from "../../domain/experiment";
import type { Membership } from "../../domain/onboarding";
import { loadGoogleSheetsDataset, mergeLastKnownExperiments } from "./dataset";
import {
  AdminWorkbookSchemaError,
  GoogleSheetsFileAccessError,
  SheetsError
} from "./errors";
import { requestSheets } from "./client";
import {
  backfillTaskIdsInSheet,
  createTaskInSheet,
  updateTaskInSheet
} from "./taskLog";

const session: UserSession = {
  email: "manager@example.com",
  name: "Manager",
  accessToken: "token"
};

const config: AppConfig = {
  adminSpreadsheetId: "admin",
  googleClientId: "",
  googleApiKey: "",
  googleAppId: ""
};

const prefs: EmployeeSheetPrefs = {
  taskLogUrl: "task-sheet",
  activeSheetName: "Tasks"
};

const draft: ExperimentDraft = {
  taskId: "task_1",
  rowNumber: 2,
  labMember: "Ada",
  taskLogUrl: "task-sheet",
  activeSheetName: "Tasks",
  project: "Atlas",
  experiment: "Trial",
  schematic: "",
  timeEstimate: "",
  startDateRaw: "",
  projectedEndDateRaw: "",
  status: "In Progress",
  result: "",
  dataLink: "",
  notebookLocation: "",
  comments: ""
};

function authoritativeMember(
  id: string,
  displayName: string,
  taskLogUrl: string,
  acceptedColumnMap: NonNullable<Membership["config"]>["acceptedColumnMap"],
  roles: Membership["member"]["roles"] = ["employee"]
): Pick<Membership, "member" | "config"> {
  return {
    member: {
      id,
      labId: "lab-1",
      email: `${displayName.toLowerCase()}@example.com`,
      normalizedEmail: `${displayName.toLowerCase()}@example.com`,
      displayName,
      roles,
      active: true,
      revision: 1,
      onboarding: {
        status: "ready",
        owner: "system",
        reason: "ready",
        nextAction: "",
        updatedAt: "2026-07-14T00:00:00.000Z"
      },
      createdAt: "2026-07-14T00:00:00.000Z",
      createdBy: "manager@example.com",
      updatedAt: "2026-07-14T00:00:00.000Z"
    },
    config: {
      memberId: id,
      labId: "lab-1",
      spreadsheetId: taskLogUrl,
      taskLogUrl,
      activeSheetName: "Tasks",
      proposedColumnMap: acceptedColumnMap ?? {},
      acceptedColumnMap,
      revision: 1,
      updatedAt: "2026-07-14T00:00:00.000Z",
      updatedBy: "manager@example.com"
    }
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("typed Sheets errors", () => {
  it("uses a typed schema error for required admin data", () => {
    expect(new AdminWorkbookSchemaError(["Roles"])).toMatchObject({
      code: "schema",
      context: { operation: "verifyAdminWorkbook" }
    });
  });

  it.each([
    [403, { error: { message: "Denied", status: "PERMISSION_DENIED" } }, "forbidden"],
    [404, { error: { message: "Missing", status: "NOT_FOUND" } }, "notFound"],
    [409, { error: { message: "Changed", status: "ABORTED" } }, "conflict"]
  ] as const)("classifies HTTP %s and preserves request context", async (status, body, code) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(body, status)));

    await expect(
      requestSheets("https://sheets.googleapis.com/v4/spreadsheets/sheet-1", "token", undefined, {
        operation: "testRead",
        sheetName: "Tasks"
      })
    ).rejects.toMatchObject({
      code,
      status,
      context: {
        spreadsheetId: "sheet-1",
        operation: "testRead",
        sheetName: "Tasks"
      }
    });
  });

  it("uses picker-grant classification only with explicit API evidence", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        json(
          {
            error: {
              message: "The app has not been granted access to this file",
              status: "PERMISSION_DENIED",
              errors: [{ reason: "appNotAuthorizedToFile" }]
            }
          },
          403
        )
      )
    );

    await expect(
      requestSheets("https://sheets.googleapis.com/v4/spreadsheets/sheet-1", "token")
    ).rejects.toBeInstanceOf(GoogleSheetsFileAccessError);
  });

  it("classifies fetch failures as network errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));

    await expect(
      requestSheets("https://sheets.googleapis.com/v4/spreadsheets/sheet-1", "token")
    ).rejects.toMatchObject({ code: "network" });
  });
});

describe("partial manager dataset loading", () => {
  it("does not consult compatibility registry or role mirrors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = decodeURIComponent(String(input));
        if (url.includes("/spreadsheets/admin?fields=")) {
          return json({
            spreadsheetId: "admin",
            properties: { title: "Admin" },
            sheets: [
              { properties: { sheetId: 1, title: "SheetRegistry" } },
              { properties: { sheetId: 2, title: "Roles" } },
              { properties: { sheetId: 3, title: "RunLog" } },
              { properties: { sheetId: 4, title: "Feedback" } }
            ]
          });
        }
        if (url.includes("Roles")) {
          return json(
            { error: { message: "Roles unavailable", status: "NOT_FOUND" } },
            404
          );
        }
        return json({ values: [] });
      })
    );

    await expect(
      loadGoogleSheetsDataset(config, session, {
        viewerRole: "manager",
        authoritativeMembers: []
      })
    ).resolves.toMatchObject({ registry: [], experiments: [] });
  });

  it("keeps accessible records and reports a per-member forbidden issue", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = decodeURIComponent(String(input));
        if (url.includes("/spreadsheets/admin?fields=")) {
          return json({
            spreadsheetId: "admin",
            properties: { title: "Admin" },
            sheets: [
              { properties: { sheetId: 1, title: "SheetRegistry" } },
              { properties: { sheetId: 2, title: "Roles" } },
              { properties: { sheetId: 3, title: "RunLog" } },
              { properties: { sheetId: 4, title: "Feedback" } }
            ]
          });
        }
        if (url.includes("/spreadsheets/admin/values/")) {
          if (url.includes("SheetRegistry")) {
            return json({
              values: [
                ["Lab Member", "Task Log URL", "Active Sheet", "Active", "Member ID"],
                ["Ada", "accessible", "Tasks", "TRUE", "member_ada"],
                ["Grace", "blocked", "Tasks", "TRUE", "member_grace"],
                ["Lin", "stale", "Tasks", "TRUE", "member_lin"]
              ]
            });
          }
          if (url.includes("Roles")) {
            return json({
              values: [
                ["Email", "Role", "Lab Member", "Member ID"],
                ["manager@example.com", "manager", "", ""],
                ["ada@example.com", "employee", "Ada", "member_ada"],
                ["grace@example.com", "employee", "Grace", "member_grace"],
                ["lin@example.com", "employee", "Lin", "member_lin"]
              ]
            });
          }
          return json({ values: [] });
        }
        if (url.includes("/spreadsheets/accessible/values/") && url.includes("Tasks")) {
          return json({
            values: [
              ["Task ID", "Lab Program", "Work Item", "State"],
              ["task_ada", "Atlas", "Trial", "Planned"]
            ]
          });
        }
        if (url.includes("/spreadsheets/blocked/values/")) {
          return json(
            { error: { message: "Caller lacks sharing permission", status: "PERMISSION_DENIED" } },
            403
          );
        }
        if (url.includes("/spreadsheets/stale/values/") && url.includes("Tasks")) {
          return json(
            { error: { message: "Unable to parse range: 'Tasks'", status: "NOT_FOUND" } },
            404
          );
        }
        if (url.includes("Profile")) {
          return json({ error: { message: "Unable to parse range", status: "NOT_FOUND" } }, 404);
        }
        throw new Error(`Unhandled test URL: ${url}`);
      })
    );

    const dataset = await loadGoogleSheetsDataset(config, session, {
      viewerRole: "manager",
      authoritativeMembers: [
        authoritativeMember("member_ada", "Ada", "accessible", {
          project: { mode: "existing", header: "Lab Program" },
          experiment: { mode: "existing", header: "Work Item" },
          status: { mode: "existing", header: "State" }
        }),
        authoritativeMember("member_grace", "Grace", "blocked", {
          project: { mode: "existing", header: "Project" }
        }),
        authoritativeMember("member_lin", "Lin", "stale", {
          project: { mode: "existing", header: "Project" }
        })
      ]
    });

    expect(dataset.experiments).toHaveLength(1);
    expect(dataset.experiments[0]).toMatchObject({
      taskId: "task_ada",
      labMember: "Ada",
      project: "Atlas",
      experiment: "Trial",
      status: "Planned"
    });
    expect(dataset.memberLoadIssues).toMatchObject([
      {
        memberId: "member_grace",
        labMember: "Grace",
        code: "forbidden",
        status: 403
      }
    ]);
    expect(dataset.staleTaskLogs).toMatchObject([
      {
        memberId: "member_lin",
        labMember: "Lin",
        activeSheetName: "Tasks"
      }
    ]);
  });

  it("retains last-known records only for members whose live load failed", () => {
    const cached = [
      {
        ...draft,
        id: "task_1",
        memberId: "member_ada",
        labMember: "Ada"
      },
      {
        ...draft,
        id: "task_2",
        memberId: "member_grace",
        labMember: "Grace"
      }
    ];

    const merged = mergeLastKnownExperiments([], cached, [
      {
        memberId: "member_grace",
        labMember: "Grace",
        taskLogUrl: "blocked",
        activeSheetName: "Tasks",
        code: "network",
        message: "offline"
      }
    ]);

    expect(merged.restoredCount).toBe(1);
    expect(merged.experiments.map((record) => record.id)).toEqual(["task_2"]);
  });
});

describe("identity-safe task updates", () => {
  it("reverifies Task ID and writes only changed mapped cells", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = decodeURIComponent(String(input));
      if (url.includes("'Tasks'!1:1")) {
        return json({
          values: [[
            "Task ID",
            "Project",
            "Formula",
            "Status",
            "Notes",
            "Task Revision"
          ]]
        });
      }
      if (url.includes("'Tasks'!A2:A")) return json({ values: [["task_1"]] });
      if (url.includes("'Tasks'!A2") && !url.includes("'Tasks'!A2:")) {
        return json({ values: [["task_1"]] });
      }
      if (url.includes("'Tasks'!A2:F2")) {
        return json({
          values: [["task_1", "Atlas", "=1+1", "Planned", "keep", "4"]]
        });
      }
      if (url.endsWith("/values:batchUpdate") && init?.method === "POST") {
        return json({});
      }
      throw new Error(`Unhandled test URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await updateTaskInSheet(
      prefs,
      session,
      { rowNumber: 2, taskId: "task_1", expectedRevision: 4 },
      draft
    );

    const write = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith("/values:batchUpdate")
    );
    expect(write).toBeDefined();
    expect(JSON.parse(String(write?.[1]?.body))).toEqual({
      valueInputOption: "USER_ENTERED",
      data: [
        { range: "'Tasks'!D2", values: [["In Progress"]] },
        { range: "'Tasks'!F2", values: [[5]] }
      ]
    });
  });

  it("refuses a stale or missing Task ID before writing", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = decodeURIComponent(String(input));
      if (url.includes("'Tasks'!1:1")) {
        return json({
          values: [["Task ID", "Project", "Status", "Task Revision"]]
        });
      }
      if (url.includes("'Tasks'!A2:A")) return json({ values: [["different_task"]] });
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      updateTaskInSheet(
        prefs,
        session,
        { rowNumber: 2, taskId: "task_1", expectedRevision: 1 },
        draft
      )
    ).rejects.toBeInstanceOf(SheetsError);
    expect(
      fetchMock.mock.calls.some(
        (call) =>
          (call as unknown as [RequestInfo | URL, RequestInit?])[1]?.method ===
          "POST"
      )
    ).toBe(false);
  });

  it("rejects the second manager's stale revision without touching custom cells", async () => {
    let revision = 7;
    let project = "Atlas";
    const writes: Array<{
      data: Array<{ range: string; values: Array<Array<string | number>> }>;
    }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = decodeURIComponent(String(input));
      if (url.includes("'Tasks'!1:1")) {
        return json({
          values: [[
            "Task ID",
            "Project",
            "Formula",
            "Custom Notes",
            "Task Revision"
          ]]
        });
      }
      if (url.includes("'Tasks'!A2:A")) return json({ values: [["task_1"]] });
      if (url.includes("'Tasks'!A2") && !url.includes("'Tasks'!A2:")) {
        return json({ values: [["task_1"]] });
      }
      if (url.includes("'Tasks'!A2:E2")) {
        return json({
          values: [["task_1", project, "=ROW()*2", "keep me", String(revision)]]
        });
      }
      if (url.endsWith("/values:batchUpdate") && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as {
          data: Array<{ range: string; values: Array<Array<string | number>> }>;
        };
        writes.push(body);
        const projectWrite = body.data.find((cell) => cell.range === "'Tasks'!B2");
        const revisionWrite = body.data.find((cell) => cell.range === "'Tasks'!E2");
        project = String(projectWrite?.values[0]?.[0] ?? project);
        revision = Number(revisionWrite?.values[0]?.[0] ?? revision);
        return json({});
      }
      throw new Error(`Unhandled test URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const firstManager = updateTaskInSheet(
      prefs,
      session,
      { taskId: "task_1", expectedRevision: 7 },
      { ...draft, project: "First manager" }
    );
    await expect(firstManager).resolves.toBeUndefined();

    await expect(
      updateTaskInSheet(
        prefs,
        session,
        { taskId: "task_1", expectedRevision: 7 },
        { ...draft, project: "Second manager" }
      )
    ).rejects.toMatchObject({
      code: "conflict",
      context: { expectedRevision: 7, currentRevision: 8 }
    });

    expect(writes).toHaveLength(1);
    expect(writes[0].data).toEqual([
      { range: "'Tasks'!B2", values: [["First manager"]] },
      { range: "'Tasks'!E2", values: [[8]] }
    ]);
    expect(JSON.stringify(writes)).not.toContain("'Tasks'!C2");
    expect(JSON.stringify(writes)).not.toContain("'Tasks'!D2");
  });
});

describe("task metadata backfill", () => {
  it("adds and backfills Task ID and Task Revision without whole-row writes", async () => {
    const writes: Array<{ url: string; body: unknown }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = decodeURIComponent(String(input));
      if (url.includes("'Tasks'!1:1")) {
        return json({ values: [["Project", "Custom Formula"]] });
      }
      if (init?.method === "PUT") {
        writes.push({ url, body: JSON.parse(String(init.body)) });
        return json({});
      }
      if (url.includes("'Tasks'!A1:D")) {
        return json({
          values: [
            ["Project", "Custom Formula", "Task ID", "Task Revision"],
            ["Atlas", "=ROW()", "", ""]
          ]
        });
      }
      if (url.endsWith("/values:batchUpdate") && init?.method === "POST") {
        writes.push({ url, body: JSON.parse(String(init.body)) });
        return json({});
      }
      throw new Error(`Unhandled test URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(backfillTaskIdsInSheet(prefs, session)).resolves.toBe(1);

    expect(writes.slice(0, 2).map((write) => write.body)).toEqual([
      { values: [["Task ID"]] },
      { values: [["Task Revision"]] }
    ]);
    const backfill = writes[2]?.body as {
      data: Array<{ range: string; values: unknown[][] }>;
    };
    expect(backfill.data).toEqual([
      {
        range: expect.stringMatching(/'Tasks'!C2/),
        values: [[expect.stringMatching(/^task_/)]]
      },
      { range: "'Tasks'!D2", values: [[1]] }
    ]);
    expect(JSON.stringify(backfill)).not.toContain("'Tasks'!A2");
    expect(JSON.stringify(backfill)).not.toContain("'Tasks'!B2");
  });
});

describe("identity-safe task creation", () => {
  const mappedPrefs: EmployeeSheetPrefs = {
    taskLogUrl: "task-sheet",
    activeSheetName: "Tasks",
    columnMap: {
      project: { mode: "existing", header: "Lab Program" },
      status: { mode: "existing", header: "State" }
    },
    strictColumnMap: true
  };

  it("reserves by Task ID and writes only mapped cells, preserving formula and custom columns", async () => {
    let reservedTaskId = "";
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = decodeURIComponent(String(input));
      if (url.includes("'Tasks'!1:1")) {
        return json({
          values: [[
            "Task ID",
            "Lab Program",
            "Formula",
            "State",
            "Custom Notes",
            "Task Revision"
          ]]
        });
      }
      if (url.includes("'Tasks'!A1:F")) {
        return json({
          values: [
            [
              "Task ID",
              "Lab Program",
              "Formula",
              "State",
              "Custom Notes",
              "Task Revision"
            ],
            ["task_existing", "Existing", "=ROW()", "Planned", "keep", "3"]
          ]
        });
      }
      if (url.includes(":append") && init?.method === "POST") {
        reservedTaskId = JSON.parse(String(init.body)).values[0][0];
        return json({ updates: { updatedRange: "'Tasks'!A3" } });
      }
      if (url.includes("'Tasks'!A2:A")) {
        return json({ values: [["task_existing"], [reservedTaskId]] });
      }
      if (url.includes("'Tasks'!A3")) {
        return json({ values: [[reservedTaskId]] });
      }
      if (url.endsWith("/values:batchUpdate") && init?.method === "POST") {
        return json({});
      }
      throw new Error(`Unhandled test URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const taskId = await createTaskInSheet(mappedPrefs, session, draft);

    expect(taskId).toBe(reservedTaskId);
    const append = fetchMock.mock.calls.find(([url]) =>
      String(url).includes(":append")
    );
    expect(JSON.parse(String(append?.[1]?.body))).toEqual({
      values: [[taskId]]
    });
    const populate = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith("/values:batchUpdate")
    );
    expect(JSON.parse(String(populate?.[1]?.body))).toEqual({
      valueInputOption: "USER_ENTERED",
      data: [
        { range: "'Tasks'!B3", values: [["Atlas"]] },
        { range: "'Tasks'!D3", values: [["In Progress"]] },
        { range: "'Tasks'!F3", values: [[1]] }
      ]
    });
  });

  it("allocates distinct rows for concurrent creates and populates by immutable ID", async () => {
    const reservedIds: string[] = [];
    const writes: Array<{ valueInputOption: string; data: Array<{ range: string }> }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = decodeURIComponent(String(input));
      if (url.includes("'Tasks'!1:1")) {
        return json({
          values: [["Task ID", "Lab Program", "State", "Task Revision"]]
        });
      }
      if (url.includes("'Tasks'!A1:D")) {
        return json({
          values: [
            ["Task ID", "Lab Program", "State", "Task Revision"],
            ["task_existing", "Existing", "Planned", "2"]
          ]
        });
      }
      if (url.includes(":append") && init?.method === "POST") {
        const taskId = JSON.parse(String(init.body)).values[0][0] as string;
        reservedIds.push(taskId);
        return json({
          updates: { updatedRange: `'Tasks'!A${reservedIds.length + 2}` }
        });
      }
      if (url.includes("'Tasks'!A2:A")) {
        return json({
          values: [["task_existing"], ...reservedIds.map((taskId) => [taskId])]
        });
      }
      const singleCell = url.match(/'Tasks'!A(\d+)$/);
      if (singleCell) {
        const row = Number(singleCell[1]);
        return json({ values: [[reservedIds[row - 3]]] });
      }
      if (url.endsWith("/values:batchUpdate") && init?.method === "POST") {
        writes.push(JSON.parse(String(init.body)));
        return json({});
      }
      throw new Error(`Unhandled test URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const [firstId, secondId] = await Promise.all([
      createTaskInSheet(mappedPrefs, session, { ...draft, project: "First" }),
      createTaskInSheet(mappedPrefs, session, { ...draft, project: "Second" })
    ]);

    expect(firstId).not.toBe(secondId);
    expect(reservedIds).toHaveLength(2);
    expect(writes.flatMap((write) => write.data.map((cell) => cell.range))).toEqual(
      expect.arrayContaining([
        "'Tasks'!B3",
        "'Tasks'!C3",
        "'Tasks'!D3",
        "'Tasks'!B4",
        "'Tasks'!C4",
        "'Tasks'!D4"
      ])
    );
  });

  it("reports a conflict when Sheets does not confirm the reservation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = decodeURIComponent(String(input));
        if (url.includes("'Tasks'!1:1")) {
          return json({
            values: [["Task ID", "Lab Program", "State", "Task Revision"]]
          });
        }
        if (url.includes("'Tasks'!A1:D")) {
          return json({
            values: [["Task ID", "Lab Program", "State", "Task Revision"]]
          });
        }
        if (url.includes(":append")) return json({ updates: {} });
        throw new Error(`Unhandled test URL: ${url}`);
      })
    );

    await expect(
      createTaskInSheet(mappedPrefs, session, draft)
    ).rejects.toMatchObject({ code: "conflict" });
  });
});
