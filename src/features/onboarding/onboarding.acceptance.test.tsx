import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveAuthoritativeViewerContext } from "../../auth/roles";
import { EmployeeSetupGate } from "../../components/EmployeeSetupGate";
import { TabList, TabPanel } from "../../components/ui";
import type { DashboardDataset, ExperimentRecord } from "../../domain/experiment";
import {
  acceptedMemberPrefs,
  membershipPrefs,
  ONBOARDING_STATUSES,
  ONBOARDING_STATUS_LABELS,
  type Membership
} from "../../domain/onboarding";
import { AppScreens } from "../../app/screens";
import { selectAppRoute } from "../../app/routing";
import { ManagerWorkspace } from "../manager/ManagerWorkspace";
import {
  getInitialAssigneeId,
  resolveAssigneeContext
} from "../tasks/taskFormFields";
import {
  makePerson,
  splitForSave,
  validatePeople
} from "../setup/teamSetupState";
import {
  deriveDefaultSelections,
  keepExplicitTabSelection,
  validateSelections
} from "./columnMapping";
import { ManagerFirstRun } from "./ManagerFirstRun";

const picker = vi.hoisted(() => vi.fn());
const onboardingApi = vi.hoisted(() => ({
  getManagerFileProgress: vi.fn(),
  recordManagerFileProof: vi.fn(),
  recordPickerProof: vi.fn(),
  updateConfig: vi.fn()
}));
const sheets = vi.hoisted(() => ({
  fetchSpreadsheetMetadata: vi.fn(),
  readEmployeeProfile: vi.fn(),
  writeEmployeeProfile: vi.fn(),
  analyzeEmployeeSheetHeaders: vi.fn(),
  insertHeadersInSheet: vi.fn()
}));

vi.mock("../../services/googleDrivePicker", () => ({
  openSpreadsheetPicker: picker
}));
vi.mock("../../services/onboardingApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../services/onboardingApi")>()),
  OnboardingApi: class {
    getManagerFileProgress = onboardingApi.getManagerFileProgress;
    recordManagerFileProof = onboardingApi.recordManagerFileProof;
    recordPickerProof = onboardingApi.recordPickerProof;
    updateConfig = onboardingApi.updateConfig;
  }
}));
vi.mock("../../services/sheets/metadata", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../services/sheets/metadata")>()),
  fetchSpreadsheetMetadata: sheets.fetchSpreadsheetMetadata,
  analyzeEmployeeSheetHeaders: sheets.analyzeEmployeeSheetHeaders,
  insertHeadersInSheet: sheets.insertHeadersInSheet
}));
vi.mock("../../services/sheets/profile", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../services/sheets/profile")>()),
  readEmployeeProfile: sheets.readEmployeeProfile,
  writeEmployeeProfile: sheets.writeEmployeeProfile
}));

const now = "2026-07-15T12:00:00.000Z";
const session = {
  email: "manager@example.com",
  name: "Manager",
  accessToken: "access-token",
  idToken: "id-token"
};
const config = {
  googleClientId: "client",
  googleApiKey: "key",
  googleAppId: "app"
};

function makeMembership(
  status: Membership["member"]["onboarding"]["status"] = "ready",
  overrides: Partial<NonNullable<Membership["config"]>> = {}
): Membership {
  return {
    lab: {
      id: "lab",
      name: "Cell Lab",
      revision: 1,
      createdAt: now,
      createdBy: "manager",
      updatedAt: now
    },
    member: {
      id: "member-ada",
      labId: "lab",
      email: "ada@example.com",
      normalizedEmail: "ada@example.com",
      displayName: "Ada",
      roles: ["employee"],
      active: true,
      revision: 2,
      onboarding: {
        status,
        owner: status === "needsSharing" ? "manager" : status === "ready" ? "system" : "member",
        reason: `Onboarding is ${status}.`,
        nextAction: status === "ready" ? "Enter the workspace." : "Complete the next prerequisite.",
        updatedAt: now
      },
      createdAt: now,
      createdBy: "manager",
      updatedAt: now
    },
    config: {
      memberId: "member-ada",
      labId: "lab",
      spreadsheetId: "ada-file",
      taskLogUrl: "https://docs.google.com/spreadsheets/d/ada-file/edit",
      activeSheetName: "Tasks",
      proposedColumnMap: {
        project: { mode: "existing", header: "Project" }
      },
      acceptedColumnMap:
        status === "ready"
          ? { project: { mode: "existing", header: "Project" } }
          : undefined,
      revision: 3,
      updatedAt: now,
      updatedBy: "manager",
      ...overrides
    }
  };
}

