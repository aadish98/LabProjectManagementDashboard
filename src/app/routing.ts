import type { UserRole } from "../domain/app";
import type { OnboardingStatus } from "../domain/onboarding";

export type AppRoute =
  | "signedOut"
  | "accessCheck"
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
}

export function selectAppRoute({
  hasSession,
  viewerRole,
  hasEmployeePrefs,
  employeeForceSetup,
  onboardingStatus
}: AppRouteInput): AppRoute {
  if (!hasSession) return "signedOut";
  if (viewerRole === "guest") return "accessCheck";
  if (viewerRole === "unauthorized") return "unauthorized";
  if (viewerRole === "employee") {
    if (onboardingStatus !== "ready") return "employeeSetup";
    return !hasEmployeePrefs || employeeForceSetup ? "employeeSetup" : "employeeWorkspace";
  }
  if (onboardingStatus !== "ready") return "managerSetup";
  return "managerWorkspace";
}
