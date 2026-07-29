import {
  deriveLabMemberFromEmail,
  type UserSession,
  type ViewerContext
} from "../domain/app";
import type { Invitation, Membership } from "../domain/onboarding";
import { primaryRole } from "../domain/onboarding";

export function resolveAuthoritativeViewerContext(
  session: UserSession | null,
  memberships: Membership[],
  invitations: Invitation[],
  pending: boolean,
  diagnostic?: string
): ViewerContext {
  if (!session) {
    return {
      role: "guest",
      accessibleLabMembers: [],
      reason: "Sign in with Google to continue.",
      source: "guest"
    };
  }
  const membership = memberships[0];
  if (membership) {
    const role = primaryRole(membership.member.roles);
    if (!role) {
      return {
        role: "unauthorized",
        accessibleLabMembers: [],
        reason:
          "The authoritative membership has no explicit Access role. Ask a manager or PI to assign one.",
        source: "backendDenied"
      };
    }
    return {
      role,
      labMember: membership.member.displayName,
      accessibleLabMembers:
        role === "employee" ? [membership.member.displayName] : [],
      reason: diagnostic
        ? `${diagnostic} Showing the last verified backend membership.`
        : `Verified by ${membership.lab.name}.`,
      source: "backendMembership"
    };
  }
  if (invitations.length > 0) {
    return {
      role: "employee",
      labMember: deriveLabMemberFromEmail(session.email, session.name),
      accessibleLabMembers: [],
      reason: "A verified backend invitation is waiting for this Google account.",
      source: "backendInvitation"
    };
  }
  if (pending) {
    return {
      role: "guest",
      accessibleLabMembers: [],
      reason: "Checking authoritative app access…",
      source: "guest"
    };
  }
  return {
    role: "unauthorized",
    accessibleLabMembers: [],
    reason:
      diagnostic ??
      "No active backend membership or pending invitation exists for this Google account.",
    source: "backendDenied"
  };
}
