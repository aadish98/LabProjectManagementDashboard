import { describe, expect, it, vi } from "vitest";
import type { Member, MemberConfig } from "../domain/onboarding";
import { OnboardingApiError } from "../services/onboardingApi";
import { fetchAuthoritativeManagerMembers } from "./useAccessVerification";

const now = "2026-07-15T12:00:00.000Z";

function member(id: string, active = true): Member {
  return {
    id,
    labId: "lab",
    email: `${id}@example.com`,
    normalizedEmail: `${id}@example.com`,
    displayName: id,
    roles: ["employee"],
    active,
    revision: 1,
    onboarding: {
      status: "ready",
      owner: "system",
      reason: "Ready",
      nextAction: "None",
      updatedAt: now
    },
    createdAt: now,
    createdBy: "manager",
    updatedAt: now
  };
}

function config(memberId: string): MemberConfig {
  return {
    memberId,
    labId: "lab",
    spreadsheetId: `${memberId}-sheet`,
    taskLogUrl: `https://docs.google.com/spreadsheets/d/${memberId}-sheet/edit`,
    activeSheetName: "Tasks",
    proposedColumnMap: {},
    revision: 1,
    updatedAt: now,
    updatedBy: "manager"
  };
}

describe("authoritative manager member loading", () => {
  it("loads only active members and isolates a missing config", async () => {
    const healthy = member("healthy");
    const missingConfig = member("missing-config");
    const inactive = member("inactive", false);
    const api = {
      listMembers: vi.fn().mockResolvedValue({
        members: [healthy, missingConfig, inactive]
      }),
      getConfig: vi.fn().mockImplementation(async (_labId: string, memberId: string) => {
        if (memberId === missingConfig.id) {
          throw new OnboardingApiError({
            kind: "http",
            status: 404,
            code: "CONFIG_NOT_FOUND",
            message: "Config missing.",
            action: "Repair this member."
          });
        }
        return { config: config(memberId) };
      })
    };

    await expect(fetchAuthoritativeManagerMembers(api, "lab")).resolves.toEqual([
      { member: healthy, config: config(healthy.id) },
      { member: missingConfig, config: null }
    ]);
    expect(api.getConfig).not.toHaveBeenCalledWith("lab", inactive.id);
  });

  it("does not hide backend transport failures as missing member config", async () => {
    const api = {
      listMembers: vi.fn().mockResolvedValue({ members: [member("healthy")] }),
      getConfig: vi.fn().mockRejectedValue(
        new OnboardingApiError({
          kind: "transport",
          code: "BACKEND_UNREACHABLE",
          message: "Backend unavailable.",
          action: "Retry.",
          retryable: true
        })
      )
    };

    await expect(fetchAuthoritativeManagerMembers(api, "lab")).rejects.toMatchObject({
      code: "BACKEND_UNREACHABLE"
    });
  });
});
