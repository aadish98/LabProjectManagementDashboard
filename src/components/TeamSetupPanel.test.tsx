import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TeamSetupPanel } from "./TeamSetupPanel";

const sheetsMocks = vi.hoisted(() => ({
  analyzeEmployeeSheetHeaders: vi.fn(),
  fetchSpreadsheetMetadata: vi.fn()
}));

const pickerMocks = vi.hoisted(() => ({
  openSpreadsheetPicker: vi.fn()
}));
const apiMocks = vi.hoisted(() => ({
  listMembers: vi.fn().mockResolvedValue({ members: [] }),
  listInvitations: vi.fn().mockResolvedValue({ invitations: [] }),
  getConfig: vi.fn(),
  createInvitation: vi.fn(),
  deactivateMember: vi.fn(),
  reactivateMember: vi.fn()
}));

vi.mock("../services/sheets/metadata", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/sheets/metadata")>()),
  analyzeEmployeeSheetHeaders: sheetsMocks.analyzeEmployeeSheetHeaders,
  fetchSpreadsheetMetadata: sheetsMocks.fetchSpreadsheetMetadata
}));
vi.mock("../services/googleDrivePicker", () => pickerMocks);
vi.mock("../services/onboardingApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/onboardingApi")>()),
  OnboardingApi: class {
    listMembers = apiMocks.listMembers;
    listInvitations = apiMocks.listInvitations;
    getConfig = apiMocks.getConfig;
    createInvitation = apiMocks.createInvitation;
    deactivateMember = apiMocks.deactivateMember;
    reactivateMember = apiMocks.reactivateMember;
  }
}));

