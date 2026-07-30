import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Membership } from "../../domain/onboarding";
import { EmployeeConnectFlow } from "./EmployeeSetupGate";

const sheetsMocks = vi.hoisted(() => ({
  fetchSpreadsheetMetadata: vi.fn(),
  readEmployeeProfile: vi.fn(),
  writeEmployeeProfile: vi.fn(),
  analyzeEmployeeSheetHeaders: vi.fn(),
  insertHeadersInSheet: vi.fn()
}));
const pickerMocks = vi.hoisted(() => ({
  openSpreadsheetPicker: vi.fn()
}));
const apiMocks = vi.hoisted(() => ({
  acceptInvitation: vi.fn(),
  getMemberships: vi.fn(),
  recordPickerProof: vi.fn(),
  updateConfig: vi.fn()
}));

vi.mock("../../services/sheets/metadata", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../services/sheets/metadata")>()),
  fetchSpreadsheetMetadata: sheetsMocks.fetchSpreadsheetMetadata,
  analyzeEmployeeSheetHeaders: sheetsMocks.analyzeEmployeeSheetHeaders,
  insertHeadersInSheet: sheetsMocks.insertHeadersInSheet
}));
vi.mock("../../services/sheets/profile", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../services/sheets/profile")>()),
  readEmployeeProfile: sheetsMocks.readEmployeeProfile,
  writeEmployeeProfile: sheetsMocks.writeEmployeeProfile
}));
vi.mock("../../services/googleDrivePicker", () => pickerMocks);
vi.mock("../../services/onboardingApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../services/onboardingApi")>()),
  OnboardingApi: class {
    acceptInvitation = apiMocks.acceptInvitation;
    getMemberships = apiMocks.getMemberships;
    recordPickerProof = apiMocks.recordPickerProof;
    updateConfig = apiMocks.updateConfig;
  }
}));

