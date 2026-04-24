import type { UserSession } from "../domain/app";
import { GOOGLE_SHEETS_SCOPES } from "../services/googleSheets";

const GOOGLE_SCRIPT_URL = "https://accounts.google.com/gsi/client";

let scriptPromise: Promise<void> | null = null;

function loadGoogleScript(): Promise<void> {
  if (window.google?.accounts?.oauth2) {
    return Promise.resolve();
  }

  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${GOOGLE_SCRIPT_URL}"]`
    );

    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load Google Identity Services.")), {
        once: true
      });
      return;
    }

    const script = document.createElement("script");
    script.src = GOOGLE_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Identity Services."));
    document.head.appendChild(script);
  });

  return scriptPromise;
}

export async function signInWithGoogle(clientId: string): Promise<UserSession> {
  if (!clientId.trim()) {
    throw new Error("Add the desktop app's Google OAuth client ID in Setup before signing in.");
  }

  await loadGoogleScript();

  return new Promise<UserSession>((resolve, reject) => {
    const tokenClient = window.google?.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: GOOGLE_SHEETS_SCOPES,
      callback: async (response) => {
        if (!response.access_token || response.error) {
          reject(new Error(response.error ?? "Google sign-in did not return an access token."));
          return;
        }

        try {
          const profileResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
            headers: {
              Authorization: `Bearer ${response.access_token}`
            }
          });

          if (!profileResponse.ok) {
            throw new Error(await profileResponse.text());
          }

          const profile = (await profileResponse.json()) as {
            email?: string;
            name?: string;
          };

          if (!profile.email) {
            throw new Error("Google profile did not include an email address.");
          }

          resolve({
            email: profile.email,
            name: profile.name ?? profile.email,
            accessToken: response.access_token
          });
        } catch (error) {
          reject(error instanceof Error ? error : new Error("Unable to fetch Google profile."));
        }
      },
      error_callback: (error) => {
        reject(new Error(`Google OAuth error: ${error.type}`));
      }
    });

    tokenClient?.requestAccessToken({ prompt: "consent" });
  });
}
