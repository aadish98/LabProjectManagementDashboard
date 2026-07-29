import type { UserSession } from "./app";

export interface VerifiedIdentity {
  subject?: string;
  email: string;
  name: string;
}

export type BackendAccessDiagnostic =
  | { kind: "ready" }
  | {
      kind: "configuration";
      message: string;
      action: string;
    }
  | {
      kind: "identity";
      message: string;
      action: string;
    };

export function backendAccessDiagnostic(
  backendBaseUrl: string,
  session: UserSession | null
): BackendAccessDiagnostic {
  if (!backendBaseUrl.trim()) {
    return {
      kind: "configuration",
      message: "The authoritative onboarding service is not configured.",
      action: "Set VITE_BACKEND_BASE_URL and restart the app."
    };
  }
  if (session && !session.idToken?.trim()) {
    return {
      kind: "identity",
      message: "This Google session has no ID token for backend access verification.",
      action: "Reconnect Google to obtain a verified ID token."
    };
  }
  return { kind: "ready" };
}
