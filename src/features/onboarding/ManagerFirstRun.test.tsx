import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Membership } from "../../domain/onboarding";
import { ManagerFirstRun } from "./ManagerFirstRun";

const picker = vi.hoisted(() => vi.fn());
const api = vi.hoisted(() => ({
  getManagerFileProgress: vi.fn(),
  recordManagerFileProof: vi.fn()
}));

vi.mock("../../services/googleDrivePicker", () => ({
  openSpreadsheetPicker: picker
}));
vi.mock("../../services/onboardingApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../services/onboardingApi")>()),
  OnboardingApi: class {
    getManagerFileProgress = api.getManagerFileProgress;
    recordManagerFileProof = api.recordManagerFileProof;
  }
}));

const membership: Membership = {
  lab: {
    id: "lab",
    name: "Cell Lab",
    revision: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    createdBy: "owner",
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
      status: "needsPicker",
      owner: "member",
      reason: "Exact files remain.",
      nextAction: "Select exact files.",
      updatedAt: "2026-01-01T00:00:00.000Z"
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    createdBy: "owner",
    updatedAt: "2026-01-01T00:00:00.000Z"
  },
  config: null
};

const initialProgress = {
  requiredFiles: [
    { fileId: "task", purpose: "requiredTaskLog" as const, label: "Member Task-log workbook" }
  ],
  verifiedFileIds: [],
  remainingFileIds: ["task"],
  complete: false,
  requiresColumnReview: false
};

describe("ManagerFirstRun", () => {
  beforeEach(() => {
    api.getManagerFileProgress.mockReset().mockResolvedValue({
      member: membership.member,
      progress: initialProgress
    });
    api.recordManagerFileProof.mockReset();
    picker.mockReset();
  });

  it("retains exact subset progress and retries with the new revision", async () => {
    const user = userEvent.setup();
    picker.mockResolvedValueOnce([{ id: "task", name: "Task", url: "task" }]);
    api.recordManagerFileProof
      .mockResolvedValueOnce({
        member: {
          ...membership.member,
          revision: 2,
          onboarding: { ...membership.member.onboarding, status: "ready" }
        },
        progress: {
          ...initialProgress,
          verifiedFileIds: ["task"],
          remainingFileIds: [],
          complete: true
        }
      });
    const onAccessChanged = vi.fn().mockResolvedValue(undefined);
    render(
      <ManagerFirstRun
        session={{
          email: "manager@example.com",
          name: "Manager",
          idToken: "id-token",
          accessToken: "drive-token"
        }}
        config={{
          googleClientId: "client",
          googleApiKey: "key",
          googleAppId: "app"
        }}
        membership={membership}
        invitations={[]}
        onValidated={vi.fn()}
        onAccessChanged={onAccessChanged}
        onReconnect={vi.fn()}
        onSignOut={vi.fn()}
      />
    );

    await screen.findByText(/0 verified · 1 remaining/i);
    await user.click(screen.getByRole("button", { name: "Select remaining exact files" }));

    await waitFor(() => expect(api.recordManagerFileProof).toHaveBeenCalledTimes(1));
    expect(api.recordManagerFileProof.mock.calls[0].slice(2)).toEqual([1, ["task"]]);
    expect(onAccessChanged).toHaveBeenCalledTimes(1);
  });
});
