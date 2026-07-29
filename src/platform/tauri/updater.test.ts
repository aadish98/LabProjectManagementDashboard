import { beforeEach, describe, expect, it, vi } from "vitest";
import { tauriUpdaterPlatform } from "./updater";

const isTauri = vi.hoisted(() => vi.fn(() => true));
const check = vi.hoisted(() => vi.fn());
const relaunch = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ isTauri }));
vi.mock("@tauri-apps/plugin-updater", () => ({ check }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch }));

beforeEach(() => {
  isTauri.mockReset().mockReturnValue(true);
  check.mockReset();
  relaunch.mockReset();
});

describe("Tauri updater adapter", () => {
  it("reports unsupported outside Tauri and skips check", async () => {
    isTauri.mockReturnValue(false);

    expect(tauriUpdaterPlatform.isSupported()).toBe(false);
    await expect(tauriUpdaterPlatform.check()).resolves.toBeNull();
    expect(check).not.toHaveBeenCalled();
  });

  it("returns null when no update is available", async () => {
    check.mockResolvedValue(null);

    await expect(tauriUpdaterPlatform.check()).resolves.toBeNull();
    expect(check).toHaveBeenCalledOnce();
  });

  it("wraps an available update and forwards download progress", async () => {
    const close = vi.fn();
    const downloadAndInstall = vi.fn(async (onEvent?: (event: unknown) => void) => {
      onEvent?.({ event: "Started", data: { contentLength: 100 } });
      onEvent?.({ event: "Progress", data: { chunkLength: 40 } });
      onEvent?.({ event: "Finished" });
    });
    check.mockResolvedValue({
      version: "0.2.0",
      currentVersion: "0.1.0",
      body: "Fixes",
      downloadAndInstall,
      close
    });

    const update = await tauriUpdaterPlatform.check();
    expect(update).toMatchObject({
      version: "0.2.0",
      currentVersion: "0.1.0",
      body: "Fixes"
    });

    const progress: unknown[] = [];
    await update!.downloadAndInstall((event) => progress.push(event));

    expect(downloadAndInstall).toHaveBeenCalledOnce();
    expect(progress).toEqual([
      { event: "Started", contentLength: 100 },
      { event: "Progress", chunkLength: 40 },
      { event: "Finished" }
    ]);

    await update!.close();
    await update!.close();
    expect(close).toHaveBeenCalledOnce();
  });

  it("relaunches only under Tauri", async () => {
    await tauriUpdaterPlatform.relaunch();
    expect(relaunch).toHaveBeenCalledOnce();

    relaunch.mockClear();
    isTauri.mockReturnValue(false);
    await tauriUpdaterPlatform.relaunch();
    expect(relaunch).not.toHaveBeenCalled();
  });
});
