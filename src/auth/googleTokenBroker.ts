import { BACKEND_BASE_URL } from "../services/backendBaseUrl";

export const AUTHORIZATION_CODE_PATH = "/auth/google/token/authorization-code";
export const REFRESH_PATH = "/auth/google/token/refresh";

export interface BrokeredTokens {
  accessToken: string;
  tokenType?: string;
  expiresInSeconds?: number;
  idToken?: string;
  refreshToken?: string;
  scope?: string;
}

/**
 * `retryable` decides whether the caller may keep the stored refresh token.
 * A transient backend or Google outage must never cost the user their vault
 * entry; only a credential Google actually rejected should force re-consent.
 */
export class GoogleTokenBrokerError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly action: string;

  constructor(options: {
    code: string;
    message: string;
    action: string;
    retryable: boolean;
  }) {
    super(options.message);
    this.name = "GoogleTokenBrokerError";
    this.code = options.code;
    this.action = options.action;
    this.retryable = options.retryable;
  }
}

type BrokerErrorBody = {
  error?: {
    code?: string;
    message?: string;
    action?: string;
    retryable?: boolean;
  };
};

export function isRetryableBrokerError(error: unknown): boolean {
  return error instanceof GoogleTokenBrokerError && error.retryable;
}

export async function requestBrokeredToken(
  path: string,
  payload: Record<string, string>,
  fetchImpl: typeof fetch = fetch
): Promise<BrokeredTokens> {
  if (!BACKEND_BASE_URL) {
    throw new GoogleTokenBrokerError({
      code: "BACKEND_BASE_URL_REQUIRED",
      message: "The sign-in service is not configured.",
      action: "Set VITE_BACKEND_BASE_URL and restart the app.",
      retryable: false
    });
  }

  let response: Response;
  try {
    response = await fetchImpl(`${BACKEND_BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload)
    });
  } catch {
    throw new GoogleTokenBrokerError({
      code: "BROKER_UNREACHABLE",
      message: "The sign-in service is unreachable. Check your connection and try again.",
      action: "Retry in a moment; you do not need to sign in again.",
      retryable: true
    });
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as BrokerErrorBody;
    // Fall back to retryable for 5xx so an unparsable outage response does not
    // get mistaken for a rejected credential.
    const retryable = body.error?.retryable ?? response.status >= 500;
    throw new GoogleTokenBrokerError({
      code: body.error?.code ?? `HTTP_${response.status}`,
      message: retryable
        ? "The sign-in service is unreachable. Check your connection and try again."
        : (body.error?.message ?? "Google needs a fresh sign-in to continue."),
      action: body.error?.action ?? "Try again.",
      retryable
    });
  }

  const tokens = (await response.json().catch(() => ({}))) as BrokeredTokens;
  if (!tokens.accessToken) {
    throw new GoogleTokenBrokerError({
      code: "ACCESS_TOKEN_MISSING",
      message: "The sign-in service did not return an access token.",
      action: "Try signing in again.",
      retryable: false
    });
  }
  return tokens;
}
