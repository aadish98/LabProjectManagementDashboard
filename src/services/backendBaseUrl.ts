/**
 * Build-time base URL for the authoritative onboarding service.
 *
 * Lives in its own module so the auth layer can reach it without importing the
 * whole onboarding API client. `onboardingApi.ts` re-exports it, so existing
 * importers and their test mocks are unaffected.
 */
export const BACKEND_BASE_URL = (import.meta.env.VITE_BACKEND_BASE_URL ?? "")
  .trim()
  .replace(/\/+$/, "");
