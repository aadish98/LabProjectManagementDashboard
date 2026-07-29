import type { UserRole } from "../domain/app";
import type { OnboardingStatus } from "../domain/onboarding";

export type AppRoute =
  | "signedOut"
  | "accessCheck"
  | "bootstrap"
  | "unauthorized"
  | "employeeSetup"
  | "employeeWorkspace"
  | "managerSetup"
  | "managerWorkspace";

export interface AppRouteInput {
  hasSession: boolean;
  viewerRole: UserRole;
  hasEmployeePrefs: boolean;
  employeeForceSetup: boolean;
  onboardingStatus: OnboardingStatus | null;
  canBootstrap: boolean;
}

export function selectAppRoute({
  hasSession,
  viewerRole,
  hasEmployeePrefs,
  employeeForceSetup,
  onboardingStatus,
  canBootstrap
}: AppRouteInput): AppRoute {
  if (!hasSession) return "signedOut";
  if (viewerRole === "guest") return "accessCheck";
  if (canBootstrap) return "bootstrap";
  if (viewerRole === "unauthorized") return "unauthorized";
  if (viewerRole === "employee") {
    if (onboardingStatus !== "ready") return "employeeSetup";
    return !hasEmployeePrefs || employeeForceSetup ? "employeeSetup" : "employeeWorkspace";
  }
  if (onboardingStatus !== "ready") return "managerSetup";
  return "managerWorkspace";
}
