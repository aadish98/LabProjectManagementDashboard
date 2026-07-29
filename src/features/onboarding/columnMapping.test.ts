import { describe, expect, it } from "vitest";
import { TASK_FIELDS, type TaskFieldKey } from "../../domain/app";
import type { SheetHeaderAnalysis } from "../../services/sheets/metadata";
import {
  buildHeaderInsertions,
  buildProposedColumnMap,
  deriveDefaultSelections,
  keepExplicitTabSelection,
  promoteAddedSelections,
  validateSelections,
  type ColumnSelections
} from "./columnMapping";

function completeSelections(): ColumnSelections {
  return Object.fromEntries(
    TASK_FIELDS.map((field) => [
      field.key,
      { kind: "existing" as const, header: field.defaultHeader }
    ])
  ) as ColumnSelections;
}

describe("column mapping state", () => {
  it("does not select the first workbook tab implicitly", () => {
    const sheets = [{ title: "Instructions" }, { title: "Tasks" }];

    expect(keepExplicitTabSelection("", sheets)).toBe("");
    expect(keepExplicitTabSelection("Missing", sheets)).toBe("");
    expect(keepExplicitTabSelection("tasks", sheets)).toBe("tasks");
  });

  it("detects missing fields and normalized duplicate headers", () => {
    const selections = completeSelections();
    delete selections.result;
    selections.project = { kind: "existing", header: "Task Status" };
    selections.status = { kind: "existing", header: "task-status" };

    const validation = validateSelections(selections);

    expect(validation.missingFields).toContain("result");
    expect(validation.duplicates.get("taskstatus")).toEqual(["project", "status"]);
  });

  it("allows optional fields to remain explicitly unmapped", () => {
    const selections = completeSelections();
    selections.comments = { kind: "unmapped" };
    selections.notebookLocation = { kind: "unmapped" };

    expect(validateSelections(selections).missingFields).toEqual([]);
    expect(buildHeaderInsertions(selections)).toEqual([]);
  });

  it("prefers a valid stored mapping, then inferred mappings", () => {
    const analysis: SheetHeaderAnalysis = {
      spreadsheetId: "sheet",
      spreadsheetTitle: "Tasks",
      sheetId: 1,
      sheetTitle: "Active",
      headers: ["Project Name", "Experiment"],
      inferredMap: {
        project: { mode: "existing", header: "Project Name" },
        experiment: { mode: "existing", header: "Experiment" }
      },
      unmappedFields: TASK_FIELDS.slice(2).map((field) => field.key)
    };

    const selections = deriveDefaultSelections(analysis, {
      project: { mode: "existing", header: "Project Name" }
    });

    expect(selections.project).toEqual({ kind: "existing", header: "Project Name" });
    expect(selections.experiment).toEqual({ kind: "existing", header: "Experiment" });
  });

  it("turns analysis into a useful shared proposal for missing required fields", () => {
    const analysis: SheetHeaderAnalysis = {
      spreadsheetId: "sheet",
      spreadsheetTitle: "Tasks",
      sheetId: 1,
      sheetTitle: "Active",
      headers: ["Project"],
      inferredMap: {
        project: { mode: "existing", header: "Project" }
      },
      unmappedFields: TASK_FIELDS.slice(1).map((field) => field.key)
    };

    const proposed = buildProposedColumnMap(analysis);

    expect(proposed.project).toEqual({ mode: "existing", header: "Project" });
    expect(proposed.experiment).toEqual({ mode: "add", header: "Experiment" });
    expect(proposed.comments).toBeUndefined();
  });

  it("promotes successful insertions and preserves requested placement", () => {
    const selections: ColumnSelections = {
      result: { kind: "add", afterHeader: "Status" },
      comments: { kind: "add", afterHeader: null }
    };
    const promoted = promoteAddedSelections(selections, ["Result"]);
    const insertions = buildHeaderInsertions(selections);

    expect(promoted.result).toEqual({ kind: "existing", header: "Result" });
    expect(promoted.comments).toEqual({ kind: "add", afterHeader: null });
    expect(insertions).toEqual([
      {
        field: "result" as TaskFieldKey,
        header: "Result",
        position: { mode: "after", afterHeader: "Status" }
      },
      {
        field: "comments" as TaskFieldKey,
        header: "Comments/ Improvements",
        position: { mode: "end" }
      }
    ]);
  });
});
