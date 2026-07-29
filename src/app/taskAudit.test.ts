import { describe, expect, it } from "vitest";
import type { ExperimentDraft, ExperimentRecord } from "../domain/experiment";
import {
  buildManagerAuditEntry,
  changedTaskFields,
  createdTaskFields
} from "./taskAudit";

const draft: ExperimentDraft = {
  labMember: "Ada",
  taskLogUrl: "https://docs.google.com/spreadsheets/d/task-sheet/edit",
  activeSheetName: "Tasks",
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

describe("manager mutation audit payloads", () => {
  it("records stable identity, destination, actor, and changed fields", () => {
    const previous: ExperimentRecord = {
      ...draft,
      id: "task_1",
      taskId: "task_1",
      status: "Planned"
    };
    const next = { ...draft, status: "In Progress", comments: "Started" };

    expect(changedTaskFields(previous, next)).toEqual(["status", "comments"]);
    expect(
      buildManagerAuditEntry({
        actorEmail: "MANAGER@example.com",
        destination: {
          memberId: "member_ada",
          labMember: "Ada",
          taskLogUrl: draft.taskLogUrl,
          activeSheetName: "Tasks"
        },
        taskId: "task_1",
        action: "task.updated",
        changedFields: changedTaskFields(previous, next),
        status: next.status,
        timestamp: "2026-07-14T18:00:00.000Z"
      })
    ).toEqual({
      timestamp: "2026-07-14T18:00:00.000Z",
      actorEmail: "MANAGER@example.com",
      memberId: "member_ada",
      taskId: "task_1",
      workbook: "task-sheet#Tasks",
      action: "task.updated",
      changedFields: ["status", "comments"],
      labMember: "Ada",
      taskLogUrl: draft.taskLogUrl,
      status: "In Progress",
      note: undefined
    });
  });

  it("includes every populated create field", () => {
    expect(createdTaskFields(draft)).toEqual([
      "project",
      "experiment",
      "timeEstimate",
      "startDateRaw",
      "projectedEndDateRaw",
      "status",
      "comments"
    ]);
  });
});
