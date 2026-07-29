import { describe, expect, it } from "vitest";
import {
  columnLetter,
  encodeSheetRange,
  extractIdFromUrl,
  resolveTaskFieldIndices
} from "./helpers";

describe("Google Sheets identifiers and ranges", () => {
  it("extracts spreadsheet IDs while preserving raw IDs", () => {
    expect(
      extractIdFromUrl(
        "https://docs.google.com/spreadsheets/d/sheet-123_ab/edit#gid=0"
      )
    ).toBe("sheet-123_ab");
    expect(extractIdFromUrl(" raw-sheet-id ")).toBe("raw-sheet-id");
  });

  it("quotes apostrophes and encodes A1 ranges", () => {
    expect(decodeURIComponent(encodeSheetRange("Today's Work", "A1:C9")))
      .toBe("'Today''s Work'!A1:C9");
  });

  it("converts one-based column numbers to letters", () => {
    expect([1, 26, 27, 52, 53, 702].map(columnLetter)).toEqual([
      "A",
      "Z",
      "AA",
      "AZ",
      "BA",
      "ZZ"
    ]);
  });
});

describe("task field resolution", () => {
  it("prefers an explicit column map and falls back to aliases", () => {
    const headers = [
      "Experiment",
      "Custom Project",
      "End Date",
      "Analysis Pipeline Schema"
    ];

    expect(
      resolveTaskFieldIndices(headers, {
        project: { mode: "existing", header: "Custom Project" }
      })
    ).toMatchObject({
      experiment: 0,
      project: 1,
      projectedEndDate: 2,
      schematic: 3
    });
  });
});
