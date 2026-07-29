import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import type { DashboardDataset, ExperimentRecord } from "../../domain/experiment";
import {
  getManagerLastRunKey,
  getManagerSnapshotKey,
  type ManagerSnapshot
} from "../../services/cache";
import { ManagerWorkspace } from "./ManagerWorkspace";

const registry = [
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
    activeSheetName: "Tasks",
    active: true
  }
];

function makeDataset(experiments: ExperimentRecord[] = []): DashboardDataset {
  return {
    source: "googleSheets",
    registry,
    experiments,
    runLog: [],
    feedbackThreads: [],
    roleDirectory: [],
    lastSyncedAt: "2026-07-14T12:00:00.000Z"
  };
}

function makeRecord(id: string, experiment: string): ExperimentRecord {
  return {
    id,
    taskId: id,
    memberId: "member-alice",
    rowNumber: 2,
    labMember: "Alice",
    taskLogUrl: registry[0].taskLogUrl,
    activeSheetName: "Tasks",
    project: "Project",
    experiment,
    schematic: "Protocol",
    timeEstimate: "1h",
    startDateRaw: "2026-07-14",
    projectedEndDateRaw: "2026-07-15",
    status: "Planned",
    result: "",
    dataLink: "https://example.com/data",
    notebookLocation: "",
    comments: ""
  };
}

function renderWorkspace(
  overrides: Partial<ComponentProps<typeof ManagerWorkspace>> = {}
) {
  const props: ComponentProps<typeof ManagerWorkspace> = {
    session: { email: "manager@example.com", name: "Manager", accessToken: "token" },
    viewerRole: "manager",
    config: {
      adminSpreadsheetId: "https://docs.google.com/spreadsheets/d/admin-sheet/edit",
      googleClientId: "client",
      googleApiKey: "key",
      googleAppId: "app"
    },
    dataset: makeDataset(),
    visibleLabMembers: ["Alice", "Bob"],
    managerOwnLabMember: null,
    managerOwnPrefs: null,
    managerOwnExperiments: [],
    saving: false,
    refreshing: false,
    onRefresh: vi.fn().mockResolvedValue(makeDataset()),
    onReconnect: vi.fn(),
    onSignOut: vi.fn(),
    onOpenSetup: vi.fn(),
    memberRecoveryBusyKey: null,
    onGrantMemberAccess: vi.fn(),
    onRetryMember: vi.fn(),
    onDeactivateMember: vi.fn(),
    onCreateTask: vi.fn().mockResolvedValue(undefined),
    onUpdateTask: vi.fn().mockResolvedValue(undefined),
    onCreateOwnTask: vi.fn().mockResolvedValue(undefined),
    onUpdateOwnTask: vi.fn().mockResolvedValue(undefined),
    onCompleteOwnTask: vi.fn().mockResolvedValue(undefined),
    onResolveOwnOverdue: vi.fn().mockResolvedValue(undefined),
    reconnecting: false,
    ...overrides
  };
  return render(<ManagerWorkspace {...props} />);
}

