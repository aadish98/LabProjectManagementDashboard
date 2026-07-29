import { describe, expect, it } from "vitest";
import { selectAppRoute } from "./routing";

const base = {
  hasSession: true,
  viewerRole: "employee" as const,
  hasEmployeePrefs: true,
  employeeForceSetup: false,
  onboardingStatus: "ready" as const,
  canBootstrap: false
};

describe("selectAppRoute", () => {
  it("keeps signed-out users on sign-in regardless of the viewer default", () => {
    expect(
      selectAppRoute({
        ...base,
        hasSession: false,
        viewerRole: "guest"
      })
    ).toBe("signedOut");
  });

  it("keeps a signed-in guest on the access check", () => {
    expect(
      selectAppRoute({
        ...base,
        viewerRole: "guest"
      })
    ).toBe("accessCheck");
  });

  it.each(["invited", "needsSharing", "needsPicker", "needsColumnReview", "blocked"] as const)(
    "never lets employee status %s bypass onboarding when preferences exist",
    (onboardingStatus) => {
      expect(
        selectAppRoute({
          ...base,
          onboardingStatus
        })
      ).toBe("employeeSetup");
    }
  );

  it("allows only ready employees into the workspace", () => {
    expect(
      selectAppRoute({
        ...base
      })
    ).toBe("employeeWorkspace");
    expect(
      selectAppRoute({
        ...base,
        employeeForceSetup: true
      })
    ).toBe("employeeSetup");
  });

  it.each(["invited", "needsSharing", "needsPicker", "needsColumnReview", "blocked"] as const)(
    "routes non-ready managers through first-run for %s",
    (onboardingStatus) => {
      expect(
        selectAppRoute({
          ...base,
          viewerRole: "manager",
          onboardingStatus
        })
      ).toBe("managerSetup");
    }
  );

  it("shows bootstrap only after a successful empty access probe", () => {
    expect(
      selectAppRoute({
        ...base,
        viewerRole: "unauthorized",
        onboardingStatus: null,
        canBootstrap: true
      })
    ).toBe("bootstrap");
    expect(
      selectAppRoute({
        ...base,
        viewerRole: "unauthorized",
        onboardingStatus: null,
        canBootstrap: false
      })
    ).toBe("unauthorized");
  });
});
