import { ApiError } from "../http/errors.js";
import type { OnboardingState, OnboardingStatus } from "./types.js";

const NEXT_STATUS: Readonly<Partial<Record<OnboardingStatus, OnboardingStatus>>> = {
  invited: "needsSharing",
  needsSharing: "needsPicker",
  needsPicker: "needsColumnReview",
  needsColumnReview: "ready"
};

export const STATUS_DEFAULTS: Readonly<
  Record<OnboardingStatus, Pick<OnboardingState, "owner" | "reason" | "nextAction">>
> = {
  invited: {
    owner: "member",
    reason: "Invitation created; the member has not accepted it.",
    nextAction: "Sign in with the invited Google account and accept the invitation."
  },
  needsSharing: {
    owner: "manager",
    reason: "Invitation accepted; required Drive files are not confirmed shared.",
    nextAction: "A manager or PI must grant the required Google Drive permissions."
  },
  needsPicker: {
    owner: "member",
    reason: "Drive sharing is complete; exact-file Picker access is not verified.",
    nextAction: "Open Google Drive Picker and select the exact task-log workbook."
  },
  needsColumnReview: {
    owner: "member",
    reason: "Exact-file access is verified; the shared column map is not confirmed.",
    nextAction: "Review and confirm the task-log column mapping."
  },
  ready: {
    owner: "system",
    reason: "Sharing, exact-file access, and the shared column map are complete.",
    nextAction: "No onboarding action is required."
  },
  blocked: {
    owner: "manager",
    reason: "Onboarding is blocked.",
    nextAction: "Resolve the recorded blocker, then resume the previous status."
  }
};

export function initialOnboardingState(now: string): OnboardingState {
  return { status: "invited", ...STATUS_DEFAULTS.invited, updatedAt: now };
}

export function advanceOnboarding(
  current: OnboardingState,
  expectedTarget: Exclude<OnboardingStatus, "blocked">,
  now: string
): OnboardingState {
  if (current.status === expectedTarget) return current;
  const expected = NEXT_STATUS[current.status];
  if (expected !== expectedTarget) {
    throw new ApiError({
      status: 409,
      code: "INVALID_ONBOARDING_TRANSITION",
      message: `Onboarding cannot move from ${current.status} to ${expectedTarget}.`,
      action:
        current.status === "blocked"
          ? "Resolve the blocker and resume the recorded prior status first."
          : `Complete the ${expected ?? "current"} prerequisite first.`,
      details: { currentStatus: current.status, requestedStatus: expectedTarget }
    });
  }
  return { status: expectedTarget, ...STATUS_DEFAULTS[expectedTarget], updatedAt: now };
}

export function completeManagerFileProof(
  current: OnboardingState,
  requiresColumnReview: boolean,
  now: string
): OnboardingState {
  if (current.status !== "needsPicker") {
    throw new ApiError({
      status: 409,
      code: "MANAGER_FILE_PROOF_NOT_READY",
      message: `Manager file proof cannot complete while onboarding is ${current.status}.`,
      action: "Refresh the membership and complete the current onboarding prerequisite.",
      details: { currentStatus: current.status }
    });
  }
  const target = requiresColumnReview ? "needsColumnReview" : "ready";
  return { status: target, ...STATUS_DEFAULTS[target], updatedAt: now };
}

export function blockOnboarding(
  current: OnboardingState,
  reason: string,
  nextAction: string,
  now: string
): OnboardingState {
  if (current.status === "blocked") {
    return { ...current, reason, nextAction, updatedAt: now };
  }
  return {
    status: "blocked",
    owner: "manager",
    reason,
    nextAction,
    blockedFrom: current.status,
    updatedAt: now
  };
}

export function resumeOnboarding(current: OnboardingState, now: string): OnboardingState {
  if (current.status !== "blocked" || !current.blockedFrom) {
    throw new ApiError({
      status: 409,
      code: "ONBOARDING_NOT_BLOCKED",
      message: "This onboarding record has no blocked status to resume.",
      action: "Refresh the member and continue from its current onboarding status."
    });
  }
  const status = current.blockedFrom;
  return { status, ...STATUS_DEFAULTS[status], updatedAt: now };
}
