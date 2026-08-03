import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildAuthorizationCodeTokenRequest,
  buildGoogleAuthUrl,
  buildRefreshTokenRequest,
  extractAuthorizationCode,
  getFreshSession,
  refreshGoogleAccessToken,
  revokeGoogleSession,
  signInWithGoogle
} from "./googleIdentity";
import { GoogleTokenBrokerError } from "./googleTokenBroker";
import { tauriAuthPlatform } from "../platform/tauri/auth";

vi.mock("../services/backendBaseUrl", () => ({
  BACKEND_BASE_URL: "https://backend.test"
}));

const BROKER_ORIGIN = "https://backend.test";

function tokenResponse(payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Google desktop identity", () => {
  it("requests only required scopes and adds consent conditionally", () => {
    const normal = new URL(
      buildGoogleAuthUrl("client-id", "challenge", "state", false)
    );
    expect(new Set(normal.searchParams.get("scope")?.split(" "))).toEqual(
      new Set([
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/drive.file"
      ])
    );
    expect(normal.searchParams.has("prompt")).toBe(false);
    expect(normal.origin).toBe("https://accounts.google.com");
    expect(normal.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:53682");
    expect(normal.searchParams.get("response_type")).toBe("code");
    expect(normal.searchParams.get("access_type")).toBe("offline");
    expect(normal.searchParams.get("code_challenge")).toBe("challenge");
    expect(normal.searchParams.get("code_challenge_method")).toBe("S256");
    expect(normal.searchParams.get("state")).toBe("state");

    const forced = new URL(
      buildGoogleAuthUrl("client-id", "challenge", "state", true)
    );
    expect(forced.searchParams.get("prompt")).toBe("consent");
  });

  it("accepts only the fixed loopback callback and matching state", () => {
    expect(
      extractAuthorizationCode(
        "http://127.0.0.1:53682/?code=authorization-code&state=expected",
        "expected"
      )
    ).toBe("authorization-code");
    expect(() =>
      extractAuthorizationCode(
        "http://localhost:53682/?code=authorization-code&state=expected",
        "expected"
      )
    ).toThrow(/unexpected callback address/i);
    expect(() =>
      extractAuthorizationCode(
        "http://127.0.0.1:53682/?code=authorization-code&state=wrong",
        "expected"
      )
    ).toThrow(/invalid state/i);
  });

  it("builds broker payloads that carry no client secret", () => {
    const exchange = buildAuthorizationCodeTokenRequest(
      "client-id",
      "authorization-code",
      "verifier"
    );
    expect(exchange).toEqual({
      clientId: "client-id",
      code: "authorization-code",
      codeVerifier: "verifier",
      redirectUri: "http://127.0.0.1:53682"
    });

    const refresh = buildRefreshTokenRequest("client-id", "refresh-token");
    expect(refresh).toEqual({
      clientId: "client-id",
      refreshToken: "refresh-token"
    });

    for (const payload of [exchange, refresh]) {
      expect(payload).not.toHaveProperty("client_secret");
      expect(payload).not.toHaveProperty("clientSecret");
      expect(JSON.stringify(payload)).not.toContain("GOCSPX");
    }
  });

  it("captures a refreshed ID token and keeps the refresh token", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        tokenResponse({ accessToken: "new-access", idToken: "new-id", expiresInSeconds: 3600 })
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      refreshGoogleAccessToken("client-id", "refresh-token")
    ).resolves.toMatchObject({
      accessToken: "new-access",
      idToken: "new-id",
      refreshToken: "refresh-token"
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BROKER_ORIGIN}/auth/google/token/refresh`);
    expect(init.method).toBe("POST");
    expect(String(init.body)).not.toContain("GOCSPX");
  });

  it("surfaces a retryable broker failure so the caller can keep its refresh token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: "GOOGLE_TOKEN_ENDPOINT_UNAVAILABLE",
              message: "unreachable",
              action: "Retry.",
              retryable: true
            }
          }),
          { status: 503, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    const error = await refreshGoogleAccessToken("client-id", "refresh-token").catch(
      (thrown: unknown) => thrown
    );
    expect(error).toBeInstanceOf(GoogleTokenBrokerError);
    expect(error).toMatchObject({ retryable: true });
  });

  it("marks a rejected grant terminal", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: "GOOGLE_GRANT_REJECTED",
              message: "Google rejected the sign-in credential.",
              action: "Sign in again.",
              retryable: false
            }
          }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    const error = await refreshGoogleAccessToken("client-id", "refresh-token").catch(
      (thrown: unknown) => thrown
    );
    expect(error).toMatchObject({ code: "GOOGLE_GRANT_REJECTED", retryable: false });
  });

  it("captures the initial ID token and requests consent only after a missing refresh token", async () => {
    const authorizationUrls: string[] = [];
    vi.spyOn(tauriAuthPlatform, "waitForOAuthRedirect").mockImplementation(
      async ({ authorizationUrl }) => {
        authorizationUrls.push(authorizationUrl);
        const state = new URL(authorizationUrl).searchParams.get("state");
        return `http://127.0.0.1:53682/?code=authorization-code&state=${state}`;
      }
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        tokenResponse({
          accessToken: "first-access",
          idToken: "first-id",
          expiresInSeconds: 3600
        })
      )
      .mockResolvedValueOnce(
        tokenResponse({
          accessToken: "second-access",
          idToken: "second-id",
          refreshToken: "refresh-token",
          expiresInSeconds: 3600
        })
      )
      .mockResolvedValueOnce(
        tokenResponse({ email: "member@example.com", name: "Member" })
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(signInWithGoogle("client-id")).resolves.toMatchObject({
      email: "member@example.com",
      accessToken: "second-access",
      idToken: "second-id",
      refreshToken: "refresh-token"
    });
    expect(authorizationUrls).toHaveLength(2);
    expect(new URL(authorizationUrls[0]).searchParams.has("prompt")).toBe(false);
    expect(new URL(authorizationUrls[1]).searchParams.get("prompt")).toBe("consent");

    // Both exchanges go to the broker, never to Google's token endpoint.
    const exchangeCalls = fetchMock.mock.calls.slice(0, 2) as [string, RequestInit][];
    for (const [url, init] of exchangeCalls) {
      expect(url).toBe(`${BROKER_ORIGIN}/auth/google/token/authorization-code`);
      expect(String(init.body)).not.toContain("GOCSPX");
    }
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes("oauth2.googleapis.com/token"))
    ).toBe(false);
  });

  it("refreshes when an access token exists without an ID token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        tokenResponse({ accessToken: "new-access", idToken: "new-id", expiresInSeconds: 3600 })
      )
    );

    await expect(
      getFreshSession(
        {
          email: "member@example.com",
          name: "Member",
          accessToken: "still-valid-access",
          refreshToken: "refresh-token",
          accessTokenExpiresAt: Date.now() + 3600_000
        },
        "client-id"
      )
    ).resolves.toMatchObject({
      accessToken: "new-access",
      idToken: "new-id"
    });
  });

  it("honours the 60s refresh buffer", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        tokenResponse({ accessToken: "new-access", idToken: "new-id", expiresInSeconds: 3600 })
      );
    vi.stubGlobal("fetch", fetchMock);
    const base = {
      email: "member@example.com",
      name: "Member",
      accessToken: "current-access",
      idToken: "current-id",
      refreshToken: "refresh-token"
    };

    const stillValid = await getFreshSession(
      { ...base, accessTokenExpiresAt: Date.now() + 90_000 },
      "client-id"
    );
    expect(stillValid.accessToken).toBe("current-access");
    expect(fetchMock).not.toHaveBeenCalled();

    const nearExpiry = await getFreshSession(
      { ...base, accessTokenExpiresAt: Date.now() + 30_000 },
      "client-id"
    );
    expect(nearExpiry.accessToken).toBe("new-access");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("revokes the refresh token in preference to the access token", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));

    await revokeGoogleSession(
      { accessToken: "access-token", refreshToken: "refresh-token" },
      fetchImpl
    );

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(String(init.body)).toBe("token=refresh-token");
  });
});
