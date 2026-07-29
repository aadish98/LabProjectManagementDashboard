import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AvailableAppUpdate } from "../platform/contracts";
import { useAppUpdates } from "./useAppUpdates";

const updater = vi.hoisted(() => ({
  isSupported: vi.fn(() => true),
  check: vi.fn(),
  relaunch: vi.fn()
}));

vi.mock("../platform/tauri/updater", () => ({
  tauriUpdaterPlatform: updater
}));

function Harness() {
  const { banner, dialog } = useAppUpdates();
  return (
    <>
      {banner}
      {dialog}
    </>
  );
}

function createUpdate(
  overrides: Partial<AvailableAppUpdate> = {}
): AvailableAppUpdate {
  return {
    version: "0.2.0",
    currentVersion: "0.1.0",
    downloadAndInstall: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    ...overrides
  };
}

beforeEach(() => {
  updater.isSupported.mockReset().mockReturnValue(true);
  updater.check.mockReset();
  updater.relaunch.mockReset().mockResolvedValue(undefined);
});

describe("useAppUpdates", () => {
  it("closes an update that arrives after the component unmounts", async () => {
    let resolveCheck: ((update: AvailableAppUpdate) => void) | undefined;
    updater.check.mockReturnValue(
      new Promise<AvailableAppUpdate>((resolve) => {
        resolveCheck = resolve;
      })
    );
    const update = createUpdate();

    const view = render(<Harness />);
    view.unmount();
    resolveCheck?.(update);

    await waitFor(() => expect(update.close).toHaveBeenCalledOnce());
  });

  it("does not offer a second install when restart fails after installation", async () => {
    const user = userEvent.setup();
    const update = createUpdate();
    updater.check.mockResolvedValue(update);
    updater.relaunch.mockRejectedValue(new Error("restart failed"));

    render(<Harness />);
    await user.click(await screen.findByRole("button", { name: "Install and restart" }));
    await user.click(screen.getByRole("button", { name: "Install and restart" }));

    expect(
      await screen.findByText(
        "The update was installed, but the app could not restart automatically. Close and reopen the app to finish."
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    expect(update.close).toHaveBeenCalled();
  });
});
