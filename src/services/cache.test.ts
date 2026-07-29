import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DashboardDataset } from "../domain/experiment";
import * as cacheModule from "./cache";
import {
  clearStoredSessionSecurely,
  getDatasetCacheKey,
  invalidateDatasetCaches,
  readDatasetCache,
  readStoredSessionWithSecrets,
  writeStoredSessionSecurely,
  writeDatasetCache
} from "./cache";

const vault = vi.hoisted(() => ({
  store: vi.fn(),
  load: vi.fn(),
  delete: vi.fn()
}));

vi.mock("../platform/tauri/secrets", () => ({
  tauriSessionSecretVault: vault
}));

const dataset: DashboardDataset = {
  source: "googleSheets",
  registry: [],
  experiments: [],
  runLog: [],
  feedbackThreads: [],
  roleDirectory: [],
  lastSyncedAt: "2026-07-14T18:00:00.000Z"
};

beforeEach(() => {
  window.localStorage.clear();
  vault.store.mockReset().mockResolvedValue(undefined);
  vault.load.mockReset().mockResolvedValue(null);
  vault.delete.mockReset().mockResolvedValue(undefined);
});

describe("secure session storage", () => {
  it("exposes no synchronous session compatibility APIs", () => {
    expect(cacheModule).not.toHaveProperty("readStoredSession");
    expect(cacheModule).not.toHaveProperty("writeStoredSession");
  });

  it("persists only identity metadata in localStorage", async () => {
    await writeStoredSessionSecurely({
      email: "Manager@Example.com",
      name: "Manager",
      accessToken: "access-secret",
      idToken: "id-secret",
      refreshToken: "refresh-secret",
      accessTokenExpiresAt: 123
    });

    expect(vault.store).toHaveBeenCalledWith(
      "Manager@Example.com",
      "refresh-secret"
    );
    expect(
      JSON.parse(window.localStorage.getItem("lab-workflow/session/v2") ?? "{}")
    ).toEqual({
      email: "Manager@Example.com",
      name: "Manager"
    });
    expect(window.localStorage.getItem("lab-workflow/session/v2")).not.toMatch(
      /access-secret|id-secret|refresh-secret/
    );
  });

  it("migrates legacy tokens to the vault and scrubs localStorage first", async () => {
    window.localStorage.setItem(
      "lab-workflow/session/v2",
      JSON.stringify({
        email: "member@example.com",
        name: "Member",
        accessToken: "legacy-access",
        idToken: "legacy-id",
        refreshToken: "legacy-refresh"
      })
    );
    vault.store.mockImplementation(async () => {
      expect(window.localStorage.getItem("lab-workflow/session/v2")).not.toMatch(
        /legacy-access|legacy-id|legacy-refresh/
      );
    });

    await expect(readStoredSessionWithSecrets()).resolves.toEqual({
      email: "member@example.com",
      name: "Member",
      refreshToken: "legacy-refresh"
    });
    expect(vault.store).toHaveBeenCalledWith(
      "member@example.com",
      "legacy-refresh"
    );
  });

  it("removes local metadata even when vault deletion fails", async () => {
    window.localStorage.setItem(
      "lab-workflow/session/v2",
      JSON.stringify({ email: "member@example.com", name: "Member" })
    );
    vault.delete.mockRejectedValue(new Error("keychain locked"));

    await expect(
      clearStoredSessionSecurely("member@example.com")
    ).rejects.toThrow("keychain locked");
    expect(window.localStorage.getItem("lab-workflow/session/v2")).toBeNull();
  });
});

describe("manager dataset cache invalidation", () => {
  it("versions every viewer cache for the mutated admin workbook", () => {
    const managerKey = `${getDatasetCacheKey("admin")}/manager@example.com`;
    const piKey = `${getDatasetCacheKey("admin")}/pi@example.com`;
    writeDatasetCache(managerKey, dataset);
    writeDatasetCache(piKey, dataset);
    writeDatasetCache(`${getDatasetCacheKey("other")}/manager@example.com`, dataset);

    invalidateDatasetCaches("admin", "Roster revision changed.");

    expect(readDatasetCache(managerKey)).toMatchObject({
      cacheStaleReason: "Roster revision changed."
    });
    expect(readDatasetCache(piKey)).toMatchObject({
      cacheStaleReason: "Roster revision changed."
    });
    expect(
      readDatasetCache(`${getDatasetCacheKey("other")}/manager@example.com`)
        ?.cacheStaleReason
    ).toBeUndefined();
  });
});
