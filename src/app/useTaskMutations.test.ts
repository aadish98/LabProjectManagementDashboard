import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExperimentDraft, ExperimentRecord } from "../domain/experiment";
import { SheetRevisionConflictError } from "../services/sheets/errors";
import { useTaskMutations } from "./useTaskMutations";

const sheets = vi.hoisted(() => ({
  backfillTaskIdsInSheet: vi.fn(),
  completeTaskInSheet: vi.fn(),
  createTaskInSheet: vi.fn(),
  loadEmployeeDataset: vi.fn(),
  loadGoogleSheetsDataset: vi.fn(),
  resolveOverdueTaskInSheet: vi.fn(),
  updateTaskInSheet: vi.fn()
}));

vi.mock("../services/sheets/dataset", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/sheets/dataset")>()),
  loadGoogleSheetsDataset: sheets.loadGoogleSheetsDataset
}));
vi.mock("../services/sheets/taskLog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/sheets/taskLog")>()),
  backfillTaskIdsInSheet: sheets.backfillTaskIdsInSheet,
  completeTaskInSheet: sheets.completeTaskInSheet,
  createTaskInSheet: sheets.createTaskInSheet,
  loadEmployeeDataset: sheets.loadEmployeeDataset,
  resolveOverdueTaskInSheet: sheets.resolveOverdueTaskInSheet,
  updateTaskInSheet: sheets.updateTaskInSheet
}));

const session = {
  email: "manager@example.com",
  name: "Manager",
  accessToken: "token",
  idToken: "id-token"
};
const entry = {
  memberId: "member-ada",
  labMember: "Ada",
  taskLogUrl: "https://docs.google.com/spreadsheets/d/mirror-sheet/edit",
  activeSheetName: "Mirror Tasks",
  active: true
};
const authoritativePrefs = {
  taskLogUrl: "https://docs.google.com/spreadsheets/d/backend-sheet/edit",
  activeSheetName: "Accepted Tasks",
  columnMap: {
    project: { mode: "existing" as const, header: "Accepted Project" }
  },
  strictColumnMap: true
};
const draft: ExperimentDraft = {
  labMember: "Ada",
  taskLogUrl: entry.taskLogUrl,
  activeSheetName: entry.activeSheetName,
  project: "Atlas",
  experiment: "Trial",
  schematic: "",
  timeEstimate: "2 days",
  startDateRaw: "2026-07-14",
  projectedEndDateRaw: "2026-07-16",
  status: "Planned",
  result: "",
  dataLink: "",
  notebookLocation: "",
  comments: "Initial"
};
const emptyDataset = {
  source: "googleSheets" as const,
  registry: [entry],
  experiments: [],
  runLog: [],
  feedbackThreads: [],
  roleDirectory: [],
  lastSyncedAt: "2026-07-14T12:00:00.000Z"
};

function renderMutations(setStatus = vi.fn()) {
  const resolveMemberTaskPrefs = vi.fn().mockResolvedValue(authoritativePrefs);
  const setDataset = vi.fn();
  const hook = renderHook(() =>
    useTaskMutations({
      session,
      employeePrefs: null,
      employeeLabMember: "",
      managerRole: "manager",
      activeLabId: "lab-1",
      managerOwnEntry: entry,
      loadAuthoritativeManagerMembers: vi.fn().mockResolvedValue([]),
      resolveMemberTaskPrefs,
      withFreshSession: async (operation) => operation(session),
      requireFreshGoogleSignIn: vi.fn(),
      setDataset,
      setDatasetScope: vi.fn(),
      setManagerFileAccessIssue: vi.fn(),
      setStatus
    })
  );
  return { ...hook, resolveMemberTaskPrefs, setDataset, setStatus };
}

beforeEach(() => {
  vi.clearAllMocks();
  sheets.createTaskInSheet.mockResolvedValue("task-created");
  sheets.updateTaskInSheet.mockResolvedValue(undefined);
  sheets.loadGoogleSheetsDataset.mockResolvedValue(emptyDataset);
});

describe("manager task mutation integration", () => {
  it("uses the backend-accepted mapping without touching the Admin workbook", async () => {
    const { result, resolveMemberTaskPrefs } = renderMutations();

    await act(async () => {
      await result.current.handleManagerCreateTask(entry, draft);
    });

    expect(resolveMemberTaskPrefs).toHaveBeenCalledWith("member-ada", session);
    expect(sheets.createTaskInSheet).toHaveBeenCalledWith(
      authoritativePrefs,
      session,
      draft
    );
  });

  it("updates by stable Task ID", async () => {
    const previous: ExperimentRecord = {
      ...draft,
      id: "task-1",
      taskId: "task-1",
      taskRevision: 4,
      memberId: "member-ada",
      rowNumber: 2
    };
    const next = { ...draft, status: "In Progress", comments: "Started" };
    const { result } = renderMutations();

    await act(async () => {
      await result.current.handleManagerUpdateTask(previous, next);
    });

    expect(sheets.updateTaskInSheet).toHaveBeenCalledWith(
      authoritativePrefs,
      session,
      { taskId: "task-1", expectedRevision: 4 },
      next
    );
  });

  it("backfills and forces reopen without selecting a sorted record by the old row", async () => {
    const legacy: ExperimentRecord = {
      ...draft,
      id: "legacy:member-ada:Accepted Tasks:2",
      memberId: "member-ada",
      rowNumber: 2
    };
    sheets.loadGoogleSheetsDataset.mockResolvedValueOnce({
      ...emptyDataset,
      experiments: [
        {
          ...legacy,
          id: "task-migrated",
          taskId: "task-migrated",
          rowNumber: 8
        }
      ]
    });
    const { result } = renderMutations();

    await expect(
      act(async () => {
        await result.current.handleManagerUpdateTask(legacy, {
          ...draft,
          status: "In Progress"
        });
      })
    ).rejects.toThrow(/backfilled.*reopen.*immutable Task ID/i);

    expect(sheets.backfillTaskIdsInSheet).toHaveBeenCalledWith(
      authoritativePrefs,
      session
    );
    expect(sheets.updateTaskInSheet).not.toHaveBeenCalled();
  });

  it("refreshes latest data and preserves the draft path on conflict", async () => {
    const previous: ExperimentRecord = {
      ...draft,
      id: "task-1",
      taskId: "task-1",
      taskRevision: 4,
      memberId: "member-ada",
      rowNumber: 2
    };
    const latest = {
      ...previous,
      project: "Updated by manager one",
      taskRevision: 5
    };
    sheets.updateTaskInSheet.mockRejectedValueOnce(
      new SheetRevisionConflictError("stale", {
        taskId: "task-1",
        expectedRevision: 4,
        currentRevision: 5
      })
    );
    sheets.loadGoogleSheetsDataset.mockResolvedValueOnce({
      ...emptyDataset,
      experiments: [latest]
    });
    const setStatus = vi.fn();
    const { result, setDataset } = renderMutations(setStatus);

    await expect(
      act(async () => {
        await result.current.handleManagerUpdateTask(previous, {
          ...draft,
          project: "Manager two draft"
        });
      })
    ).rejects.toThrow(/latest data was refreshed.*draft is still open.*compare.*retry/i);

    expect(setDataset).toHaveBeenCalledWith(
      expect.objectContaining({ experiments: [latest] })
    );
    expect(setStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "error",
        errorCode: "conflict",
        httpStatus: 409
      })
    );
  });

});
