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
import { tauriAuthPlatform } from "../platform/tauri/auth";

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

  it("sends PKCE token exchange with the Google Desktop client secret", () => {
    const exchange = buildAuthorizationCodeTokenRequest(
      "client-id",
      "authorization-code",
      "verifier",
      "desktop-client-secret"
    );
    expect(Object.fromEntries(exchange)).toEqual({
      client_id: "client-id",
      client_secret: "desktop-client-secret",
      code: "authorization-code",
      code_verifier: "verifier",
      grant_type: "authorization_code",
      redirect_uri: "http://127.0.0.1:53682"
    });

    const refresh = buildRefreshTokenRequest(
      "client-id",
      "refresh-token",
      "desktop-client-secret"
    );
    expect(Object.fromEntries(refresh)).toEqual({
      client_id: "client-id",
      client_secret: "desktop-client-secret",
      grant_type: "refresh_token",
      refresh_token: "refresh-token"
    });
  });

  it("captures a refreshed ID token and keeps the refresh token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            access_token: "new-access",
            id_token: "new-id",
            expires_in: 3600
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        )
      )
    );

    await expect(
      refreshGoogleAccessToken("client-id", "refresh-token", "desktop-client-secret")
    ).resolves.toMatchObject({
      accessToken: "new-access",
      idToken: "new-id",
      refreshToken: "refresh-token"
    });
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
        new Response(
          JSON.stringify({
            access_token: "first-access",
            id_token: "first-id",
            expires_in: 3600
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "second-access",
            id_token: "second-id",
            refresh_token: "refresh-token",
            expires_in: 3600
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ email: "member@example.com", name: "Member" }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      signInWithGoogle("client-id", { clientSecret: "desktop-client-secret" })
    ).resolves.toMatchObject({
      email: "member@example.com",
      accessToken: "second-access",
      idToken: "second-id",
      refreshToken: "refresh-token"
    });
    expect(authorizationUrls).toHaveLength(2);
    expect(new URL(authorizationUrls[0]).searchParams.has("prompt")).toBe(false);
    expect(new URL(authorizationUrls[1]).searchParams.get("prompt")).toBe("consent");
  });

  it("refreshes when an access token exists without an ID token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            access_token: "new-access",
            id_token: "new-id",
            expires_in: 3600
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        )
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
        "client-id",
        "desktop-client-secret"
      )
    ).resolves.toMatchObject({
      accessToken: "new-access",
      idToken: "new-id"
    });
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
