import {
  deriveLabMemberFromEmail,
  isConfiguredEmployee,
  isConfiguredManager,
  type AppConfig,
  type UserSession,
  type ViewerContext
} from "../domain/app";
import type { DashboardDataset } from "../domain/experiment";

export function resolveViewerContext(
  session: UserSession | null,
  dataset: DashboardDataset | null,
  config: AppConfig
): ViewerContext {
  if (!session) {
    return {
      role: "guest",
      accessibleLabMembers: [],
      reason: "Sign in with Google to continue."
    };
  }

  if (isConfiguredManager(session.email, config)) {
    const accessibleLabMembers = dataset?.registry.map((entry) => entry.labMember) ?? [];
    return {
      role: "manager",
      accessibleLabMembers,
      reason: "Resolved from the configured manager email list."
    };
  }

  if (isConfiguredEmployee(session.email, config)) {
    const labMember = deriveLabMemberFromEmail(session.email, session.name);
    return {
      role: "employee",
      labMember,
      accessibleLabMembers: [labMember],
      reason: "Resolved from the configured employee email list."
    };
  }

  return {
    role: "unauthorized",
    accessibleLabMembers: [],
    reason: "This Google account is not in the manager or employee allow lists."
  };
}
