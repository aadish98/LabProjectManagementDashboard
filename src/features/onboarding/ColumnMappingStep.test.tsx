import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TASK_FIELDS } from "../../domain/app";
import { ColumnMappingStep } from "./ColumnMappingStep";
import {
  validateSelections,
  type ColumnSelections
} from "./columnMapping";

describe("ColumnMappingStep", () => {
  it("puts only ambiguous required fields in the primary review", () => {
    const selections = Object.fromEntries(
      TASK_FIELDS.map((field) => [
        field.key,
        field.required
          ? { kind: "existing" as const, header: field.defaultHeader }
          : { kind: "unmapped" as const }
      ])
    ) as ColumnSelections;
    delete selections.project;
    const headers = TASK_FIELDS.map((field) => field.defaultHeader);

    render(
      <ColumnMappingStep
        analysis={{
          spreadsheetId: "task-log",
          spreadsheetTitle: "Member Task Log",
          sheetId: 1,
          sheetTitle: "Tasks",
          headers,
          inferredMap: Object.fromEntries(
            TASK_FIELDS.filter((field) => field.required && field.key !== "project").map(
              (field) => [
                field.key,
                { mode: "existing" as const, header: field.defaultHeader }
              ]
            )
          ),
          unmappedFields: ["project", "comments", "notebookLocation"]
        }}
        activeSheetName="Tasks"
        analyzing={false}
        error=""
        selections={selections}
        validation={validateSelections(selections)}
        matchedCount={TASK_FIELDS.filter((field) => field.required).length - 1}
        willAddCount={0}
        validating={false}
        onSelectionChange={vi.fn()}
        onRetry={vi.fn()}
        onPickDifferentTab={vi.fn()}
      />
    );

    const coreReview = screen.getByText("Core fields").parentElement;
    expect(coreReview).not.toBeNull();
    expect(fieldLabels(coreReview as HTMLElement)).toEqual(["Project"]);
    expect(screen.queryByText("Notes & references")).not.toBeInTheDocument();

    const advanced = screen.getByText("Advanced mapping").closest("details");
    expect(advanced).not.toBeNull();
    expect(fieldLabels(advanced as HTMLElement)).toEqual(
      expect.arrayContaining(["Experiment", "Comments / Improvements"])
    );
  });
});

function fieldLabels(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll(".column-row__label strong")).map(
    (label) => label.textContent ?? ""
  );
}
