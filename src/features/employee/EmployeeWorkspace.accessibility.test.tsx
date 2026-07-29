import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ExperimentRecord } from "../../domain/experiment";
import { EmployeeWorkspace } from "./EmployeeWorkspace";

const record: ExperimentRecord = {
  id: "task-1",
  rowNumber: 2,
  labMember: "Member",
  taskLogUrl: "https://docs.google.com/spreadsheets/d/member-file/edit",
  activeSheetName: "Tasks",
  project: "Project",
  experiment: "Accessible task",
  schematic: "Protocol",
  timeEstimate: "1h",
  startDateRaw: "2026-07-15",
  projectedEndDateRaw: "2026-07-16",
  status: "Planned",
  result: "",
  dataLink: "https://example.com/data",
  notebookLocation: "",
  comments: ""
};

function renderWorkspace(loading = false, experiments: ExperimentRecord[] = []) {
  return render(
    <EmployeeWorkspace
      session={{ email: "member@example.com", name: "Member", accessToken: "token" }}
      labMember="Member"
      prefs={{
        taskLogUrl: "https://docs.google.com/spreadsheets/d/member-file/edit",
        activeSheetName: "Tasks"
      }}
      experiments={experiments}
      saving={false}
      loading={loading}
      reconnecting={false}
      onCreate={vi.fn().mockResolvedValue(undefined)}
      onUpdate={vi.fn().mockResolvedValue(undefined)}
      onComplete={vi.fn().mockResolvedValue(undefined)}
      onResolveOverdue={vi.fn().mockResolvedValue(undefined)}
      onChangePrefs={vi.fn()}
      onReconnect={vi.fn()}
      onSignOut={vi.fn()}
      onRefresh={vi.fn()}
    />
  );
}

describe("Member workspace accessibility", () => {
  it("focuses the first invalid task field and restores the dialog trigger", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    const trigger = screen.getByRole("button", { name: "Create a new task" });

    await user.click(trigger);
    const task = screen.getByRole("textbox", { name: /Task.*required/ });
    task.focus();
    await user.click(screen.getByRole("button", { name: "Create task" }));

    const project = screen.getByRole("textbox", { name: /Project.*required/ });
    expect(project).toHaveFocus();
    expect(project).toHaveAttribute("aria-invalid", "true");
    expect(project).toHaveAccessibleDescription(/Project is required/);

    await user.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("marks stale task content busy and disables affected mutations", () => {
    renderWorkspace(true, [record]);

    expect(screen.getByLabelText("Tasks")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Create a new task" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Edit" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Complete" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Refreshing…" })).toBeDisabled();
  });

  it("links completion errors to the actual first invalid field", async () => {
    const user = userEvent.setup();
    renderWorkspace(false, [record]);

    await user.click(screen.getByRole("button", { name: "Complete" }));
    await user.click(screen.getByRole("button", { name: "Mark complete" }));

    const result = screen.getByRole("textbox", { name: /Result summary/ });
    expect(result).toHaveFocus();
    expect(result).toHaveAttribute("aria-invalid", "true");
    expect(result).toHaveAccessibleDescription("Result summary is required.");
    expect(screen.getByRole("alert", { name: "Task could not be completed" })).toHaveTextContent(
      "Result, link to data, and schematic are required"
    );
  });
});
