import type { UserSession } from "../domain/app";
import { tauriAuthPlatform } from "../platform/tauri/auth";
import { GOOGLE_WORKSPACE_SCOPES } from "../services/sheets/client";
import {
  AUTHORIZATION_CODE_PATH,
  REFRESH_PATH,
  requestBrokeredToken,
  type BrokeredTokens
} from "./googleTokenBroker";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";
const OAUTH_PORT = 53682;
const OAUTH_REDIRECT_URI = `http://127.0.0.1:${OAUTH_PORT}`;
const TOKEN_REFRESH_BUFFER_MS = 60_000;
const OAUTH_TIMEOUT_MS = 120_000;

type GoogleProfileResponse = {
  email?: string;
  name?: string;
};

export interface GoogleSignInOptions {
  /**
   * Google generally returns a refresh token on the first authorization.
   * Request consent again only when the vault has no usable refresh token.
   */
  forceConsent?: boolean;
}

function assertConfiguredClientId(clientId: string): string {
  const trimmed = clientId.trim();
  if (!trimmed) {
    throw new Error("Add the desktop app's Google OAuth client ID in Setup before signing in.");
  }
  return trimmed;
}

function base64UrlEncode(bytes: Uint8Array): string {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomBase64Url(byteCount: number): string {
  const bytes = new Uint8Array(byteCount);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function createCodeChallenge(codeVerifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));
  return base64UrlEncode(new Uint8Array(digest));
}

export function buildGoogleAuthUrl(
  clientId: string,
  codeChallenge: string,
  state: string,
  forceConsent: boolean
): string {
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", OAUTH_REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_WORKSPACE_SCOPES);
  url.searchParams.set("access_type", "offline");
  if (forceConsent) {
    url.searchParams.set("prompt", "consent");
  }
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  return url.toString();
}

async function waitForOAuthRedirect(authUrl: string): Promise<string> {
  return tauriAuthPlatform.waitForOAuthRedirect({
    authorizationUrl: authUrl,
    port: OAUTH_PORT,
    timeoutMs: OAUTH_TIMEOUT_MS
  });
}

export function extractAuthorizationCode(redirectUrl: string, expectedState: string): string {
  const url = new URL(redirectUrl);
  const expectedRedirect = new URL(OAUTH_REDIRECT_URI);
  if (
    url.protocol !== expectedRedirect.protocol ||
    url.hostname !== expectedRedirect.hostname ||
    url.port !== expectedRedirect.port ||
    url.pathname !== expectedRedirect.pathname ||
    url.username ||
    url.password ||
    url.hash
  ) {
    throw new Error("Google sign-in returned to an unexpected callback address.");
  }
  const error = url.searchParams.get("error");
  if (error) {
    const description = url.searchParams.get("error_description");
    throw new Error(description ? `Google OAuth error: ${description}` : `Google OAuth error: ${error}`);
  }

  const state = url.searchParams.get("state");
  if (!state || state !== expectedState) {
    throw new Error("Google sign-in returned an invalid state value.");
  }

  const code = url.searchParams.get("code");
  if (!code) {
    throw new Error("Google sign-in did not return an authorization code.");
  }

  return code;
}

/**
 * Payload for the backend broker, which injects client_secret server-side.
 * Kept exported and pure so tests can assert no secret is ever present here.
 */
export function buildAuthorizationCodeTokenRequest(
  clientId: string,
  code: string,
  codeVerifier: string
): Record<string, string> {
  return {
    clientId: assertConfiguredClientId(clientId),
    code,
    codeVerifier,
    redirectUri: OAUTH_REDIRECT_URI
  };
}

export function buildRefreshTokenRequest(
  clientId: string,
  refreshToken: string
): Record<string, string> {
  return {
    clientId: assertConfiguredClientId(clientId),
    refreshToken
  };
}

async function fetchGoogleProfile(accessToken: string): Promise<GoogleProfileResponse> {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as GoogleProfileResponse;
}

