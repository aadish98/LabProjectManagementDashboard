import { describe, expect, it, vi } from "vitest";
import { OnboardingApi, OnboardingApiError } from "./onboardingApi";

describe("OnboardingApi", () => {
  it("binds the default fetch implementation to the global Window receiver", async () => {
    const originalFetch = globalThis.fetch;
    let receiver: unknown;
    globalThis.fetch = vi.fn(function (this: unknown) {
      receiver = this;
      return Promise.resolve(
        new Response(JSON.stringify({ memberships: [] }), { status: 200 })
      );
    }) as typeof fetch;

    try {
      const api = new OnboardingApi({
        baseUrl: "https://backend.example",
        idToken: "id-token"
      });

      await api.getMemberships();
      expect(receiver).toBe(globalThis);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("uses the ID token for authorization without leaking the Drive token", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("Authorization")).toBe("Bearer id-token");
      expect(headers.get("X-Google-Drive-Access-Token")).toBeNull();
      return new Response(JSON.stringify({ memberships: [] }), { status: 200 });
    });
    const api = new OnboardingApi({
      baseUrl: "https://backend.example",
      idToken: "id-token",
      driveAccessToken: "drive-token",
      fetchImpl: fetchImpl as typeof fetch
    });

    await api.getMemberships();
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("sends the transient Drive token only for provisioning", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("Authorization")).toBe("Bearer id-token");
      expect(headers.get("X-Google-Drive-Access-Token")).toBe("drive-token");
      return new Response(
        JSON.stringify({
          member: { revision: 2 },
          replayed: false
        }),
        { status: 200 }
      );
    });
    const api = new OnboardingApi({
      baseUrl: "https://backend.example",
      idToken: "id-token",
      driveAccessToken: "drive-token",
      fetchImpl: fetchImpl as typeof fetch
    });

    await api.provisionDrive("lab", "member", 1);
  });

  it("surfaces typed revision conflicts and recovery actions", async () => {
    const api = new OnboardingApi({
      baseUrl: "https://backend.example",
      idToken: "id-token",
      fetchImpl: vi.fn(async () =>
        new Response(
          JSON.stringify({
            error: {
              code: "REVISION_CONFLICT",
              message: "The record changed.",
              action: "Reload and retry.",
              requestId: "request-1"
            }
          }),
          { status: 409 }
        )
      ) as typeof fetch
    });

    await expect(api.updateMember("lab", "member", 1, { displayName: "Next" })).rejects.toEqual(
      expect.objectContaining<Partial<OnboardingApiError>>({
        code: "REVISION_CONFLICT",
        status: 409,
        action: "Reload and retry.",
        requestId: "request-1"
      })
    );
  });
});