describe("TeamSetupPanel", () => {
  beforeEach(() => {
    apiMocks.listMembers.mockResolvedValue({ members: [] });
    apiMocks.listInvitations.mockResolvedValue({ invitations: [] });
    pickerMocks.openSpreadsheetPicker.mockResolvedValue([
      {
        id: "task-log",
        name: "Alice task log",
        url: "https://docs.google.com/spreadsheets/d/task-log/edit"
      }
    ]);
    sheetsMocks.fetchSpreadsheetMetadata.mockResolvedValue({
      spreadsheetId: "task-log",
      spreadsheetTitle: "Alice task log",
      sheets: [
        { sheetId: 1, title: "Instructions" },
        { sheetId: 2, title: "Tasks" }
      ]
    });
    sheetsMocks.analyzeEmployeeSheetHeaders.mockResolvedValue({
      spreadsheetId: "task-log",
      spreadsheetTitle: "Alice task log",
      sheetId: 2,
      sheetTitle: "Tasks",
      headers: ["Project", "Experiment"],
      inferredMap: {
        project: { mode: "existing", header: "Project" },
        experiment: { mode: "existing", header: "Experiment" }
      },
      unmappedFields: ["timeEstimate", "startDate", "projectedEndDate", "status", "schematic", "result", "dataLink", "comments", "notebookLocation"]
    });
    apiMocks.createInvitation.mockImplementation(async (_labId, input) => ({
      invitation: {
        id: "invitation",
        labId: "lab",
        memberId: "saved-member",
        email: input.email,
        normalizedEmail: input.email,
        roles: input.roles,
        status: "pending",
        revision: 1,
        expiresAt: input.expiresAt,
        createdAt: "2026-01-01T00:00:00.000Z",
        createdBy: "manager",
        updatedAt: "2026-01-01T00:00:00.000Z"
      },
      member: {
        id: "saved-member",
        labId: "lab",
        email: input.email,
        normalizedEmail: input.email,
        displayName: input.displayName,
        roles: input.roles,
        active: true,
        revision: 1,
        onboarding: {
          status: "invited",
          owner: "member",
          reason: "Invitation created.",
          nextAction: "Accept invitation.",
          updatedAt: "2026-01-01T00:00:00.000Z"
        },
        createdAt: "2026-01-01T00:00:00.000Z",
        createdBy: "manager",
        updatedAt: "2026-01-01T00:00:00.000Z"
      },
      config: {
        memberId: "saved-member",
        labId: "lab",
        spreadsheetId: input.spreadsheetId,
        taskLogUrl: input.taskLogUrl,
        activeSheetName: input.activeSheetName,
        proposedColumnMap: input.proposedColumnMap,
        revision: 1,
        updatedAt: "2026-01-01T00:00:00.000Z",
        updatedBy: "manager"
      },
      replayed: false
    }));
  });

  it("requires an explicit active-tab choice after picking a workbook", async () => {
    const user = userEvent.setup();
    render(
      <TeamSetupPanel
        config={{
          googleClientId: "client",
          googleApiKey: "key",
          googleAppId: "app"
        }}
        session={{
          email: "manager@example.com",
          name: "Manager",
          accessToken: "token",
          idToken: "id-token"
        }}
        membership={{
          member: {
            id: "manager",
            labId: "lab",
            email: "manager@example.com",
            normalizedEmail: "manager@example.com",
            displayName: "Manager",
            roles: ["manager"],
            active: true,
            revision: 1,
            onboarding: {
              status: "ready",
              owner: "system",
              reason: "Ready",
              nextAction: "None",
              updatedAt: "2026-01-01T00:00:00.000Z"
            },
            createdAt: "2026-01-01T00:00:00.000Z",
            createdBy: "manager",
            updatedAt: "2026-01-01T00:00:00.000Z"
          },
          lab: {
            id: "lab",
            name: "Lab",
            revision: 1,
            createdAt: "2026-01-01T00:00:00.000Z",
            createdBy: "manager",
            updatedAt: "2026-01-01T00:00:00.000Z"
          },
          config: null
        }}
        onChange={vi.fn()}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );

    await screen.findByText("No members yet. Add a member invitation to configure access.");
    await user.click(screen.getByRole("button", { name: "Add invitation" }));
    await user.click(screen.getByRole("button", { name: "Choose" }));
    expect(pickerMocks.openSpreadsheetPicker).toHaveBeenCalledWith(
      expect.objectContaining({ query: "" })
    );

    const activeTab = await screen.findByRole("combobox", { name: /Active task tab/ });
    expect(activeTab).toHaveValue("");
    expect(screen.getByRole("option", { name: "Choose tab" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Instructions" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Tasks" })).toBeInTheDocument();
  });

  it("blocks saving an invitation with no explicit role", async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText("No members yet. Add a member invitation to configure access.");
    await user.click(screen.getByRole("button", { name: "Add invitation" }));

    expect(screen.getAllByText("Select at least one Access role.").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Fix first" })).toBeDisabled();
    expect(apiMocks.createInvitation).not.toHaveBeenCalled();
  });

  it("analyzes the explicit workbook tab and persists the proposed column map", async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText("No members yet. Add a member invitation to configure access.");
    await user.click(screen.getByRole("button", { name: "Add invitation" }));
    await user.type(screen.getByLabelText("Name"), "Alice");
    await user.type(screen.getByLabelText("Email"), "alice@example.com");
    await user.click(screen.getByRole("checkbox", { name: "Member" }));
    await user.click(screen.getByRole("button", { name: "Choose" }));
    await user.selectOptions(
      await screen.findByRole("combobox", { name: /Active task tab/ }),
      "Tasks"
    );
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(apiMocks.createInvitation).toHaveBeenCalledOnce());
    expect(sheetsMocks.analyzeEmployeeSheetHeaders).toHaveBeenCalledWith(
      {
        taskLogUrl: "https://docs.google.com/spreadsheets/d/task-log/edit",
        activeSheetName: "Tasks"
      },
      "token"
    );
    expect(apiMocks.createInvitation.mock.calls[0][1].proposedColumnMap).toMatchObject({
      project: { mode: "existing", header: "Project" },
      experiment: { mode: "existing", header: "Experiment" },
      status: { mode: "add", header: "Status" }
    });
  });

  it("reactivates a confirmed deactivation using the returned backend revision", async () => {
    const user = userEvent.setup();
    const member = {
      id: "member-ada",
      labId: "lab",
      email: "ada@example.com",
      normalizedEmail: "ada@example.com",
      displayName: "Ada",
      roles: ["employee" as const],
      active: true,
      revision: 4,
      onboarding: {
        status: "ready" as const,
        owner: "system" as const,
        reason: "Ready",
        nextAction: "None",
        updatedAt: "2026-01-01T00:00:00.000Z"
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      createdBy: "manager",
      updatedAt: "2026-01-01T00:00:00.000Z"
    };
    apiMocks.listMembers.mockResolvedValue({ members: [member] });
    apiMocks.getConfig.mockResolvedValue({
      config: {
        memberId: member.id,
        labId: "lab",
        spreadsheetId: "task-log",
        taskLogUrl: "https://docs.google.com/spreadsheets/d/task-log/edit",
        activeSheetName: "Tasks",
        proposedColumnMap: {},
        revision: 2,
        updatedAt: "2026-01-01T00:00:00.000Z",
        updatedBy: "manager"
      }
    });
    apiMocks.deactivateMember.mockResolvedValue({
      member: { ...member, active: false, revision: 5 }
    });
    apiMocks.reactivateMember.mockResolvedValue({
      member: { ...member, active: true, revision: 6 }
    });
    renderPanel();

    await user.click(await screen.findByRole("button", { name: "Deactivate Member" }));
    const dialog = screen.getByRole("dialog", { name: "Deactivate Ada?" });
    await user.click(within(dialog).getByRole("button", { name: "Deactivate Member" }));

    await user.click(await screen.findByRole("button", { name: "Undo member deactivation" }));

    expect(apiMocks.deactivateMember).toHaveBeenCalledWith(
      "lab",
      "member-ada",
      4,
      undefined
    );
    expect(apiMocks.reactivateMember).toHaveBeenCalledWith("lab", "member-ada", 5);
    expect(screen.getByRole("combobox", { name: "Member status" })).toHaveValue("true");
  });
});

function renderPanel() {
  return render(
    <TeamSetupPanel
      config={{
        googleClientId: "client",
        googleApiKey: "key",
        googleAppId: "app"
      }}
      session={{
        email: "manager@example.com",
        name: "Manager",
        accessToken: "token",
        idToken: "id-token"
      }}
      membership={{
        member: {
          id: "manager",
          labId: "lab",
          email: "manager@example.com",
          normalizedEmail: "manager@example.com",
          displayName: "Manager",
          roles: ["manager"],
          active: true,
          revision: 1,
          onboarding: {
            status: "ready",
            owner: "system",
            reason: "Ready",
            nextAction: "None",
            updatedAt: "2026-01-01T00:00:00.000Z"
          },
          createdAt: "2026-01-01T00:00:00.000Z",
          createdBy: "manager",
          updatedAt: "2026-01-01T00:00:00.000Z"
        },
        lab: {
          id: "lab",
          name: "Lab",
          revision: 1,
          createdAt: "2026-01-01T00:00:00.000Z",
          createdBy: "manager",
          updatedAt: "2026-01-01T00:00:00.000Z"
        },
        config: null
      }}
      onChange={vi.fn()}
      onClose={vi.fn()}
      onSaved={vi.fn()}
    />
  );
}