function expiresAtFromToken(token: BrokeredTokens): number | undefined {
  return typeof token.expiresInSeconds === "number"
    ? Date.now() + token.expiresInSeconds * 1000
    : undefined;
}

export async function signInWithGoogle(
  clientId: string,
  options: GoogleSignInOptions = {}
): Promise<UserSession> {
  const configuredClientId = assertConfiguredClientId(clientId);
  const codeVerifier = randomBase64Url(32);
  const codeChallenge = await createCodeChallenge(codeVerifier);
  const state = randomBase64Url(32);
  const authUrl = buildGoogleAuthUrl(
    configuredClientId,
    codeChallenge,
    state,
    options.forceConsent === true
  );
  const redirectUrl = await waitForOAuthRedirect(authUrl);
  const code = extractAuthorizationCode(redirectUrl, state);

  const token = await requestBrokeredToken(
    AUTHORIZATION_CODE_PATH,
    buildAuthorizationCodeTokenRequest(configuredClientId, code, codeVerifier)
  );
  if (!token.refreshToken) {
    if (options.forceConsent !== true) {
      return signInWithGoogle(configuredClientId, { forceConsent: true });
    }
    throw new Error(
      "Google did not return a refresh token after consent. Revoke the app in Google Account permissions, then try again."
    );
  }
  if (!token.idToken) {
    throw new Error("Google did not return an ID token for backend verification.");
  }
  const profile = await fetchGoogleProfile(token.accessToken);

  if (!profile.email) {
    throw new Error("Google profile did not include an email address.");
  }

  return {
    email: profile.email,
    name: profile.name ?? profile.email,
    accessToken: token.accessToken,
    idToken: token.idToken,
    refreshToken: token.refreshToken,
    accessTokenExpiresAt: expiresAtFromToken(token)
  };
}

export async function refreshGoogleAccessToken(
  clientId: string,
  refreshToken: string
): Promise<
  Pick<UserSession, "accessToken" | "idToken" | "refreshToken" | "accessTokenExpiresAt">
> {
  const configuredClientId = assertConfiguredClientId(clientId);
  if (!refreshToken.trim()) {
    throw new Error("Google needs a fresh sign-in to continue.");
  }

  const token = await requestBrokeredToken(
    REFRESH_PATH,
    buildRefreshTokenRequest(configuredClientId, refreshToken)
  );
  if (!token.idToken) {
    throw new Error("Google did not return a refreshed ID token for backend verification.");
  }

  return {
    accessToken: token.accessToken,
    idToken: token.idToken,
    refreshToken: token.refreshToken ?? refreshToken,
    accessTokenExpiresAt: expiresAtFromToken(token)
  };
}

export async function getFreshSession(
  session: UserSession,
  clientId: string
): Promise<UserSession> {
  const hasValidAccessToken =
    session.accessToken &&
    session.idToken &&
    (!session.accessTokenExpiresAt ||
      session.accessTokenExpiresAt - Date.now() > TOKEN_REFRESH_BUFFER_MS);

  if (hasValidAccessToken) {
    return session;
  }

  if (!session.refreshToken) {
    throw new Error("Google needs a fresh sign-in to continue.");
  }

  const refreshed = await refreshGoogleAccessToken(clientId, session.refreshToken);
  return {
    ...session,
    accessToken: refreshed.accessToken,
    idToken: refreshed.idToken ?? session.idToken,
    refreshToken: refreshed.refreshToken ?? session.refreshToken,
    accessTokenExpiresAt: refreshed.accessTokenExpiresAt
  };
}

export async function revokeGoogleSession(
  session: Pick<UserSession, "accessToken" | "refreshToken">,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  // Revoking a refresh token also revokes its associated access tokens.
  // Fall back to the access token for sessions that never received one.
  const token = session.refreshToken || session.accessToken;
  if (!token) return;

  const body = new URLSearchParams({ token });
  const response = await fetchImpl(GOOGLE_REVOKE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });
  if (!response.ok) {
    throw new Error(`Google token revocation failed with HTTP ${response.status}.`);
  }
}
