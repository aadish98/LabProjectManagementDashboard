import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DashboardDataset } from "../domain/experiment";
import type { Membership } from "../domain/onboarding";
import { useDatasetSync } from "./useDatasetSync";

const sheets = vi.hoisted(() => ({
  loadGoogleSheetsDataset: vi.fn()
}));

vi.mock("../services/sheets/dataset", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/sheets/dataset")>()),
  loadGoogleSheetsDataset: sheets.loadGoogleSheetsDataset
}));

const dataset: DashboardDataset = {
  source: "googleSheets",
  registry: [],
  experiments: [],
  runLog: [],
  feedbackThreads: [],
  roleDirectory: [],
  lastSyncedAt: "2026-07-14T12:00:00.000Z"
};

beforeEach(() => {
  vi.clearAllMocks();
  sheets.loadGoogleSheetsDataset.mockResolvedValue(dataset);
});

describe("manager dataset refresh", () => {
  it("preserves the current scoped dataset when refresh fails", async () => {
    sheets.loadGoogleSheetsDataset.mockRejectedValueOnce(new Error("offline"));
    const setDataset = vi.fn();
    const setDatasetScope = vi.fn();
    const session = {
      email: "manager@example.com",
      name: "Manager",
      accessToken: "token",
      idToken: "id-token"
    };
    const { result } = renderHook(() =>
      useDatasetSync({
        session,
        sessionEmailKey: session.email,
        viewer: {
          role: "manager",
          accessibleLabMembers: [],
          reason: "verified",
          source: "backendMembership"
        },
        activeLabId: "lab-1",
        loadAuthoritativeManagerMembers: vi.fn().mockResolvedValue([]),
        onboardingReady: true,
        employeePrefs: null,
        employeeLabMember: "",
        activeDataset: dataset,
        datasetScope: { role: "manager", email: session.email },
        previousEmployeePrefsRef: { current: "" },
        withFreshSession: async (operation) => operation(session),
        requireFreshGoogleSignIn: vi.fn(),
        setDataset,
        setDatasetScope,
        setLoading: vi.fn(),
        setStatus: vi.fn(),
        setEmployeeForceSetup: vi.fn(),
        setManagerFileAccessIssue: vi.fn()
      })
    );

    await act(async () => {
      expect(await result.current.loadManagerData()).toBeNull();
    });

    expect(setDataset).not.toHaveBeenCalled();
    expect(setDatasetScope).not.toHaveBeenCalled();
  });

  it("fetches fresh backend member configs for every manager load", async () => {
    const session = {
      email: "manager@example.com",
      name: "Manager",
      accessToken: "token",
      idToken: "id-token"
    };
    const first = [
      { member: { id: "member-1" }, config: { activeSheetName: "Old" } }
    ] as unknown as Array<Pick<Membership, "member" | "config">>;
    const second = [
      { member: { id: "member-1" }, config: { activeSheetName: "New" } }
    ] as unknown as Array<Pick<Membership, "member" | "config">>;
    const loadAuthoritativeManagerMembers = vi
      .fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);
    const { result } = renderHook(() =>
      useDatasetSync({
        session,
        sessionEmailKey: session.email,
        viewer: {
          role: "manager",
          accessibleLabMembers: [],
          reason: "verified",
          source: "backendMembership"
        },
        activeLabId: "lab-1",
        loadAuthoritativeManagerMembers,
        onboardingReady: true,
        employeePrefs: null,
        employeeLabMember: "",
        activeDataset: dataset,
        datasetScope: { role: "manager", email: session.email },
        previousEmployeePrefsRef: { current: "" },
        withFreshSession: async (operation) => operation(session),
        requireFreshGoogleSignIn: vi.fn(),
        setDataset: vi.fn(),
        setDatasetScope: vi.fn(),
        setLoading: vi.fn(),
        setStatus: vi.fn(),
        setEmployeeForceSetup: vi.fn(),
        setManagerFileAccessIssue: vi.fn()
      })
    );

    await act(async () => {
      await result.current.loadManagerData();
      await result.current.loadManagerData();
    });

    expect(loadAuthoritativeManagerMembers).toHaveBeenCalledTimes(2);
    expect(sheets.loadGoogleSheetsDataset.mock.calls[0]?.[1]).toMatchObject({
      authoritativeMembers: first
    });
    expect(sheets.loadGoogleSheetsDataset.mock.calls[1]?.[1]).toMatchObject({
      authoritativeMembers: second
    });
  });
});
