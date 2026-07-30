import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe, { type RunOptions } from "axe-core";
import type { ComponentProps, ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Membership } from "../domain/onboarding";
import { ManagerFirstRun } from "../features/onboarding/ManagerFirstRun";
import { AppScreens } from "./screens";

const axeOptions: RunOptions = {
  rules: {
    // JSDOM has no layout or pixel rendering, so axe cannot evaluate contrast.
    "color-contrast": { enabled: false }
  }
};

async function expectNoAxeViolations(
  surface: ReactElement,
  interact?: () => void | Promise<void>
) {
  const { baseElement } = render(surface);
  await interact?.();
  expect(baseElement.querySelectorAll("main")).toHaveLength(1);
  const results = await axe.run(baseElement, axeOptions);
  expect(
    results.violations.map(({ id, help, nodes }) => ({
      id,
      help,
      targets: nodes.map((node) => node.target)
    }))
  ).toEqual([]);
}

const session = {
  email: "member@example.com",
  name: "Member",
  accessToken: "access-token",
  idToken: "id-token"
};

const config = {
  googleClientId: "client",
  googleApiKey: "key",
  googleAppId: "app"
};

const managerMembership: Membership = {
  lab: {
    id: "lab",
    name: "Cell Lab",
    revision: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    createdBy: "manager",
    updatedAt: "2026-01-01T00:00:00.000Z"
  },
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
      status: "needsSharing",
      owner: "manager",
      reason: "A task-log workbook still needs to be shared.",
      nextAction: "Share the workbook, then retry.",
      updatedAt: "2026-01-01T00:00:00.000Z"
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    createdBy: "manager",
    updatedAt: "2026-01-01T00:00:00.000Z"
  },
  config: null
};

const managerFallbackProps: Extract<
  ComponentProps<typeof AppScreens>,
  { route: "managerWorkspace" }
>["props"] = {
  status: {
    kind: "error",
    text: "One member workbook could not be loaded.",
    errorCode: "PICKER_GRANT_REQUIRED",
    operation: "loadManagerDataset"
  },
  onDismissStatus: vi.fn(),
  setupProps: null,
  workspaceProps: null,
  role: "manager",
  email: "manager@example.com",
  loading: false,
  reconnecting: false,
  refreshing: false,
  fileAccessIssue: {
    message: "Re-select the missing workbook.",
    missingSpreadsheets: []
  },
  onOpenSetup: vi.fn(),
  onReconnect: vi.fn(),
  onSignOut: vi.fn(),
  onGrantTaskLogAccess: vi.fn(),
  onRetry: vi.fn()
};

describe("axe accessibility guardrails", () => {
  it("has no detectable violations on the signed-out surface", async () => {
    await expectNoAxeViolations(
      <AppScreens
        route="signedOut"
        props={{ onSignIn: vi.fn(), signingIn: false, noticeMessage: "Use your lab account." }}
      />
    );
  });

  it("has no detectable violations on the access-check surface", async () => {
    await expectNoAxeViolations(<AppScreens route="accessCheck" />);
  });

  it("has no detectable violations on the unauthorized surface", async () => {
    await expectNoAxeViolations(
      <AppScreens
        route="unauthorized"
        props={{
          status: null,
          onDismissStatus: vi.fn(),
          screenProps: {
            email: "external@example.com",
            reason: "No active backend membership exists.",
            reconnecting: false,
            onReconnect: vi.fn(),
            onSignOut: vi.fn()
          }
        }}
      />
    );
  });

  it("has no detectable violations on the onboarding surface", async () => {
    await expectNoAxeViolations(
      <ManagerFirstRun
        session={{ ...session, email: "manager@example.com", name: "Manager" }}
        config={config}
        membership={managerMembership}
        invitations={[]}
        onValidated={vi.fn()}
        onAccessChanged={vi.fn()}
        onReconnect={vi.fn()}
        onSignOut={vi.fn()}
      />
    );
  });

  it("has no detectable violations on the manager recovery surface", async () => {
    await expectNoAxeViolations(
      <AppScreens route="managerWorkspace" props={managerFallbackProps} />
    );
  });

  it("has no detectable violations on the member workspace surface", async () => {
    await expectNoAxeViolations(
      <AppScreens
        route="employeeWorkspace"
        props={{
          status: null,
          onDismissStatus: vi.fn(),
          workspaceProps: {
            session,
            labMember: "Member",
            prefs: {
              taskLogUrl: "https://docs.google.com/spreadsheets/d/member-file/edit",
              activeSheetName: "Tasks"
            },
            experiments: [],
            saving: false,
            onCreate: vi.fn(),
            onUpdate: vi.fn(),
            onComplete: vi.fn(),
            onResolveOverdue: vi.fn(),
            onChangePrefs: vi.fn(),
            onReconnect: vi.fn(),
            onSignOut: vi.fn(),
            onRefresh: vi.fn(),
            reconnecting: false,
            loading: false,
            lastSyncedAt: "2026-07-15T12:00:00.000Z"
          }
        }}
      />
    );
  });

  it("has no detectable violations in a real member task dialog portal", async () => {
    const user = userEvent.setup();
    await expectNoAxeViolations(
      <AppScreens
        route="employeeWorkspace"
        props={{
          status: { kind: "success", text: "Tasks refreshed." },
          onDismissStatus: vi.fn(),
          workspaceProps: {
            session,
            labMember: "Member",
            prefs: {
              taskLogUrl: "https://docs.google.com/spreadsheets/d/member-file/edit",
              activeSheetName: "Tasks"
            },
            experiments: [],
            saving: false,
            onCreate: vi.fn(),
            onUpdate: vi.fn(),
            onComplete: vi.fn(),
            onResolveOverdue: vi.fn(),
            onChangePrefs: vi.fn(),
            onReconnect: vi.fn(),
            onSignOut: vi.fn(),
            onRefresh: vi.fn(),
            reconnecting: false,
            loading: false,
            lastSyncedAt: "2026-07-15T12:00:00.000Z"
          }
        }}
      />,
      async () => {
        await user.click(screen.getByRole("button", { name: "Create a new task" }));
        expect(screen.getByRole("dialog", { name: "New task" })).toBeInTheDocument();
      }
    );
  });

  it("has no detectable violations on the loaded manager workspace", async () => {
    const dataset = {
      source: "googleSheets" as const,
      registry: [],
      experiments: [],
      runLog: [],
      feedbackThreads: [],
      roleDirectory: [],
      lastSyncedAt: "2026-07-15T12:00:00.000Z"
    };
    await expectNoAxeViolations(
      <AppScreens
        route="managerWorkspace"
        props={{
          status: null,
          onDismissStatus: vi.fn(),
          setupProps: null,
          role: "manager",
          email: "manager@example.com",
          loading: false,
          reconnecting: false,
          refreshing: false,
          fileAccessIssue: null,
          onOpenSetup: vi.fn(),
          onReconnect: vi.fn(),
          onSignOut: vi.fn(),
          onGrantTaskLogAccess: vi.fn(),
          onRetry: vi.fn(),
          workspaceProps: {
            session: { ...session, email: "manager@example.com", name: "Manager" },
            labId: "lab",
            viewerRole: "manager",
            dataset,
            visibleLabMembers: [],
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
            onCreateTask: vi.fn(),
            onUpdateTask: vi.fn(),
            onCreateOwnTask: vi.fn(),
            onUpdateOwnTask: vi.fn(),
            onCompleteOwnTask: vi.fn(),
            onResolveOwnOverdue: vi.fn(),
            reconnecting: false
          }
        }}
      />
    );
  });
});
