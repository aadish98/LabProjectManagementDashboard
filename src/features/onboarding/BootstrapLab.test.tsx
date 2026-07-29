import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingApiError } from "../../services/onboardingApi";
import { BootstrapLab } from "./BootstrapLab";

const api = vi.hoisted(() => ({
  createBootstrapClaim: vi.fn(),
  claimBootstrap: vi.fn()
}));

vi.mock("../../services/onboardingApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../services/onboardingApi")>()),
  OnboardingApi: class {
    createBootstrapClaim = api.createBootstrapClaim;
    claimBootstrap = api.claimBootstrap;
  }
}));

const props = {
  session: {
    email: "owner@example.com",
    name: "Lab Owner",
    idToken: "id-token",
    accessToken: "drive-token"
  },
  config: {
    adminSpreadsheetId: "admin-workbook-id",
    googleClientId: "client",
    googleApiKey: "key",
    googleAppId: "app"
  },
  onClaimed: vi.fn(),
  onReconnect: vi.fn(),
  onSignOut: vi.fn()
};

describe("BootstrapLab", () => {
  beforeEach(() => {
    api.createBootstrapClaim.mockReset().mockResolvedValue({
      claim: { id: "claim-id" },
      replayed: false
    });
    api.claimBootstrap.mockReset().mockResolvedValue({
      lab: { id: "lab-id" },
      member: { id: "member-id" },
      replayed: false
    });
    props.onClaimed.mockReset().mockResolvedValue(undefined);
  });

  it("creates a claim, claims it, then re-probes authoritative access", async () => {
    const user = userEvent.setup();
    render(<BootstrapLab {...props} />);

    await user.click(screen.getByRole("button", { name: /verify roles sheet & claim lab/i }));

    await waitFor(() => expect(props.onClaimed).toHaveBeenCalledOnce());
    expect(api.createBootstrapClaim).toHaveBeenCalledWith(
      "Lab Owner's Lab",
      "admin-workbook-id"
    );
    expect(api.claimBootstrap).toHaveBeenCalledWith("claim-id");
    expect(api.createBootstrapClaim.mock.invocationCallOrder[0]).toBeLessThan(
      api.claimBootstrap.mock.invocationCallOrder[0]
    );
    expect(api.claimBootstrap.mock.invocationCallOrder[0]).toBeLessThan(
      props.onClaimed.mock.invocationCallOrder[0]
    );
  });

  it("does not claim or re-probe when claim creation fails", async () => {
    const user = userEvent.setup();
    api.createBootstrapClaim.mockRejectedValue(new Error("Backend unavailable"));
    render(<BootstrapLab {...props} />);

    await user.click(screen.getByRole("button", { name: /verify roles sheet & claim lab/i }));

    expect(await screen.findByText("Backend unavailable")).toBeInTheDocument();
    expect(api.claimBootstrap).not.toHaveBeenCalled();
    expect(props.onClaimed).not.toHaveBeenCalled();
  });

  it("surfaces malformed Roles rejection without inferring bootstrap", async () => {
    const user = userEvent.setup();
    api.createBootstrapClaim.mockRejectedValue(
      new OnboardingApiError({
        kind: "http",
        status: 409,
        code: "ROLES_SHEET_NOT_CANONICAL",
        message: "The Roles sheet is malformed.",
        action: "Repair the canonical headers."
      })
    );
    render(<BootstrapLab {...props} />);

    await user.click(screen.getByRole("button", { name: /verify roles sheet & claim lab/i }));

    expect(
      await screen.findByText(/Roles sheet is malformed.*Repair the canonical headers/i)
    ).toBeInTheDocument();
    expect(api.claimBootstrap).not.toHaveBeenCalled();
    expect(props.onClaimed).not.toHaveBeenCalled();
  });
});
