import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppConfig, UserSession } from "../domain/app";
import type { DashboardDataset, MemberLoadIssue } from "../domain/experiment";
import { OnboardingApiError } from "../services/onboardingApi";
import { useMemberLoadRecovery } from "./useMemberLoadRecovery";

const mocks = vi.hoisted(() => ({
  openSpreadsheetPicker: vi.fn(),
  listMembers: vi.fn(),
  deactivateMember: vi.fn(),
  invalidateDatasetCaches: vi.fn()
}));

vi.mock("../services/googleDrivePicker", () => ({
  openSpreadsheetPicker: mocks.openSpreadsheetPicker
}));

vi.mock("../services/cache", () => ({
  invalidateDatasetCaches: mocks.invalidateDatasetCaches
}));

vi.mock("../services/onboardingApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/onboardingApi")>();
  return {
    ...actual,
    OnboardingApi: class {
      listMembers = mocks.listMembers;
      deactivateMember = mocks.deactivateMember;
    }
  };
});

const session: UserSession = {
  email: "manager@example.com",
  name: "Manager",
  accessToken: "access-token",
  idToken: "id-token"
};

const config: AppConfig = {
  adminSpreadsheetId: "https://docs.google.com/spreadsheets/d/admin-sheet/edit",
  googleClientId: "client",
  googleApiKey: "api-key",
  googleAppId: "app-id"
};

const issue: MemberLoadIssue = {
  memberId: "member-grace",
  labMember: "Grace",
  taskLogUrl: "https://docs.google.com/spreadsheets/d/grace-sheet/edit",
  activeSheetName: "Tasks",
  code: "pickerGrant",
  message: "Drive Picker access is required.",
  status: 403
};

function dataset(memberLoadIssues?: MemberLoadIssue[]): DashboardDataset {
  return {
    source: "googleSheets",
    registry: [],
    experiments: [],
    runLog: [],
    feedbackThreads: [],
    roleDirectory: [],
    lastSyncedAt: "2026-07-15T12:00:00.000Z",
    memberLoadIssues
  };
}

function renderRecovery(
  overrides: Partial<Parameters<typeof useMemberLoadRecovery>[0]> = {}
) {
  const setStatus = vi.fn();
  const loadManagerData = vi.fn().mockResolvedValue(dataset());
  const probeAdminAccess = vi.fn().mockResolvedValue(undefined);
  const invalidateMemberConfigCache = vi.fn();
  const requireFreshGoogleSignIn = vi.fn();
  const withFreshSession = vi.fn(async (operation) => operation(session));
  const options: Parameters<typeof useMemberLoadRecovery>[0] = {
    session,
    config,
    activeLabId: "lab-1",
    withFreshSession,
    requireFreshGoogleSignIn,
    loadManagerData,
    probeAdminAccess,
    invalidateMemberConfigCache,
    setStatus,
    ...overrides
  };
  return {
    ...renderHook(() => useMemberLoadRecovery(options)),
    setStatus,
    loadManagerData,
    probeAdminAccess,
    invalidateMemberConfigCache,
    requireFreshGoogleSignIn,
    withFreshSession
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listMembers.mockResolvedValue({
    members: [
      {
        id: issue.memberId,
        active: true,
        revision: 17
      }
    ]
  });
  mocks.deactivateMember.mockResolvedValue({
    member: { id: issue.memberId, active: false, revision: 18 }
  });
});