const registry = [
  {
    memberId: "member-ada",
    labMember: "Ada",
    taskLogUrl: "https://docs.google.com/spreadsheets/d/ada-file/edit",
    activeSheetName: "Tasks",
    active: true
  },
  {
    memberId: "member-grace",
    labMember: "Grace",
    taskLogUrl: "https://docs.google.com/spreadsheets/d/grace-file/edit",
    activeSheetName: "Tasks",
    active: true
  }
];

function makeRecord(): ExperimentRecord {
  return {
    id: "task-ada",
    taskId: "task-ada",
    memberId: "member-ada",
    rowNumber: 2,
    labMember: "Ada",
    taskLogUrl: registry[0].taskLogUrl,
    activeSheetName: "Tasks",
    project: "Atlas",
    experiment: "Visible task",
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
}

function makeDataset(overrides: Partial<DashboardDataset> = {}): DashboardDataset {
  return {
    source: "googleSheets",
    registry,
    experiments: [makeRecord()],
    runLog: [],
    feedbackThreads: [],
    roleDirectory: [],
    lastSyncedAt: now,
    ...overrides
  };
}

function renderManagerWorkspace(dataset: DashboardDataset = makeDataset()) {
  const props: ComponentProps<typeof ManagerWorkspace> = {
    session,
    labId: "lab",
    viewerRole: "manager",
    dataset,
    visibleLabMembers: ["Ada", "Grace"],
    managerOwnLabMember: null,
    managerOwnPrefs: null,
    managerOwnExperiments: [],
    saving: false,
    refreshing: false,
    onRefresh: vi.fn().mockResolvedValue(dataset),
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
    reconnecting: false
  };
  return render(<ManagerWorkspace {...props} />);
}

describe("Onboarding acceptance criteria", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    picker.mockResolvedValue([]);
    sheets.fetchSpreadsheetMetadata.mockResolvedValue({
      spreadsheetId: "ada-file",
      spreadsheetTitle: "Ada task log",
      sheets: [
        { sheetId: 1, title: "Instructions" },
        { sheetId: 2, title: "Tasks" }
      ]
    });
    sheets.readEmployeeProfile.mockResolvedValue(null);
    sheets.writeEmployeeProfile.mockResolvedValue(null);
  });

  it("AC01 requires one explicitly selected workbook and active tab for a new member", () => {
    const person = makePerson({
      name: "Ada",
      email: "ada@example.com",
      roles: { employee: true, manager: false, pi: false },
      taskLogUrl: "https://docs.google.com/spreadsheets/d/ada-file/edit",
      availableTabs: [
        { sheetId: 1, title: "Instructions" },
        { sheetId: 2, title: "Tasks" }
      ],
      activeSheetName: keepExplicitTabSelection("", [
        { title: "Instructions" },
        { title: "Tasks" }
      ])
    });

    expect(validatePeople([person]).byPerson.get(person.id)).toContain(
      "Choose the Active task tab."
    );
    person.activeSheetName = "Tasks";
    expect(validatePeople([person]).hasBlocking).toBe(false);
    expect(splitForSave([person])).toMatchObject({
      registryRows: [{ taskLogUrl: person.taskLogUrl, activeSheetName: "Tasks" }],
      roleRows: [{ email: "ada@example.com", role: "employee" }]
    });
  });

  it("AC02 keeps a new member Invited and enforces the ordered lifecycle", () => {
    const invited = makeMembership("invited");
    expect(ONBOARDING_STATUS_LABELS[invited.member.onboarding.status]).toBe("Invited");
    expect(ONBOARDING_STATUSES.slice(0, 5)).toEqual([
      "invited",
      "needsSharing",
      "needsPicker",
      "needsColumnReview",
      "ready"
    ]);
    expect(
      selectAppRoute({
        hasSession: true,
        viewerRole: "employee",
        hasEmployeePrefs: true,
        employeeForceSetup: false,
        onboardingStatus: invited.member.onboarding.status,
      })
    ).toBe("employeeSetup");
  });

  it("AC03 discovers a clean-device account from its backend invitation", () => {
    const invitation = {
      id: "invitation",
      labId: "lab",
      memberId: "member-ada",
      email: "ada@example.com",
      normalizedEmail: "ada@example.com",
      roles: ["employee" as const],
      status: "pending" as const,
      revision: 1,
      expiresAt: "2026-12-01T00:00:00.000Z",
      createdAt: now,
      createdBy: "manager",
      updatedAt: now
    };
    const viewer = resolveAuthoritativeViewerContext(
      { ...session, email: "ada@example.com", name: "Ada" },
      [],
      [invitation],
      false
    );

    expect(viewer).toMatchObject({ role: "employee", source: "backendInvitation" });
    expect(
      selectAppRoute({
        hasSession: true,
        viewerRole: viewer.role,
        hasEmployeePrefs: false,
        employeeForceSetup: false,
        onboardingStatus: "invited",
      })
    ).toBe("employeeSetup");
  });

  it("AC04 prefills authoritative workbook data without choosing a first tab or assignee", () => {
    const membership = makeMembership("needsPicker");
    expect(membershipPrefs(membership)).toMatchObject({
      taskLogUrl: membership.config?.taskLogUrl,
      activeSheetName: "Tasks"
    });
    expect(keepExplicitTabSelection("Archived", [{ title: "Tasks" }])).toBe("");
    expect(getInitialAssigneeId(registry)).toBe("");
    expect(getInitialAssigneeId(registry, "missing-member")).toBe("");
  });

  it("AC05 rejects a wrong exact Picker file before column confirmation and workspace routing", async () => {
    const user = userEvent.setup();
    picker.mockResolvedValue([
      {
        id: "wrong-file",
        name: "Wrong task log",
        url: "https://docs.google.com/spreadsheets/d/wrong-file/edit"
      }
    ]);
    render(
      <EmployeeSetupGate
        session={{ ...session, email: "ada@example.com", name: "Ada" }}
        config={config}
        membership={makeMembership("needsPicker")}
        invitations={[]}
        onValidated={vi.fn()}
        onReconnect={vi.fn()}
        onSignOut={vi.fn()}
      />
    );

    await user.click(await screen.findByRole("button", { name: "Change file" }));
    expect(await screen.findByText(/not the invited workbook/i)).toBeInTheDocument();
    expect(onboardingApi.recordPickerProof).not.toHaveBeenCalled();

    const selections = deriveDefaultSelections({
      spreadsheetId: "ada-file",
      spreadsheetTitle: "Ada task log",
      sheetId: 2,
      sheetTitle: "Tasks",
      headers: ["Project"],
      inferredMap: { project: { mode: "existing", header: "Project" } },
      unmappedFields: []
    });
    expect(validateSelections(selections).missingFields.length).toBeGreaterThan(0);
    expect(
      selectAppRoute({
        hasSession: true,
        viewerRole: "employee",
        hasEmployeePrefs: true,
        employeeForceSetup: false,
        onboardingStatus: "needsColumnReview",
      })
    ).toBe("employeeSetup");
  });

  it("AC06 denies access when no backend membership or invitation exists", () => {
    const viewer = resolveAuthoritativeViewerContext(session, [], [], false);
    expect(viewer).toMatchObject({ role: "unauthorized", source: "backendDenied" });
    expect(
      selectAppRoute({
        hasSession: true,
        viewerRole: viewer.role,
        hasEmployeePrefs: true,
        employeeForceSetup: false,
        onboardingStatus: "ready",
      })
    ).toBe("unauthorized");
  });

  it("AC07 preserves accessible manager data when another member is incomplete", () => {
    renderManagerWorkspace(
      makeDataset({
        memberLoadIssues: [
          {
            memberId: "member-grace",
            labMember: "Grace",
            taskLogUrl: registry[1].taskLogUrl,
            activeSheetName: "Tasks",
            code: "schema",
            message: "The authoritative configuration has no accepted column map."
          }
        ]
      })
    );

    expect(screen.getByText("Visible task")).toBeInTheDocument();
    expect(screen.getByText(/1 Task-log workbook could not be loaded/i)).toBeInTheDocument();
    expect(screen.getByText(/Data from accessible Task-log workbooks is still shown/i)).toBeInTheDocument();
  });

  it("AC08 gives managers an exact task-log-only first-run checklist", async () => {
    const managerMembership = makeMembership("needsPicker");
    managerMembership.member = {
      ...managerMembership.member,
      id: "manager",
      email: "manager@example.com",
      normalizedEmail: "manager@example.com",
      displayName: "Manager",
      roles: ["manager"]
    };
    onboardingApi.getManagerFileProgress.mockResolvedValue({
      member: managerMembership.member,
      progress: {
        requiredFiles: [
          {
            fileId: "ada-file",
            purpose: "requiredTaskLog",
            label: "Ada Task-log workbook",
            memberId: "member-ada",
            activeSheetName: "Tasks"
          }
        ],
        verifiedFileIds: [],
        remainingFileIds: ["ada-file"],
        complete: false,
        requiresColumnReview: false
      }
    });

    render(
      <ManagerFirstRun
        session={session}
        config={config}
        membership={managerMembership}
        invitations={[]}
        onValidated={vi.fn()}
        onAccessChanged={vi.fn()}
        onReconnect={vi.fn()}
        onSignOut={vi.fn()}
      />
    );

    expect(await screen.findByText("Exact-file Picker checklist")).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Ada Task-log workbook remaining" })
    ).not.toBeChecked();
  });

  it("AC09 surfaces each remaining file issue while keeping partial data usable", () => {
    renderManagerWorkspace(
      makeDataset({
        staleTaskLogs: [
          {
            memberId: "member-grace",
            labMember: "Grace",
            taskLogUrl: registry[1].taskLogUrl,
            activeSheetName: "Archived",
            reason: "Tab not found."
          }
        ],
        memberLoadIssues: [
          {
            memberId: "member-grace",
            labMember: "Grace",
            taskLogUrl: registry[1].taskLogUrl,
            activeSheetName: "Tasks",
            code: "pickerGrant",
            message: "Picker access is missing."
          }
        ]
      })
    );

    expect(screen.getByText("Visible task")).toBeInTheDocument();
    expect(screen.getByText(/tab "Archived" not found/i)).toBeInTheDocument();
    expect(screen.getByText(/Picker access is missing/i)).toBeInTheDocument();
  });

  it("AC10 requires explicit assignee context and names the task destination", async () => {
    const user = userEvent.setup();
    renderManagerWorkspace();

    await user.click(screen.getByRole("button", { name: "Add task" }));
    expect(screen.getByRole("combobox", { name: "Assign to" })).toHaveValue("");
    expect(resolveAssigneeContext(registry, "")).toBeUndefined();

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Assign to" }),
      "member-ada"
    );
    expect(screen.getByRole("heading", { name: "New task for Ada" })).toBeInTheDocument();
    expect(resolveAssigneeContext(registry, "member-ada")).toMatchObject({
      labMember: "Ada",
      activeSheetName: "Tasks"
    });
  });

  it("AC11 sends workbook and tab changes through one authoritative member config", () => {
    const updatedMembership = makeMembership("ready", {
      spreadsheetId: "new-file",
      taskLogUrl: "https://docs.google.com/spreadsheets/d/new-file/edit",
      activeSheetName: "Current Tasks",
      revision: 4
    });

    const memberConsumer = membershipPrefs(updatedMembership);
    const managerConsumer = acceptedMemberPrefs(updatedMembership.config);
    expect(memberConsumer).toEqual(managerConsumer);
    expect(managerConsumer).toMatchObject({
      taskLogUrl: "https://docs.google.com/spreadsheets/d/new-file/edit",
      activeSheetName: "Current Tasks",
      strictColumnMap: true
    });
  });

  it("AC12 preserves keyboard route and tab semantics for assistive technology", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(
      <>
        <AppScreens route="accessCheck" />
        <TabList
          aria-label="Onboarding steps"
          selectedTabId="workbook"
          onChange={onChange}
          tabs={[
            { id: "workbook", panelId: "workbook-panel", label: "Workbook" },
            { id: "columns", panelId: "columns-panel", label: "Columns" }
          ]}
        />
        <TabPanel id="workbook-panel" tabId="workbook" active>
          Workbook setup
        </TabPanel>
        <TabPanel id="columns-panel" tabId="columns" active={false}>
          Column setup
        </TabPanel>
      </>
    );

    expect(container.querySelectorAll("main")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Skip to access status" })).toHaveAttribute(
      "href",
      "#access-main"
    );
    const workbookTab = screen.getByRole("tab", { name: "Workbook" });
    workbookTab.focus();
    await user.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenCalledWith("columns");
    expect(screen.getByRole("tab", { name: "Columns" })).toHaveFocus();
  });
});
