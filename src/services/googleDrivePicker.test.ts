import { describe, expect, it } from "vitest";
import { pickerSearchQuery } from "./googleDrivePicker";

describe("Drive Picker search hints", () => {
  it("uses human-readable workbook titles", () => {
    expect(pickerSearchQuery("Alice Task Log")).toBe("Alice Task Log");
  });

  it("never sends a saved workbook URL as a text search query", () => {
    expect(
      pickerSearchQuery("https://docs.google.com/spreadsheets/d/task-log/edit")
    ).toBe("");
  });
});
