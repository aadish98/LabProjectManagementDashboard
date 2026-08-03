import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSessionOrchestration } from "./useSessionOrchestration";
import { GoogleTokenBrokerError } from "../auth/googleTokenBroker";

const identity = vi.hoisted(() => ({
  getFreshSession: vi.fn(),
  revokeGoogleSession: vi.fn(),
  signInWithGoogle: vi.fn()
}));

const cache = vi.hoisted(() => ({
  clearStoredSessionSecurely: vi.fn(),
  readStoredConfig: vi.fn(),
  readStoredSessionWithSecrets: vi.fn(),
  writeStoredConfig: vi.fn(),
  writeStoredSessionSecurely: vi.fn()
}));

vi.mock("../auth/googleIdentity", () => identity);
vi.mock("../services/cache", () => cache);

const storedSession = {
  email: "manager@example.com",
  name: "Manager",
  refreshToken: "refresh-token"
};

const freshSession = {
  ...storedSession,
  accessToken: "access-token",
  idToken: "id-token",
  accessTokenExpiresAt: Date.now() + 3600_000
};

function callbacks() {
  return {
    onSessionStarted: vi.fn(),
    onSessionCleared: vi.fn(),
    onAuthError: vi.fn()
  };
}

beforeEach(() => {
  cache.readStoredConfig.mockReset().mockReturnValue({
    googleClientId: "client-id",
    googleApiKey: "key",
    googleAppId: "app"
  });
  cache.readStoredSessionWithSecrets.mockReset().mockResolvedValue(storedSession);
  cache.writeStoredConfig.mockReset();
  cache.writeStoredSessionSecurely.mockReset().mockResolvedValue(undefined);
  cache.clearStoredSessionSecurely.mockReset().mockResolvedValue(undefined);
  identity.getFreshSession.mockReset().mockResolvedValue(freshSession);
  identity.revokeGoogleSession.mockReset().mockResolvedValue(undefined);
  identity.signInWithGoogle.mockReset().mockResolvedValue(freshSession);
});