const membership: Membership = {
  lab: {
    id: "lab-id",
    name: "Cell Lab",
    revision: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    createdBy: "manager",
    updatedAt: "2026-01-01T00:00:00.000Z"
  },
  member: {
    id: "member-id",
    labId: "lab-id",
    email: "employee@example.com",
    normalizedEmail: "employee@example.com",
    displayName: "Employee",
    roles: ["employee"],
    active: true,
    revision: 2,
    onboarding: {
      status: "needsSharing",
      owner: "manager",
      reason: "The exact task log is not shared.",
      nextAction: "Ask a manager to provision Drive access.",
      updatedAt: "2026-01-01T00:00:00.000Z"
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    createdBy: "manager",
    updatedAt: "2026-01-01T00:00:00.000Z"
  },
  config: {
    memberId: "member-id",
    labId: "lab-id",
    spreadsheetId: "task-log",
    taskLogUrl: "https://docs.google.com/spreadsheets/d/task-log/edit",
    activeSheetName: "Tasks",
    proposedColumnMap: {},
    revision: 1,
    updatedAt: "2026-01-01T00:00:00.000Z",
    updatedBy: "manager"
  }
};

describe("EmployeeConnectFlow", () => {
  beforeEach(() => {
    sheetsMocks.fetchSpreadsheetMetadata.mockResolvedValue({
      spreadsheetId: "task-log",
      spreadsheetTitle: "Employee task log",
      sheets: [{ sheetId: 1, title: "Tasks" }]
    });
    sheetsMocks.readEmployeeProfile.mockResolvedValue(null);
    sheetsMocks.writeEmployeeProfile.mockResolvedValue({
      displayName: "Employee",
      profilePictureDataUrl: "",
      updatedAt: "2026-01-02T00:00:00.000Z"
    });
    pickerMocks.openSpreadsheetPicker.mockResolvedValue([]);
  });

  it("shows authoritative blocked progress instead of local setup controls", () => {
    const { container } = render(
      <EmployeeConnectFlow
        session={{
          email: "employee@example.com",
          name: "Employee",
          idToken: "id-token",
          accessToken: "access-token"
        }}
        config={{
          googleClientId: "client",
          googleApiKey: "key",
          googleAppId: "app"
        }}
        membership={membership}
        invitations={[]}
        onValidated={vi.fn()}
        onReconnect={vi.fn()}
        onSignOut={vi.fn()}
      />
    );

    expect(screen.getByText("Needs sharing")).toBeInTheDocument();
    expect(container.querySelectorAll("main")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Skip to onboarding" })).toHaveAttribute(
      "href",
      "#onboarding-main"
    );
    expect(
      screen.getByRole("navigation", { name: "Onboarding account actions" })
    ).toBeInTheDocument();
    expect(screen.getByText(/Owner:/)).toHaveTextContent("manager");
    expect(screen.queryByRole("button", { name: "Choose from Drive" })).not.toBeInTheDocument();
  });

  it("deletes an existing profile picture without blocking onboarding", async () => {
    const user = userEvent.setup();
    sheetsMocks.readEmployeeProfile.mockResolvedValue({
      displayName: "Employee",
      profilePictureDataUrl: "data:image/png;base64,abc",
      updatedAt: "2026-01-01T00:00:00.000Z"
    });
    renderGate(readyMembership());

    expect(
      await screen.findByRole("img", { name: "Selected profile photo preview" })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Choose profile photo file")).toHaveAttribute(
      "type",
      "file"
    );
    await user.click(await screen.findByRole("button", { name: "Use initials instead" }));

    await waitFor(() => expect(sheetsMocks.writeEmployeeProfile).toHaveBeenCalledOnce());
    expect(sheetsMocks.writeEmployeeProfile.mock.calls[0][2]).toMatchObject({
      profilePictureDataUrl: ""
    });
    expect(screen.getByText(/No photo/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Profile initials/ })).toBeInTheDocument();
  });

  it("keeps task-log onboarding usable when an optional profile write fails", async () => {
    const user = userEvent.setup();
    sheetsMocks.readEmployeeProfile.mockResolvedValue({
      displayName: "Employee",
      profilePictureDataUrl: "data:image/png;base64,abc",
      updatedAt: "2026-01-01T00:00:00.000Z"
    });
    sheetsMocks.writeEmployeeProfile.mockRejectedValue(new Error("Profile tab is read-only"));
    renderGate(readyMembership());

    await user.click(await screen.findByRole("button", { name: "Use initials instead" }));

    expect(await screen.findByText(/Profile deletion can be retried independently/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update authoritative configuration" })).toBeEnabled();
  });

  it("prefills an accepted invitation on a clean device", async () => {
    const user = userEvent.setup();
    const invitedMembership = { ...membership, member: { ...membership.member, onboarding: {
      ...membership.member.onboarding,
      status: "needsPicker",
      owner: "member",
      reason: "Select the exact file.",
      nextAction: "Open Picker."
    } } } satisfies Membership;
    apiMocks.acceptInvitation.mockResolvedValue({});
    apiMocks.getMemberships.mockResolvedValue({ memberships: [invitedMembership] });
    renderGateWith({
      membership: null,
      invitations: [
        {
          id: "invitation",
          labId: "lab-id",
          memberId: "member-id",
          email: "employee@example.com",
          normalizedEmail: "employee@example.com",
          roles: ["employee"],
          status: "pending",
          revision: 1,
          expiresAt: "2026-12-01T00:00:00.000Z",
          createdAt: "2026-01-01T00:00:00.000Z",
          createdBy: "manager",
          updatedAt: "2026-01-01T00:00:00.000Z"
        }
      ]
    });

    await user.click(screen.getByRole("button", { name: "Accept invitation" }));

    expect(await screen.findByText("Employee task log")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /^Active task tab/ })).toHaveValue("Tasks");
  });

  it("rejects the wrong Picker file before recording proof", async () => {
    const user = userEvent.setup();
    pickerMocks.openSpreadsheetPicker.mockResolvedValue([
      {
        id: "wrong-task-log",
        name: "Wrong workbook",
        url: "https://docs.google.com/spreadsheets/d/wrong-task-log/edit"
      }
    ]);
    sheetsMocks.fetchSpreadsheetMetadata
      .mockResolvedValueOnce({
        spreadsheetId: "task-log",
        spreadsheetTitle: "Employee task log",
        sheets: [{ sheetId: 1, title: "Tasks" }]
      })
      .mockResolvedValue({
      spreadsheetId: "wrong-task-log",
      spreadsheetTitle: "Wrong workbook",
      sheets: [{ sheetId: 1, title: "Tasks" }]
      });
    renderGate({ ...membership, member: { ...membership.member, onboarding: {
      ...membership.member.onboarding,
      status: "needsPicker",
      owner: "member",
      reason: "Select the exact file.",
      nextAction: "Open Picker."
    } } });

    await user.click(await screen.findByRole("button", { name: "Change file" }));

    expect(await screen.findByText(/not the invited workbook/i)).toBeInTheDocument();
    expect(apiMocks.recordPickerProof).not.toHaveBeenCalled();
    expect(pickerMocks.openSpreadsheetPicker).toHaveBeenCalledWith(
      expect.objectContaining({ query: "Employee task log" })
    );
    expect(sheetsMocks.fetchSpreadsheetMetadata).not.toHaveBeenCalledWith(
      "wrong-task-log",
      "access-token"
    );
    expect(screen.getByText("Employee task log")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /^Active task tab/ })).toHaveValue("Tasks");
  });

  it("writes a ready member's workbook and tab change to the authoritative backend", async () => {
    const user = userEvent.setup();
    const current = readyMembership();
    const onValidated = vi.fn();
    pickerMocks.openSpreadsheetPicker.mockResolvedValue([
      {
        id: "new-task-log",
        name: "New task log",
        url: "https://docs.google.com/spreadsheets/d/new-task-log/edit"
      }
    ]);
    sheetsMocks.fetchSpreadsheetMetadata.mockImplementation(async (spreadsheet: string) =>
      spreadsheet.includes("new-task-log")
        ? {
            spreadsheetId: "new-task-log",
            spreadsheetTitle: "New task log",
            sheets: [{ sheetId: 2, title: "Current Tasks" }]
          }
        : {
            spreadsheetId: "task-log",
            spreadsheetTitle: "Employee task log",
            sheets: [{ sheetId: 1, title: "Tasks" }]
          }
    );
    sheetsMocks.analyzeEmployeeSheetHeaders.mockResolvedValue({
      spreadsheetId: "new-task-log",
      spreadsheetTitle: "New task log",
      sheetId: 2,
      sheetTitle: "Current Tasks",
      headers: ["Project"],
      inferredMap: {
        project: { mode: "existing", header: "Project" }
      },
      unmappedFields: []
    });
    apiMocks.updateConfig.mockResolvedValue({
      member: {
        ...current.member,
        revision: current.member.revision + 1,
        onboarding: {
          ...current.member.onboarding,
          status: "needsSharing"
        }
      },
      config: {
        ...current.config!,
        spreadsheetId: "new-task-log",
        taskLogUrl: "https://docs.google.com/spreadsheets/d/new-task-log/edit",
        activeSheetName: "Current Tasks",
        revision: current.config!.revision + 1
      }
    });
    render(
      <EmployeeConnectFlow
        session={{
          email: "employee@example.com",
          name: "Employee",
          idToken: "id-token",
          accessToken: "access-token"
        }}
        config={{
          googleClientId: "client",
          googleApiKey: "key",
          googleAppId: "app"
        }}
        membership={current}
        invitations={[]}
        onValidated={onValidated}
        onReconnect={vi.fn()}
        onSignOut={vi.fn()}
      />
    );

    await user.click(await screen.findByRole("button", { name: "Change file" }));
    await user.selectOptions(
      await screen.findByRole("combobox", { name: /^Active task tab/ }),
      "Current Tasks"
    );
    await user.click(
      screen.getByRole("button", { name: "Update authoritative configuration" })
    );

    await waitFor(() =>
      expect(apiMocks.updateConfig).toHaveBeenCalledWith(
        "lab-id",
        "member-id",
        current.config!.revision,
        expect.objectContaining({
          spreadsheetId: "new-task-log",
          taskLogUrl: "https://docs.google.com/spreadsheets/d/new-task-log/edit",
          activeSheetName: "Current Tasks",
          proposedColumnMap: {
            project: { mode: "existing", header: "Project" }
          }
        })
      )
    );
    expect(onValidated).not.toHaveBeenCalled();
  });

  it("links column errors and focuses the first invalid mapping on submit", async () => {
    const user = userEvent.setup();
    sheetsMocks.analyzeEmployeeSheetHeaders.mockResolvedValue({
      spreadsheetId: "task-log",
      spreadsheetTitle: "Member Task-log workbook",
      sheetId: 1,
      sheetTitle: "Tasks",
      headers: ["Project"],
      inferredMap: {
        project: { mode: "existing", header: "Project" }
      },
      unmappedFields: []
    });
    renderGate({
      ...membership,
      member: {
        ...membership.member,
        onboarding: {
          status: "needsColumnReview",
          owner: "member",
          reason: "Review columns.",
          nextAction: "Confirm the mapping.",
          updatedAt: "2026-01-01T00:00:00.000Z"
        }
      }
    });

    const projectColumn = await screen.findByRole("combobox", {
      name: /Project sheet column/
    });
    await user.selectOptions(projectColumn, "");
    await user.click(
      screen.getByRole("button", { name: "Confirm required columns & finish" })
    );

    const invalidProjectColumn = screen.getByRole("combobox", {
      name: /Project sheet column/
    });
    expect(invalidProjectColumn).toHaveFocus();
    expect(invalidProjectColumn).toHaveAttribute("aria-invalid", "true");
    expect(invalidProjectColumn).toHaveAttribute(
      "aria-describedby",
      expect.stringContaining("column-map-project-error")
    );
  });
});

