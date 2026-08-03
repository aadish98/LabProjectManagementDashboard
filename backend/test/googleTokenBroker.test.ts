import { describe, expect, it, vi } from "vitest";
import { GoogleOAuthTokenBroker } from "../src/auth/googleTokenBroker.js";
import { ApiError } from "../src/http/errors.js";

const CLIENT_ID = "1234567890-desktop.apps.googleusercontent.com";
// Deliberately not shaped like a real Google secret so check-token-hygiene.mjs
// does not flag this fixture; it only needs to be a distinctive sentinel.
const CLIENT_SECRET = "test-client-secret-must-never-leak";

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function brokerWith(fetchImpl: typeof fetch): GoogleOAuthTokenBroker {
  return new GoogleOAuthTokenBroker(CLIENT_ID, CLIENT_SECRET, fetchImpl);
}

function sentBody(fetchImpl: ReturnType<typeof vi.fn>): URLSearchParams {
  return fetchImpl.mock.calls[0]?.[1]?.body as URLSearchParams;
}

describe("GoogleOAuthTokenBroker", () => {
  it("sends the authorization-code grant with the server-held secret", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        access_token: "at",
        token_type: "Bearer",
        expires_in: 3599,
        id_token: "it",
        refresh_token: "rt"
      })
    );
    await brokerWith(fetchImpl as unknown as typeof fetch).exchangeAuthorizationCode({
      code: "the-code",
      codeVerifier: "the-verifier",
      redirectUri: "http://127.0.0.1:53682"
    });

    const body = sentBody(fetchImpl);
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("the-code");
    expect(body.get("code_verifier")).toBe("the-verifier");
    expect(body.get("redirect_uri")).toBe("http://127.0.0.1:53682");
    expect(body.get("client_id")).toBe(CLIENT_ID);
    expect(body.get("client_secret")).toBe(CLIENT_SECRET);
  });

  it("sends the refresh grant without a redirect URI", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { access_token: "at", token_type: "Bearer" }));
    await brokerWith(fetchImpl as unknown as typeof fetch).refreshAccessToken({
      refreshToken: "rt"
    });

    const body = sentBody(fetchImpl);
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("rt");
    expect(body.get("redirect_uri")).toBeNull();
    expect(body.get("client_secret")).toBe(CLIENT_SECRET);
  });

  it("whitelists the response and drops unexpected Google fields", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        access_token: "at",
        token_type: "Bearer",
        expires_in: 3599,
        scope: "openid email",
        surprise_field: "should-not-survive"
      })
    );
    const tokens = await brokerWith(
      fetchImpl as unknown as typeof fetch
    ).refreshAccessToken({ refreshToken: "rt" });

    expect(tokens).toEqual({
      accessToken: "at",
      tokenType: "Bearer",
      expiresInSeconds: 3599,
      scope: "openid email"
    });
    expect(Object.keys(tokens)).not.toContain("surprise_field");
  });

  it("classifies invalid_grant as a terminal 401", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(400, {
        error: "invalid_grant",
        error_description: "Token has been expired or revoked."
      })
    );
    const error = await brokerWith(fetchImpl as unknown as typeof fetch)
      .refreshAccessToken({ refreshToken: "rt" })
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401, code: "GOOGLE_GRANT_REJECTED", retryable: false });
    expect((error as ApiError).message).not.toContain("expired or revoked");
  });

  it("classifies invalid_client as a misconfiguration, not a user problem", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(401, { error: "invalid_client" }));
    const error = await brokerWith(fetchImpl as unknown as typeof fetch)
      .refreshAccessToken({ refreshToken: "rt" })
      .catch((thrown: unknown) => thrown);

    expect(error).toMatchObject({
      status: 502,
      code: "TOKEN_BROKER_MISCONFIGURED",
      retryable: false
    });
  });

  it("treats Google 5xx and transport failures as retryable", async () => {
    const serverError = await brokerWith(
      vi.fn().mockResolvedValue(jsonResponse(503, { error: "backend_error" })) as unknown as typeof fetch
    )
      .refreshAccessToken({ refreshToken: "rt" })
      .catch((thrown: unknown) => thrown);
    expect(serverError).toMatchObject({
      status: 503,
      code: "GOOGLE_TOKEN_ENDPOINT_UNAVAILABLE",
      retryable: true
    });

    const aborted = await brokerWith(
      vi.fn().mockRejectedValue(new Error("The operation was aborted")) as unknown as typeof fetch
    )
      .exchangeAuthorizationCode({
        code: "c",
        codeVerifier: "v",
        redirectUri: "http://127.0.0.1:53682"
      })
      .catch((thrown: unknown) => thrown);
    expect(aborted).toMatchObject({
      status: 503,
      code: "GOOGLE_TOKEN_ENDPOINT_UNAVAILABLE",
      retryable: true
    });
  });

  it("never leaks the client secret through a thrown error", async () => {
    const failures = [
      vi.fn().mockRejectedValue(new Error(`boom client_secret=${CLIENT_SECRET}`)),
      vi.fn().mockResolvedValue(jsonResponse(400, { error: "invalid_grant" })),
      vi.fn().mockResolvedValue(jsonResponse(500, { error: "internal" }))
    ];

    for (const fetchImpl of failures) {
      const error = await brokerWith(fetchImpl as unknown as typeof fetch)
        .refreshAccessToken({ refreshToken: "rt" })
        .catch((thrown: unknown) => thrown);
      const serialized = `${(error as Error).message}${(error as Error).stack ?? ""}${JSON.stringify(
        error
      )}`;
      expect(serialized).not.toContain(CLIENT_SECRET);
    }
  });
});