describe("secure session orchestration", () => {
  it("keeps the session empty while vault hydration is pending", async () => {
    let resolveStored!: (value: typeof storedSession) => void;
    cache.readStoredSessionWithSecrets.mockReturnValue(
      new Promise((resolve) => {
        resolveStored = resolve;
      })
    );
    const handlers = callbacks();
    const { result } = renderHook(() => useSessionOrchestration(handlers));

    expect(result.current.sessionLoading).toBe(true);
    expect(result.current.session).toBeNull();

    resolveStored(storedSession);
    await waitFor(() => expect(result.current.sessionLoading).toBe(false));

    expect(result.current.session).toEqual(freshSession);
    expect(cache.writeStoredSessionSecurely).toHaveBeenCalledWith(freshSession);
    expect(handlers.onSessionStarted).toHaveBeenCalledOnce();
  });

  it("clears local and vault state even when Google revocation fails", async () => {
    identity.revokeGoogleSession.mockRejectedValue(new Error("offline"));
    const handlers = callbacks();
    const { result } = renderHook(() => useSessionOrchestration(handlers));
    await waitFor(() => expect(result.current.session).toEqual(freshSession));

    await act(async () => {
      await result.current.signOut();
    });

    expect(result.current.session).toBeNull();
    expect(identity.revokeGoogleSession).toHaveBeenCalledWith(freshSession);
    expect(cache.clearStoredSessionSecurely).toHaveBeenCalledWith(
      "manager@example.com"
    );
    expect(result.current.authNotice).toMatch(/revocation could not be confirmed/i);
  });

  it("persists refreshed secrets before running an authenticated operation", async () => {
    const handlers = callbacks();
    const { result } = renderHook(() => useSessionOrchestration(handlers));
    await waitFor(() => expect(result.current.session).toEqual(freshSession));

    const rotatedSession = {
      ...freshSession,
      accessToken: "rotated-access",
      idToken: "rotated-id",
      refreshToken: "rotated-refresh"
    };
    const order: string[] = [];
    identity.getFreshSession.mockResolvedValue(rotatedSession);
    cache.writeStoredSessionSecurely.mockImplementation(async () => {
      order.push("persist");
    });

    await act(async () => {
      await result.current.withFreshSession(async () => {
        order.push("operate");
      });
    });

    expect(order).toEqual(["persist", "operate"]);
    expect(result.current.session).toEqual(rotatedSession);
  });

  it("clears vault credentials during fresh-sign-in recovery", async () => {
    const handlers = callbacks();
    const { result } = renderHook(() => useSessionOrchestration(handlers));
    await waitFor(() => expect(result.current.session).toEqual(freshSession));

    act(() => result.current.requireFreshGoogleSignIn());

    expect(result.current.session).toBeNull();
    await waitFor(() =>
      expect(cache.clearStoredSessionSecurely).toHaveBeenCalledWith(
        "manager@example.com"
      )
    );
  });

  // A transient broker/Google outage previously wiped the keychain refresh
  // token, forcing every user through full re-consent. These fence that off.
  describe("transient sign-in service failures", () => {
    const retryable = new GoogleTokenBrokerError({
      code: "GOOGLE_TOKEN_ENDPOINT_UNAVAILABLE",
      message: "The sign-in service is unreachable.",
      action: "Retry in a moment.",
      retryable: true
    });
    const terminal = new GoogleTokenBrokerError({
      code: "GOOGLE_GRANT_REJECTED",
      message: "Google rejected the sign-in credential.",
      action: "Sign in again.",
      retryable: false
    });

    it("keeps the vault when hydration hits a retryable failure", async () => {
      identity.getFreshSession.mockRejectedValue(retryable);
      const handlers = callbacks();
      const { result } = renderHook(() => useSessionOrchestration(handlers));

      await waitFor(() => expect(result.current.sessionLoading).toBe(false));
      expect(result.current.session).toBeNull();
      expect(cache.clearStoredSessionSecurely).not.toHaveBeenCalled();
      expect(result.current.authNotice).toContain("saved sign-in was kept");
    });

    it("still clears the vault when hydration hits a rejected credential", async () => {
      identity.getFreshSession.mockRejectedValue(terminal);
      const handlers = callbacks();
      const { result } = renderHook(() => useSessionOrchestration(handlers));

      await waitFor(() => expect(result.current.sessionLoading).toBe(false));
      await waitFor(() =>
        expect(cache.clearStoredSessionSecurely).toHaveBeenCalledWith(
          "manager@example.com"
        )
      );
      expect(result.current.authNotice).toBe(
        "Google needs a fresh sign-in to continue."
      );
    });

    it("keeps the vault when withFreshSession hits a retryable failure", async () => {
      const handlers = callbacks();
      const { result } = renderHook(() => useSessionOrchestration(handlers));
      await waitFor(() => expect(result.current.session).toEqual(freshSession));
      cache.clearStoredSessionSecurely.mockClear();

      identity.getFreshSession.mockRejectedValue(retryable);
      await act(async () => {
        await expect(
          result.current.withFreshSession(async () => "unreachable")
        ).rejects.toThrow();
      });

      expect(cache.clearStoredSessionSecurely).not.toHaveBeenCalled();
      expect(result.current.authNotice).toContain("saved sign-in was kept");
    });

    it("still clears the vault when withFreshSession hits a rejected credential", async () => {
      const handlers = callbacks();
      const { result } = renderHook(() => useSessionOrchestration(handlers));
      await waitFor(() => expect(result.current.session).toEqual(freshSession));
      cache.clearStoredSessionSecurely.mockClear();

      identity.getFreshSession.mockRejectedValue(terminal);
      await act(async () => {
        await expect(
          result.current.withFreshSession(async () => "unreachable")
        ).rejects.toThrow();
      });

      await waitFor(() =>
        expect(cache.clearStoredSessionSecurely).toHaveBeenCalledWith(
          "manager@example.com"
        )
      );
    });
  });
});
