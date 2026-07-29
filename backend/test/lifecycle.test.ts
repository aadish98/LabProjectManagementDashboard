import { describe, expect, it } from "vitest";
import {
  advanceOnboarding,
  blockOnboarding,
  completeManagerFileProof,
  initialOnboardingState,
  resumeOnboarding
} from "../src/domain/lifecycle.js";

describe("onboarding lifecycle", () => {
  it("enforces the exact ordered happy path", () => {
    let state = initialOnboardingState("2026-01-01T00:00:00.000Z");
    expect(state.status).toBe("invited");
    state = advanceOnboarding(state, "needsSharing", "2026-01-02T00:00:00.000Z");
    state = advanceOnboarding(state, "needsPicker", "2026-01-03T00:00:00.000Z");
    state = advanceOnboarding(state, "needsColumnReview", "2026-01-04T00:00:00.000Z");
    state = advanceOnboarding(state, "ready", "2026-01-05T00:00:00.000Z");
    expect(state).toMatchObject({
      status: "ready",
      owner: "system",
      reason: "Sharing, exact-file access, and the shared column map are complete.",
      nextAction: "No onboarding action is required."
    });
  });

  it("rejects skipped lifecycle prerequisites", () => {
    const state = initialOnboardingState("2026-01-01T00:00:00.000Z");
    expect(() =>
      advanceOnboarding(state, "needsPicker", "2026-01-02T00:00:00.000Z")
    ).toThrowError(
      expect.objectContaining({
        code: "INVALID_ONBOARDING_TRANSITION",
        status: 409
      })
    );
  });

  it("resumes only the status that was blocked", () => {
    const sharing = advanceOnboarding(
      initialOnboardingState("2026-01-01T00:00:00.000Z"),
      "needsSharing",
      "2026-01-02T00:00:00.000Z"
    );
    const blocked = blockOnboarding(
      sharing,
      "Workspace policy denied external sharing.",
      "Ask the Workspace administrator to allow the target account.",
      "2026-01-03T00:00:00.000Z"
    );
    expect(blocked).toMatchObject({ status: "blocked", blockedFrom: "needsSharing" });
    expect(resumeOnboarding(blocked, "2026-01-04T00:00:00.000Z").status).toBe(
      "needsSharing"
    );
  });

  it("completes manager file proof directly when no personal task config exists", () => {
    const picker = advanceOnboarding(
      advanceOnboarding(
        initialOnboardingState("2026-01-01T00:00:00.000Z"),
        "needsSharing",
        "2026-01-02T00:00:00.000Z"
      ),
      "needsPicker",
      "2026-01-03T00:00:00.000Z"
    );
    expect(
      completeManagerFileProof(picker, false, "2026-01-04T00:00:00.000Z")
    ).toMatchObject({ status: "ready", owner: "system" });
    expect(
      completeManagerFileProof(picker, true, "2026-01-04T00:00:00.000Z")
    ).toMatchObject({ status: "needsColumnReview", owner: "member" });
  });
});