describe("ManagerWorkspace", () => {
  it("uses Team setup copy and reserves space while manager actions are visible", async () => {
    const user = userEvent.setup();
    const { container } = renderWorkspace();

    expect(screen.getByRole("button", { name: "Team setup" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Lab setup" })).not.toBeInTheDocument();
    expect(container.querySelector(".manager-shell")).toHaveClass(
      "manager-shell--with-actions"
    );

    await user.click(screen.getByRole("radio", { name: "Personal tasks" }));

    expect(container.querySelector(".manager-shell")).not.toHaveClass(
      "manager-shell--with-actions"
    );
    expect(screen.queryByRole("button", { name: "Add task" })).not.toBeInTheDocument();
  });

  it("does not default a new task to the first registry member", async () => {
    const user = userEvent.setup();
    renderWorkspace();

    await user.click(screen.getByRole("button", { name: "Add task" }));

    expect(screen.getByRole("combobox", { name: "Assign to" })).toHaveValue("");
    expect(screen.getByRole("option", { name: "Choose Member" })).toBeInTheDocument();
    expect(screen.queryByText(/Choose employee/i)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "New task" })).toBeInTheDocument();
  });

  it("uses an explicitly selected and visible member as task context", async () => {
    const user = userEvent.setup();
    renderWorkspace();

    await user.click(screen.getByRole("tab", { name: "Alice" }));
    await user.click(screen.getByRole("button", { name: "Add task" }));

    expect(screen.getByRole("combobox", { name: "Assign to" })).toHaveValue("member-alice");
    expect(screen.getByRole("heading", { name: "New task for Alice" })).toBeInTheDocument();
  });

  it("supports keyboard tabs, explicit reordering, and discoverable Kanban editing", async () => {
    const user = userEvent.setup();
    renderWorkspace({ dataset: makeDataset([makeRecord("task-1", "Visible task")]) });

    const allMembers = screen.getByRole("tab", { name: "All members" });
    allMembers.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Alice" })).toHaveAttribute("aria-selected", "true");

    const reorder = screen.getByRole("button", { name: "Reorder member tabs" });
    reorder.focus();
    await user.keyboard("{Enter}");
    const moveAlice = screen.getByRole("button", { name: "Move Alice later" });
    moveAlice.focus();
    await user.keyboard("{Enter}");
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "All members",
      "Bob",
      "Alice"
    ]);
    expect(screen.getByText("Alice moved to position 3 of 3.")).toHaveAttribute(
      "aria-live",
      "polite"
    );

    await user.click(screen.getByRole("button", { name: "Edit task" }));
    expect(screen.getByRole("dialog", { name: "Edit task" })).toBeInTheDocument();
  });

  it("links task errors and focuses the first invalid field", async () => {
    const user = userEvent.setup();
    renderWorkspace();

    await user.click(screen.getByRole("button", { name: "Add task" }));
    await user.click(screen.getByRole("button", { name: "Add task" }));

    const assignee = screen.getByRole("combobox", { name: "Assign to" });
    expect(assignee).toHaveFocus();
    expect(
      screen.getByRole("alert", { name: "Task could not be saved" })
    ).toHaveTextContent("Choose a Member");

    await user.selectOptions(assignee, "member-alice");
    await user.click(screen.getByRole("button", { name: "Add task" }));

    const project = screen.getByRole("textbox", { name: /Project/ });
    expect(project).toHaveFocus();
    expect(
      screen.getByRole("alert", { name: "Task could not be saved" })
    ).toHaveTextContent("Project");
  });

  it("records a successful run from the refreshed dataset", async () => {
    const user = userEvent.setup();
    const refreshed = makeDataset([makeRecord("refreshed", "Refreshed task")]);
    renderWorkspace({
      dataset: makeDataset([makeRecord("stale", "Stale task")]),
      onRefresh: vi.fn().mockResolvedValue(refreshed)
    });

    await user.click(screen.getByRole("button", { name: /Run summary/ }));

    await waitFor(() =>
      expect(window.localStorage.getItem(getManagerLastRunKey("manager@example.com"))).not.toBeNull()
    );
    const snapshot = JSON.parse(
      window.localStorage.getItem(
        getManagerSnapshotKey("manager@example.com", "admin-sheet")
      ) as string
    ) as ManagerSnapshot;
    expect(snapshot.experiments.map((record) => record.id)).toEqual(["refreshed"]);
  });

  it("does not record a run when refresh fails", async () => {
    const user = userEvent.setup();
    renderWorkspace({ onRefresh: vi.fn().mockResolvedValue(null) });

    await user.click(screen.getByRole("button", { name: /Run summary/ }));

    expect(window.localStorage.getItem(getManagerLastRunKey("manager@example.com"))).toBeNull();
    expect(
      window.localStorage.getItem(getManagerSnapshotKey("manager@example.com", "admin-sheet"))
    ).toBeNull();
  });

  it("passes refresh and sync health into embedded Personal tasks", async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn().mockResolvedValue(makeDataset());
    renderWorkspace({
      dataset: {
        ...makeDataset(),
        cacheStaleReason: "A newer Member configuration is available."
      },
      managerOwnLabMember: "Manager",
      managerOwnPrefs: {
        taskLogUrl: "https://docs.google.com/spreadsheets/d/manager/edit",
        activeSheetName: "Tasks"
      },
      onRefresh
    });

    await user.click(screen.getByRole("radio", { name: "Personal tasks" }));

    expect(screen.getByText(/Showing last-known tasks/)).toHaveTextContent(
      "A newer Member configuration is available."
    );
    await user.click(screen.getByRole("button", { name: "Refresh personal tasks" }));
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it("keeps healthy data visible and provides inline recovery with confirmed deactivation", async () => {
    const user = userEvent.setup();
    const issue = {
      memberId: "member-bob",
      labMember: "Bob",
      taskLogUrl: registry[1].taskLogUrl,
      activeSheetName: "Tasks",
      code: "pickerGrant" as const,
      message: "Choose this spreadsheet from Google Drive.",
      status: 403
    };
    const onGrantMemberAccess = vi.fn();
    const onRetryMember = vi.fn();
    const onDeactivateMember = vi.fn().mockResolvedValue(undefined);
    renderWorkspace({
      dataset: {
        ...makeDataset([makeRecord("task-healthy", "Healthy task")]),
        memberLoadIssues: [issue]
      },
      onGrantMemberAccess,
      onRetryMember,
      onDeactivateMember
    });

    expect(screen.getByText("Healthy task")).toBeInTheDocument();
    const recovery = screen
      .getByText(/1 Task-log workbook could not be loaded/)
      .closest(".callout");
    expect(recovery).not.toBeNull();
    expect(
      within(recovery as HTMLElement).queryByRole("button", { name: /open team setup/i })
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Grant / verify exact file" }));
    await user.click(screen.getByRole("button", { name: "Retry member" }));

    expect(onGrantMemberAccess).toHaveBeenCalledWith(issue);
    expect(onRetryMember).toHaveBeenCalledWith(issue);

    await user.click(screen.getByRole("button", { name: "Deactivate member" }));
    expect(
      screen.getByRole("dialog", { name: "Deactivate Bob?" })
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onDeactivateMember).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Deactivate member" }));
    await user.click(screen.getByRole("button", { name: "Deactivate Member" }));
    expect(onDeactivateMember).toHaveBeenCalledWith(issue);
  });
});
