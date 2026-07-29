import { describe, expect, it } from "vitest";
import type { ExperimentDraft, SheetRegistryEntry } from "../../domain/experiment";
import {
  blankTaskDraft,
  CREATE_REQUIRED_FIELDS,
  getCreateTaskValidationError,
  getInitialAssigneeId,
  getMissingCreateTaskFields,
  resolveAssigneeContext,
  TASK_FORM_PERMISSION_RULES,
  TASK_STATUS_OPTIONS,
  taskDraftFromRecord
} from "./taskFormFields";

const registry: SheetRegistryEntry[] = [
  {
    memberId: "member-alice",
    labMember: "Alice",
    taskLogUrl: "https://docs.google.com/spreadsheets/d/alice/edit",
    activeSheetName: "Tasks",
    active: true
  },
  {
    memberId: "member-bob",
    labMember: "Bob",
    taskLogUrl: "https://docs.google.com/spreadsheets/d/bob/edit",
    activeSheetName: "Current",
    active: true
  }
];

function validDraft(): ExperimentDraft {
  return {
    ...blankTaskDraft("Alice", registry[0]),
    project: "Project",
    experiment: "Experiment",
    timeEstimate: "4h",
    startDateRaw: "2026-07-14",
    projectedEndDateRaw: "2026-07-15",
    schematic: "Protocol",
    dataLink: "https://example.com/data"
  };
}

describe("shared task form validation", () => {
  it("reports all create-time fields in form order", () => {
    expect(getMissingCreateTaskFields(blankTaskDraft("Alice", registry[0]))).toEqual([
      "Project",
      "Task",
      "Time estimate",
      "Start date",
      "Projected end date",
      "Schematic",
      "Link to data"
    ]);
  });

  it("trims values when deciding whether required fields are present", () => {
    const draft = validDraft();
    draft.project = "   ";

    expect(getCreateTaskValidationError(draft)).toBe("Please fill in: Project.");
    expect(getCreateTaskValidationError(validDraft())).toBe("");
  });

  it("uses one ordered schema and explicit create/edit permissions for both roles", () => {
    expect(CREATE_REQUIRED_FIELDS.map(({ key }) => key)).toEqual([
      "project",
      "experiment",
      "timeEstimate",
      "startDateRaw",
      "projectedEndDateRaw",
      "schematic",
      "dataLink"
    ]);
    expect(TASK_FORM_PERMISSION_RULES.member.statusOptions).toBe(TASK_STATUS_OPTIONS);
    expect(TASK_FORM_PERMISSION_RULES.managerEdit.statusOptions).toBe(TASK_STATUS_OPTIONS);
    expect(TASK_FORM_PERMISSION_RULES.managerCreate.statusOptions).not.toContain("Complete");
    expect(TASK_FORM_PERMISSION_RULES.managerCreate.showCompletionFields).toBe(false);
    expect(TASK_FORM_PERMISSION_RULES.managerEdit.showCompletionFields).toBe(true);
  });

  it("maps every editable task field into the shared edit draft", () => {
    const draft = validDraft();
    draft.rowNumber = 8;
    draft.status = "Complete";
    draft.result = "Result";
    draft.notebookLocation = "Notebook 2";
    draft.comments = "Comment";

    expect(taskDraftFromRecord({ ...draft, id: "task-8" })).toMatchObject(draft);
  });
});

describe("manager assignee context", () => {
  it("does not infer the first registry entry without an explicit assignee", () => {
    expect(getInitialAssigneeId(registry)).toBe("");
    expect(resolveAssigneeContext(registry, "")).toBeUndefined();
  });

  it("accepts only an explicitly requested registry member", () => {
    expect(getInitialAssigneeId(registry, "member-bob")).toBe("member-bob");
    expect(resolveAssigneeContext(registry, "member-bob")).toEqual(registry[1]);
    expect(getInitialAssigneeId(registry, "Unknown")).toBe("");
    expect(resolveAssigneeContext(registry, "Unknown")).toBeUndefined();
  });
});
