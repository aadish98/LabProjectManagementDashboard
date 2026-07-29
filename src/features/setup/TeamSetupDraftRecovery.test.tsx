import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TeamSetupPanel } from "./TeamSetupPanel";

const api = vi.hoisted(() => ({
  listMembers: vi.fn(),
  listInvitations: vi.fn()
}));

vi.mock("../../services/onboardingApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../services/onboardingApi")>()),
  OnboardingApi: class {
    listMembers = api.listMembers;
    listInvitations = api.listInvitations;
  }
}));

const membership = {
  member: {
    id: "manager",
    labId: "lab",
    email: "manager@example.com",
    normalizedEmail: "manager@example.com",
    displayName: "Manager",
    roles: ["manager" as const],
    active: true,
    revision: 1,
    onboarding: {
      status: "ready" as const,
      owner: "system" as const,
      reason: "Ready",
      nextAction: "None",
      updatedAt: "2026-07-14T18:00:00.000Z"
    },
    createdAt: "2026-07-14T18:00:00.000Z",
    createdBy: "manager",
    updatedAt: "2026-07-14T18:00:00.000Z"
  },
  lab: {
    id: "lab",
    name: "Lab",
    adminSpreadsheetId: "admin",
    revision: 1,
    createdAt: "2026-07-14T18:00:00.000Z",
    createdBy: "manager",
    updatedAt: "2026-07-14T18:00:00.000Z"
  },
  config: null
};

beforeEach(() => {
  api.listMembers.mockResolvedValue({ members: [] });
  api.listInvitations.mockResolvedValue({ invitations: [] });
});

describe("team setup draft recovery", () => {
  it("preserves the visible draft when a reload fails", async () => {
    const user = userEvent.setup();
    const props = {
      config: {
        adminSpreadsheetId: "admin",
        googleClientId: "client",
        googleApiKey: "key",
        googleAppId: "app"
      },
      membership,
      onChange: vi.fn(),
      onClose: vi.fn(),
      onSaved: vi.fn()
    };
    const { rerender } = render(
      <TeamSetupPanel
        {...props}
        session={{
          email: "manager@example.com",
          name: "Manager",
          accessToken: "token",
          idToken: "id-token-1"
        }}
      />
    );
    await screen.findByText("No members yet. Add a member invitation to configure access.");
    await user.click(screen.getByRole("button", { name: "Add invitation" }));
    await user.type(screen.getByRole("textbox", { name: "Name" }), "Draft Member");

    api.listMembers.mockRejectedValueOnce(new Error("offline"));
    rerender(
      <TeamSetupPanel
        {...props}
        session={{
          email: "manager@example.com",
          name: "Manager",
          accessToken: "token",
          idToken: "id-token-2"
        }}
      />
    );

    expect(
      await screen.findByText(/draft already shown here was preserved/)
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Draft Member");
  });
});
