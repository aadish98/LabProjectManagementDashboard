import { describe, expect, it } from "vitest";
import type { ExperimentDraft } from "../../domain/experiment";
import { profileRowsFromValues } from "./profile";
import {
  buildAppendedStruckCell,
  buildChangedTaskCellUpdates,
  buildRowValues,
  buildTaskIdBackfill,
  buildTaskMetadataBackfill,
  parseExperimentRows
} from "./taskLog";

const draft: ExperimentDraft = {
  labMember: "Ada",
  taskLogUrl: "sheet-id",
  activeSheetName: "Tasks",
  project: "Atlas",
  experiment: "Trial 7",
  schematic: "pipeline",
  timeEstimate: "2 days",
  startDateRaw: "2026-07-14",
  projectedEndDateRaw: "2026-07-16",
  status: "Planned",
  result: "",
  dataLink: "",
  notebookLocation: "NB-7",
  comments: "Ready"
};

describe("task and profile pure helpers", () => {
  it("keeps duplicate legacy aliases synchronized when building rows", () => {
    const headers = [
      "Project",
      "Projected End Date",
      "End Date",
      "Schematic",
      "Analysis Pipeline Schema"
    ];

    expect(buildRowValues(headers, draft)).toEqual([
      "Atlas",
      "2026-07-16",
      "2026-07-16",
      "pipeline",
      "pipeline"
    ]);
  });

  it("parses task rows with stable source row numbers", () => {
    const records = parseExperimentRows(
      {
        labMember: "Ada",
        taskLogUrl: "sheet-id",
        activeSheetName: "Tasks",
        active: true
      },
      [
        ["Project", "Experiment", "Status"],
        ["Atlas", "Trial 7", "Planned"],
        ["", "", ""]
      ]
    );

    expect(records).toMatchObject([
      {
        id: "legacy:Ada:Tasks:2",
        rowNumber: 2,
        project: "Atlas",
        experiment: "Trial 7",
        status: "Planned"
      }
    ]);
  });

  it("parses Task Revision metadata into modern records", () => {
    const records = parseExperimentRows(
      {
        labMember: "Ada",
        taskLogUrl: "sheet-id",
        activeSheetName: "Tasks",
        active: true
      },
      [
        ["Task ID", "Project", "Experiment", "Task Revision"],
        ["task_1", "Atlas", "Trial 7", "12"]
      ]
    );

    expect(records[0]).toMatchObject({
      id: "task_1",
      taskId: "task_1",
      taskRevision: 12
    });
  });

  it("builds rich text runs and profile key/value records", () => {
    expect(buildAppendedStruckCell("old", " new ")).toEqual({
      text: "old\nnew",
      runs: [
        { startIndex: 0, format: { strikethrough: true } },
        { startIndex: 4, format: { strikethrough: false } }
      ]
    });
    expect(
      profileRowsFromValues([
        ["Field", "Value"],
        ["Display Name", " Ada "],
        ["Profile Picture Data URL", "data:image/png;base64,abc"],
        ["Updated At", "2026-07-14T12:00:00.000Z"]
      ])
    ).toEqual({
      displayName: "Ada",
      profilePictureDataUrl: "data:image/png;base64,abc",
      updatedAt: "2026-07-14T12:00:00.000Z"
    });
  });

  it("updates only changed mapped cells and preserves formula/unmapped columns", () => {
    const updates = buildChangedTaskCellUpdates(
      ["Task ID", "Project", "Computed Score", "Status", "Owner Notes"],
      ["task_1", "Atlas", "42", "Planned", "keep me"],
      { ...draft, taskId: "task_1", status: "In Progress" }
    );

    expect(updates).toEqual([{ column: 3, value: "In Progress" }]);
  });

  it("plans immutable IDs only for populated legacy task rows", () => {
    expect(
      buildTaskIdBackfill(
        [
          ["Project", "Experiment", "Task ID"],
          ["Atlas", "Trial", ""],
          ["", "", ""],
          ["Other", "Run", "task_existing"]
        ],
        () => "task_new"
      )
    ).toEqual([{ rowNumber: 2, taskId: "task_new" }]);
  });

  it("uses the backend-accepted map when identifying legacy task rows", () => {
    expect(
      buildTaskIdBackfill(
        [
          ["Custom Project", "Task ID"],
          ["Atlas", ""]
        ],
        () => "task_mapped",
        {
          project: { mode: "existing", header: "Custom Project" }
        },
        true
      )
    ).toEqual([{ rowNumber: 2, taskId: "task_mapped" }]);
  });

  it("backfills Task ID and revision only for populated legacy rows", () => {
    expect(
      buildTaskMetadataBackfill(
        [
          ["Project", "Task ID", "Task Revision"],
          ["Atlas", "", ""],
          ["Existing", "task_existing", ""],
          ["", "", ""]
        ],
        () => "task_new"
      )
    ).toEqual([
      { rowNumber: 2, taskId: "task_new", taskRevision: 1 },
      { rowNumber: 3, taskRevision: 1 }
    ]);
  });
});