describe("useMemberLoadRecovery", () => {
  it("accepts only the exact Picker spreadsheet ID and reloads the member", async () => {
    mocks.openSpreadsheetPicker.mockResolvedValue([
      {
        id: "grace-sheet",
        name: "Grace Task Log",
        url: issue.taskLogUrl
      }
    ]);
    const recovery = renderRecovery();

    await act(() => recovery.result.current.grantAndVerify(issue));

    expect(mocks.openSpreadsheetPicker).toHaveBeenCalledWith(
      expect.objectContaining({
        multiselect: false,
        query: "grace-sheet"
      })
    );
    expect(recovery.loadManagerData).toHaveBeenCalledOnce();
    expect(recovery.setStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({
        kind: "success",
        operation: "reloadAfterPickerGrant"
      })
    );
    expect(recovery.result.current.busyKey).toBeNull();
  });

  it("treats Picker cancellation and a wrong file as non-mutating outcomes", async () => {
    mocks.openSpreadsheetPicker.mockResolvedValueOnce([]);
    const recovery = renderRecovery();

    await act(() => recovery.result.current.grantAndVerify(issue));

    expect(recovery.loadManagerData).not.toHaveBeenCalled();
    expect(recovery.setStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({
        kind: "info",
        operation: "grantMemberTaskLogAccess"
      })
    );

    mocks.openSpreadsheetPicker.mockResolvedValueOnce([
      { id: "wrong-sheet", name: "Wrong", url: "wrong" }
    ]);
    await act(() => recovery.result.current.grantAndVerify(issue));

    expect(recovery.loadManagerData).not.toHaveBeenCalled();
    expect(recovery.setStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({
        kind: "error",
        errorCode: "PICKER_FILE_MISMATCH",
        operation: "verifyMemberTaskLogPicker"
      })
    );
  });

  it("reports retry persistence and errors without hiding the current dataset", async () => {
    const loadManagerData = vi
      .fn()
      .mockResolvedValueOnce(dataset([{ ...issue, message: "Still unavailable." }]))
      .mockRejectedValueOnce(new Error("network unavailable"));
    const recovery = renderRecovery({ loadManagerData });

    await act(() => recovery.result.current.retry(issue));
    expect(recovery.setStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({
        kind: "info",
        errorCode: "pickerGrant",
        operation: "retryMemberTaskLog"
      })
    );

    await act(() => recovery.result.current.retry(issue));
    expect(recovery.setStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({
        kind: "error",
        text: "network unavailable",
        operation: "retryMemberTaskLog"
      })
    );
  });

  it("fetches the current revision before backend deactivation, invalidates, and reloads", async () => {
    const recovery = renderRecovery();

    await act(() => recovery.result.current.deactivate(issue));

    expect(mocks.listMembers).toHaveBeenCalledWith("lab-1");
    expect(mocks.deactivateMember).toHaveBeenCalledWith(
      "lab-1",
      issue.memberId,
      17
    );
    expect(mocks.invalidateDatasetCaches).toHaveBeenCalledWith(
      "admin-sheet",
      "Grace was deactivated in the authoritative backend."
    );
    expect(recovery.invalidateMemberConfigCache).toHaveBeenCalledOnce();
    expect(recovery.probeAdminAccess).toHaveBeenCalledOnce();
    expect(recovery.loadManagerData).toHaveBeenCalledOnce();
    expect(mocks.listMembers.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.deactivateMember.mock.invocationCallOrder[0]!
    );
    expect(mocks.deactivateMember.mock.invocationCallOrder[0]).toBeLessThan(
      recovery.loadManagerData.mock.invocationCallOrder[0]!
    );
    expect(recovery.setStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({
        kind: "success",
        operation: "deactivateMember"
      })
    );
  });

  it("fails closed on missing auth and preserves backend error diagnostics", async () => {
    const requireFreshGoogleSignIn = vi.fn();
    const unauthenticatedSession = { ...session, idToken: undefined };
    const recovery = renderRecovery({
      withFreshSession: async (operation) => operation(unauthenticatedSession),
      requireFreshGoogleSignIn
    });

    await act(() => recovery.result.current.deactivate(issue));
    expect(requireFreshGoogleSignIn).toHaveBeenCalledOnce();
    expect(mocks.listMembers).not.toHaveBeenCalled();
    expect(mocks.deactivateMember).not.toHaveBeenCalled();

    mocks.listMembers.mockRejectedValueOnce(
      new OnboardingApiError({
        kind: "http",
        code: "REVISION_CONFLICT",
        message: "Member changed.",
        action: "Reload and confirm again.",
        status: 409
      })
    );
    const backendFailure = renderRecovery();
    await act(() => backendFailure.result.current.deactivate(issue));

    expect(mocks.deactivateMember).not.toHaveBeenCalled();
    expect(backendFailure.loadManagerData).not.toHaveBeenCalled();
    expect(backendFailure.setStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({
        kind: "error",
        errorCode: "REVISION_CONFLICT",
        httpStatus: 409,
        operation: "deactivateMember"
      })
    );
  });
});
