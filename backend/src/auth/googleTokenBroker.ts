import { ApiError } from "../http/errors.js";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_TIMEOUT_MS = 10_000;

/**
 * Must match OAUTH_REDIRECT_URI in src/auth/googleIdentity.ts. The desktop app
 * sends it and the broker pins it, so the coupling fails loudly instead of
 * drifting silently.
 */
export const BROKERED_REDIRECT_URI = "http://127.0.0.1:53682";

export interface BrokeredTokens {
  accessToken: string;
  tokenType: string;
  expiresInSeconds?: number;
  idToken?: string;
  refreshToken?: string;
  scope?: string;
}

export interface AuthorizationCodeGrant {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}

export interface RefreshGrant {
  refreshToken: string;
}

export interface GoogleTokenBroker {
  exchangeAuthorizationCode(grant: AuthorizationCodeGrant): Promise<BrokeredTokens>;
  refreshAccessToken(grant: RefreshGrant): Promise<BrokeredTokens>;
}

interface GoogleTokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  id_token?: string;
  refresh_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

export class GoogleOAuthTokenBroker implements GoogleTokenBroker {
  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  async exchangeAuthorizationCode(grant: AuthorizationCodeGrant): Promise<BrokeredTokens> {
    return this.post("authorization_code", {
      grant_type: "authorization_code",
      code: grant.code,
      code_verifier: grant.codeVerifier,
      redirect_uri: grant.redirectUri
    });
  }

  async refreshAccessToken(grant: RefreshGrant): Promise<BrokeredTokens> {
    return this.post("refresh_token", {
      grant_type: "refresh_token",
      refresh_token: grant.refreshToken
    });
  }

  private async post(
    grant: string,
    fields: Record<string, string>
  ): Promise<BrokeredTokens> {
    const body = new URLSearchParams({
      ...fields,
      client_id: this.clientId,
      client_secret: this.clientSecret
    });

    let response: Response;
    try {
      response = await this.fetchImpl(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS)
      });
    } catch {
      // Never surface the underlying error: its message or stack can echo the
      // request body, which carries the client secret.
      throw unavailable(grant);
    }

    const payload = (await response.json().catch(() => ({}))) as GoogleTokenResponse;
    if (!response.ok || payload.error || !payload.access_token) {
      throw classify(grant, response.status, payload.error);
    }

    // Whitelist: Google's payload is never passed through to the caller.
    return {
      accessToken: payload.access_token,
      tokenType: payload.token_type ?? "Bearer",
      ...(typeof payload.expires_in === "number"
        ? { expiresInSeconds: payload.expires_in }
        : {}),
      ...(payload.id_token ? { idToken: payload.id_token } : {}),
      ...(payload.refresh_token ? { refreshToken: payload.refresh_token } : {}),
      ...(payload.scope ? { scope: payload.scope } : {})
    };
  }
}

function classify(grant: string, status: number, errorCode: string | undefined): ApiError {
  if (status >= 500) return unavailable(grant);

  // The desktop keys its "clear the credential vault" decision off this split,
  // so misclassifying a transient failure as a rejected grant is expensive.
  if (errorCode === "invalid_grant") {
    return new ApiError({
      status: 401,
      code: "GOOGLE_GRANT_REJECTED",
      message: "Google rejected the sign-in credential.",
      action: "Sign in with Google again."
    });
  }
  if (
    errorCode === "invalid_client" ||
    errorCode === "unauthorized_client" ||
    errorCode === "invalid_request"
  ) {
    return new ApiError({
      status: 502,
      code: "TOKEN_BROKER_MISCONFIGURED",
      message: "The service could not authenticate to Google's token endpoint.",
      action:
        "Verify the brokered Google OAuth client ID and the client secret stored in Secret Manager."
    });
  }
  return new ApiError({
    status: 502,
    code: "GOOGLE_TOKEN_EXCHANGE_FAILED",
    message: "Google could not complete the token exchange.",
    action: "Retry once. If the problem continues, provide the request ID to an administrator.",
    details: { grant }
  });
}

function unavailable(grant: string): ApiError {
  return new ApiError({
    status: 503,
    code: "GOOGLE_TOKEN_ENDPOINT_UNAVAILABLE",
    message: "Google's token endpoint is unreachable.",
    action: "Retry in a moment; the existing session does not need to be discarded.",
    retryable: true,
    details: { grant }
  });
}
