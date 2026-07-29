import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ExperimentRecord } from "../../domain/experiment";
import { GanttView } from "./GanttView";

function isoDate(offsetDays: number) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

const record: ExperimentRecord = {
  id: "scheduled-task",
  rowNumber: 2,
  labMember: "Ada",
  taskLogUrl: "https://docs.google.com/spreadsheets/d/task-log/edit",
  activeSheetName: "Tasks",
  project: "Accessibility",
  experiment: "Keyboard timeline",
  schematic: "Protocol",
  timeEstimate: "2h",
  startDateRaw: isoDate(0),
  projectedEndDateRaw: isoDate(2),
  status: "In Progress",
  result: "",
  dataLink: "",
  notebookLocation: "",
  comments: ""
};

describe("Gantt accessibility", () => {
  it("provides a schedule table and keyboard-pannable timeline", async () => {
    const user = userEvent.setup();
    const scrollBy = vi.fn();
    const scrollTo = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollBy", {
      configurable: true,
      value: scrollBy
    });
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: scrollTo
    });

    render(
      <GanttView mode="employee" experiments={[record]} labMembers={["Ada"]} />
    );

    expect(screen.getByRole("table", { name: /Scheduled tasks/ })).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /Ada Keyboard timeline/ })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Task schedule table" })).toHaveAttribute(
      "tabindex",
      "0"
    );

    const timeline = screen.getByRole("region", { name: "Focusable task timeline" });
    timeline.focus();
    await user.keyboard("{ArrowRight}");
    expect(scrollBy).toHaveBeenCalledWith({ left: 80, behavior: "auto" });
    await user.keyboard("{Shift>}{ArrowLeft}{/Shift}{End}{Home}");
    expect(scrollBy).toHaveBeenCalledWith({ left: -320, behavior: "auto" });
    expect(scrollTo).toHaveBeenCalledTimes(2);
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 0, behavior: "auto" });
  });
});
