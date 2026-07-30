import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppScreens } from "./screens";

describe("route landmarks", () => {
  it("provides one main landmark and a working skip link when signed out", () => {
    const { container } = render(
      <AppScreens
        route="signedOut"
        props={{ onSignIn: vi.fn(), signingIn: false }}
      />
    );

    expect(container.querySelectorAll("main")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Skip to sign in" })).toHaveAttribute(
      "href",
      "#signin-main"
    );
    expect(screen.getByRole("navigation", { name: "Sign-in actions" })).toBeInTheDocument();
  });

  it("provides one main landmark and skip link during access checks", () => {
    const { container } = render(<AppScreens route="accessCheck" />);

    expect(container.querySelectorAll("main")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Skip to access status" })).toHaveAttribute(
      "href",
      "#access-main"
    );
  });

  it("provides complete, copyable unauthorized recovery actions", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });
    const onReconnect = vi.fn();
    const onSignOut = vi.fn();
    const { container } = render(
      <AppScreens
        route="unauthorized"
        props={{
          status: null,
          onDismissStatus: vi.fn(),
          screenProps: {
            email: "member@example.com",
            reason: "No active membership.",
            reconnecting: false,
            onReconnect,
            onSignOut
          }
        }}
      />
    );

    expect(container.querySelectorAll("main")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Skip to access details" })).toHaveAttribute(
      "href",
      "#tasks-main"
    );
    expect(screen.getByText(/right Access role/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Request access" })).toHaveAttribute(
      "href",
      expect.stringContaining("mailto:")
    );

    await user.click(screen.getByRole("button", { name: "Switch Google account" }));
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(onReconnect).toHaveBeenCalledOnce();
    expect(onSignOut).toHaveBeenCalledOnce();

    await user.click(screen.getByText("Access diagnostics"));
    await user.click(screen.getByRole("button", { name: "Copy diagnostics" }));
    expect(writeText).toHaveBeenCalledWith(
      "Signed-in account: member@example.com\nReason: No active membership."
    );
    expect(screen.getByRole("status")).toHaveTextContent("Access diagnostics copied.");
  });

  it("isolates the manager workspace while Team setup is modal", () => {
    const { container } = render(
      <AppScreens
        route="managerWorkspace"
        props={{
          status: null,
          onDismissStatus: vi.fn(),
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
          workspaceProps: null,
          setupProps: {
            config: {
              googleClientId: "client",
              googleApiKey: "key",
              googleAppId: "app"
            },
            session: {
              email: "manager@example.com",
              name: "Manager",
              accessToken: "token"
            },
            membership: null,
            onChange: vi.fn(),
            onClose: vi.fn(),
            onSaved: vi.fn().mockResolvedValue(undefined)
          }
        }}
      />
    );

    expect(screen.getByRole("dialog", { name: "Team setup" })).toBeInTheDocument();
    expect(container).toHaveAttribute("aria-hidden", "true");
    expect(container).toHaveProperty("inert", true);
  });
});
