import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { markDatasetStale } from "./app/datasetState";

const session = vi.hoisted(() => ({
  email: "manager@example.com",
  name: "Manager",
  accessToken: "token",
  idToken: "id-token",
  refreshToken: "refresh-token"
}));
const readStoredSessionWithSecrets = vi.hoisted(() => vi.fn());

vi.mock("./services/cache", async (importOriginal) => {
  const original = await importOriginal<typeof import("./services/cache")>();
  return {
    ...original,
    readStoredConfig: () => ({
      googleClientId: "client",
      googleApiKey: "key",
      googleAppId: "app"
    }),
    readStoredSessionWithSecrets,
    writeStoredConfig: vi.fn(),
    writeStoredSessionSecurely: vi.fn().mockResolvedValue(undefined),
    clearStoredSessionSecurely: vi.fn().mockResolvedValue(undefined)
  };
});

vi.mock("./auth/googleIdentity", () => ({
  getFreshSession: vi.fn().mockResolvedValue(session),
  revokeGoogleSession: vi.fn().mockResolvedValue(undefined),
  signInWithGoogle: vi.fn()
}));

vi.mock("./services/onboardingApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./services/onboardingApi")>()),
  BACKEND_BASE_URL: ""
}));

beforeEach(() => {
  readStoredSessionWithSecrets.mockReset().mockResolvedValue(session);
});

describe("App access check", () => {
  it("marks the in-memory dataset stale immediately", () => {
    const dataset = {
      source: "googleSheets" as const,
      registry: [],
      experiments: [],
      runLog: [],
      feedbackThreads: [],
      roleDirectory: [],
      lastSyncedAt: "2026-07-14T12:00:00.000Z"
    };
    expect(
      markDatasetStale(
        dataset,
        "Team configuration changed.",
        "2026-07-14T20:00:00.000Z"
      )
    ).toMatchObject({
      cacheStaleReason: "Team configuration changed.",
      cacheInvalidatedAt: "2026-07-14T20:00:00.000Z",
      experiments: []
    });
  });

  it("shows only a non-privileged loading screen during vault hydration", () => {
    readStoredSessionWithSecrets.mockReturnValue(
      new Promise(() => undefined)
    );

    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Checking app access" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Manager dashboard" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Team setup" })).not.toBeInTheDocument();
  });

  it("shows an explicit backend configuration diagnostic without inferred access", async () => {
    render(<App />);

    expect(
      await screen.findByText(/authoritative onboarding service is not configured/i)
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Manager dashboard" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Team setup" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open setup" })).not.toBeInTheDocument();
  });
});