function readyMembership(): Membership {
  return {
    ...membership,
    member: {
      ...membership.member,
      onboarding: {
        status: "ready",
        owner: "system",
        reason: "Sharing, exact-file access, and the shared column map are complete.",
        nextAction: "No onboarding action is required.",
        updatedAt: "2026-01-01T00:00:00.000Z"
      }
    },
    config: {
      ...membership.config!,
      acceptedColumnMap: {
        project: { mode: "existing", header: "Project" }
      }
    }
  };
}

function renderGate(currentMembership: Membership) {
  return renderGateWith({ membership: currentMembership, invitations: [] });
}

function renderGateWith({
  membership: currentMembership,
  invitations
}: {
  membership: Membership | null;
  invitations: Parameters<typeof EmployeeConnectFlow>[0]["invitations"];
}) {
  return render(
    <EmployeeConnectFlow
      session={{
        email: "employee@example.com",
        name: "Employee",
        idToken: "id-token",
        accessToken: "access-token"
      }}
      config={{
        googleClientId: "client",
        googleApiKey: "key",
        googleAppId: "app"
      }}
      membership={currentMembership}
      invitations={invitations}
      onValidated={vi.fn()}
      onReconnect={vi.fn()}
      onSignOut={vi.fn()}
    />
  );
}
