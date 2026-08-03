import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { Identity, Member } from "../src/domain/types.js";
import type { OnboardingRepository } from "../src/firestore/repository.js";
import { ApiError } from "../src/http/errors.js";

const identity: Identity = {
  subject: "google-subject-1",
  email: "member@example.com",
  emailVerified: true,
  name: "Member"
};

function member(roles: Member["roles"]): Member {
  return {
    id: "ad0de8ec-6bce-4c26-9f3a-b5ca56e70c86",
    labId: "9f62dce9-752e-4c39-91b3-98e35fffd1e9",
    email: identity.email,
    normalizedEmail: identity.email,
    displayName: "Member",
    roles,
    active: true,
    revision: 1,
    onboarding: {
      status: "ready",
      owner: "system",
      reason: "Ready",
      nextAction: "None",
      updatedAt: "2026-01-01T00:00:00.000Z"
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    createdBy: identity.subject,
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}

const BROKERED_CLIENT_ID = "1234567890-desktop.apps.googleusercontent.com";

function brokerStub() {
  return {
    exchangeAuthorizationCode: vi.fn().mockResolvedValue({
      accessToken: "google-access-token",
      tokenType: "Bearer",
      expiresInSeconds: 3599,
      idToken: "google-id-token",
      refreshToken: "google-refresh-token"
    }),
    refreshAccessToken: vi.fn().mockResolvedValue({
      accessToken: "google-access-token-2",
      tokenType: "Bearer",
      expiresInSeconds: 3599,
      idToken: "google-id-token-2"
    })
  };
}

function validCodeExchange() {
  return {
    clientId: BROKERED_CLIENT_ID,
    code: "authorization-code",
    codeVerifier: "a".repeat(43),
    redirectUri: "http://127.0.0.1:53682"
  };
}

function appWith(
  repositoryOverrides: Partial<OnboardingRepository> = {},
  readinessCheck: () => Promise<void> = async () => {},
  drivePermissionClient = {
    createUserPermission: vi.fn(),
    deletePermission: vi.fn()
  },
  googleTokenBroker: ReturnType<typeof brokerStub> = brokerStub()
) {
  const repository = {
    listInvitationsForEmail: vi.fn().mockResolvedValue([]),
    listMembershipsForEmail: vi.fn().mockResolvedValue([]),
    findMemberByEmail: vi.fn().mockResolvedValue(member(["employee"])),
    listMembers: vi.fn().mockResolvedValue([]),
    ...repositoryOverrides
  } as unknown as OnboardingRepository;
  return createApp({
    repository,
    identityVerifier: {
      verify: vi.fn(async (token: string) => {
        if (token !== "valid-id-token") throw new Error("invalid");
        return identity;
      })
    },
    drivePermissionClient,
    googleTokenBroker,
    brokeredClientId: BROKERED_CLIENT_ID,
    corsAllowedOrigins: ["tauri://localhost"],
    readinessCheck
  });
}

describe("HTTP API", () => {
  it("serves health without authentication", async () => {
    const response = await request(appWith()).get("/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok", check: "process" });
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("reports Firestore readiness separately from process health", async () => {
    const ready = await request(appWith()).get("/readyz");
    expect(ready.status).toBe(200);
    expect(ready.body).toEqual({ status: "ready", checks: { firestore: "ok" } });

    const unavailable = await request(
      appWith({}, async () => {
        throw new Error("Firestore unavailable");
      })
    ).get("/readyz");
    expect(unavailable.status).toBe(503);
    expect(unavailable.body.error).toMatchObject({
      code: "SERVICE_NOT_READY",
      retryable: true
    });
  });

  it("returns a typed actionable error when the ID token is missing", async () => {
    const response = await request(appWith()).get("/v1/me/invitations");
    expect(response.status).toBe(401);
    expect(response.body.error).toMatchObject({
      code: "ID_TOKEN_REQUIRED",
      retryable: false
    });
    expect(response.body.error.action).toContain("Authorization");
    expect(response.body.error.requestId).toBeTruthy();
  });

  it("returns stable client errors for malformed and oversized JSON", async () => {
    const malformed = await request(appWith())
      .post("/v1/me/invitations")
      .set("Authorization", "Bearer valid-id-token")
      .set("Content-Type", "application/json")
      .send('{"labName":');
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.code).toBe("INVALID_JSON");

    const oversized = await request(appWith())
      .post("/v1/me/invitations")
      .set("Authorization", "Bearer valid-id-token")
      .send({ payload: "x".repeat(257 * 1024) });
    expect(oversized.status).toBe(413);
    expect(oversized.body.error.code).toBe("REQUEST_BODY_TOO_LARGE");
    expect(oversized.headers["cache-control"]).toBe("no-store");
  });

  it("discovers clean-device invitations by verified email", async () => {
    const listInvitationsForEmail = vi.fn().mockResolvedValue([]);
    const response = await request(appWith({ listInvitationsForEmail }))
      .get("/v1/me/invitations")
      .set("Authorization", "Bearer valid-id-token");
    expect(response.status).toBe(200);
    expect(listInvitationsForEmail).toHaveBeenCalledWith("member@example.com");
  });

  it("returns authoritative active memberships for a clean device", async () => {
    const membership = {
      member: member(["manager"]),
      lab: {
        id: "9f62dce9-752e-4c39-91b3-98e35fffd1e9",
        name: "Example Lab",
        adminSpreadsheetId: "admin-sheet",
        revision: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        createdBy: identity.subject,
        updatedAt: "2026-01-01T00:00:00.000Z"
      },
      config: null
    };
    const listMembershipsForEmail = vi.fn().mockResolvedValue([membership]);
    const response = await request(appWith({ listMembershipsForEmail }))
      .get("/v1/me/memberships")
      .set("Authorization", "Bearer valid-id-token");
    expect(response.status).toBe(200);
    expect(response.body.memberships).toEqual([
      {
        ...membership,
        lab: {
          id: membership.lab.id,
          name: membership.lab.name,
          revision: membership.lab.revision,
          createdAt: membership.lab.createdAt,
          createdBy: membership.lab.createdBy,
          updatedAt: membership.lab.updatedAt
        }
      }
    ]);
    expect(response.body.memberships[0].lab).not.toHaveProperty("adminSpreadsheetId");
    expect(listMembershipsForEmail).toHaveBeenCalledWith(identity.email);
  });

  it("validates manager authority from Firestore records", async () => {
    const response = await request(appWith())
      .get("/v1/labs/9f62dce9-752e-4c39-91b3-98e35fffd1e9/members")
      .set("Authorization", "Bearer valid-id-token");
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("MANAGER_ROLE_REQUIRED");
  });

  it("does not expose the retired desktop bootstrap endpoint", async () => {
    const response = await request(appWith())
      .post("/v1/labs/bootstrap")
      .set("Authorization", "Bearer valid-id-token")
      .send({});
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("ROUTE_NOT_FOUND");
  });

  it("accepts exact manager file subsets and returns retained progress", async () => {
    const manager = {
      ...member(["manager"]),
      onboarding: {
        ...member(["manager"]).onboarding,
        status: "needsPicker" as const
      }
    };
    const progress = {
      requiredFiles: [
        { fileId: "task", purpose: "requiredTaskLog", label: "Member Task-log workbook" }
      ],
      verifiedFileIds: [],
      remainingFileIds: ["task"],
      complete: false,
      requiresColumnReview: false
    };
    const recordManagerFileProof = vi.fn().mockResolvedValue({
      member: { ...manager, revision: 2 },
      progress
    });
    const response = await request(
      appWith({ recordManagerFileProof })
    )
      .post(`/v1/labs/${manager.labId}/members/${manager.id}/manager-file-proof`)
      .set("Authorization", "Bearer valid-id-token")
      .send({ expectedRevision: 1, selectedFileIds: ["task"] });

    expect(response.status).toBe(200);
    expect(response.body.progress).toEqual(progress);
    expect(recordManagerFileProof).toHaveBeenCalledWith(
      manager.labId,
      manager.id,
      identity,
      ["task"],
      1
    );
  });

  it("rejects a stale Drive provisioning revision before calling Google", async () => {
    const target = {
      ...member(["employee"]),
      revision: 2,
      onboarding: {
        ...member(["employee"]).onboarding,
        status: "needsSharing" as const
      }
    };
    const drive = {
      createUserPermission: vi.fn(),
      deletePermission: vi.fn()
    };
    const response = await request(
      appWith(
        {
          getDriveProvisioningContext: vi.fn().mockResolvedValue({
            actor: member(["manager"]),
            target,
            resources: [{ fileId: "task-log", purpose: "taskLog" }]
          })
        },
        async () => {},
        drive
      )
    )
      .post(`/v1/labs/${target.labId}/members/${target.id}/drive-permissions`)
      .set("Authorization", "Bearer valid-id-token")
      .set("X-Google-Drive-Access-Token", "short-lived-drive-token")
      .send({ expectedRevision: 1 });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("REVISION_CONFLICT");
    expect(drive.createUserPermission).not.toHaveBeenCalled();
  });

  it("removes newly created Drive permissions when Firestore commit fails", async () => {
    const target = {
      ...member(["employee"]),
      onboarding: {
        ...member(["employee"]).onboarding,
        status: "needsSharing" as const
      }
    };
    const repositoryFailure = new ApiError({
      status: 409,
      code: "REVISION_CONFLICT",
      message: "The member changed.",
      action: "Refresh the member."
    });
    const drive = {
      createUserPermission: vi.fn().mockResolvedValue({
        fileId: "task-log",
        purpose: "taskLog",
        status: "created",
        permissionId: "permission-1"
      }),
      deletePermission: vi.fn().mockResolvedValue(undefined)
    };
    const response = await request(
      appWith(
        {
          getDriveProvisioningContext: vi.fn().mockResolvedValue({
            actor: member(["manager"]),
            target,
            resources: [{ fileId: "task-log", purpose: "taskLog" }]
          }),
          recordDriveSharing: vi.fn().mockRejectedValue(repositoryFailure)
        },
        async () => {},
        drive
      )
    )
      .post(`/v1/labs/${target.labId}/members/${target.id}/drive-permissions`)
      .set("Authorization", "Bearer valid-id-token")
      .set("X-Google-Drive-Access-Token", "short-lived-drive-token")
      .send({ expectedRevision: target.revision });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("REVISION_CONFLICT");
    expect(drive.deletePermission).toHaveBeenCalledWith(
      "short-lived-drive-token",
      "task-log",
      "permission-1"
    );
  });

  it("allows only one of two concurrent managers to commit the same revision", async () => {
    let currentMemberRevision = 1;
    const manager = member(["manager"]);
    const updateMemberSetup = vi.fn(
      async (
        _labId: string,
        _memberId: string,
        _actor: Identity,
        expectedMemberRevision: number
      ) => {
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (expectedMemberRevision !== currentMemberRevision) {
          throw new ApiError({
            status: 409,
            code: "REVISION_CONFLICT",
            message: "The member changed after it was loaded.",
            action: "Reload the current member and reconcile the changes.",
            details: {
              expectedRevision: expectedMemberRevision,
              currentRevision: currentMemberRevision
            }
          });
        }
        currentMemberRevision += 1;
        return {
          member: { ...manager, revision: currentMemberRevision },
          config: {
            labId: manager.labId,
            memberId: manager.id,
            spreadsheetId: "task-sheet",
            taskLogUrl: "https://docs.google.com/spreadsheets/d/task-sheet/edit",
            activeSheetName: "Tasks",
            proposedColumnMap: {},
            revision: 2,
            updatedAt: manager.updatedAt,
            updatedBy: identity.subject
          }
        };
      }
    );
    const app = appWith({
      findMemberByEmail: vi.fn().mockResolvedValue(manager),
      getMember: vi.fn().mockResolvedValue(manager),
      updateMemberSetup
    });
    const path = `/v1/labs/${manager.labId}/members/${manager.id}/setup`;
    const payload = {
      expectedMemberRevision: 1,
      expectedConfigRevision: 1,
      member: {
        displayName: "Member Updated",
        roles: ["employee"],
        active: true
      },
      config: {
        spreadsheetId: "task-sheet",
        taskLogUrl: "https://docs.google.com/spreadsheets/d/task-sheet/edit",
        activeSheetName: "Tasks",
        proposedColumnMap: {}
      }
    };

    const [first, second] = await Promise.all([
      request(app)
        .patch(path)
        .set("Authorization", "Bearer valid-id-token")
        .send(payload),
      request(app)
        .patch(path)
        .set("Authorization", "Bearer valid-id-token")
        .send(payload)
    ]);

    expect([first.status, second.status].sort()).toEqual([200, 409]);
    expect([first.body.error?.code, second.body.error?.code]).toContain(
      "REVISION_CONFLICT"
    );
  });
});

describe("Google token broker routes", () => {
  it("exchanges an authorization code without any Authorization header", async () => {
    const broker = brokerStub();
    const response = await request(appWith({}, async () => {}, undefined, broker))
      .post("/auth/google/token/authorization-code")
      .send(validCodeExchange());

    expect(response.status).toBe(200);
    expect(broker.exchangeAuthorizationCode).toHaveBeenCalledWith({
      code: "authorization-code",
      codeVerifier: "a".repeat(43),
      redirectUri: "http://127.0.0.1:53682"
    });
    expect(Object.keys(response.body).sort()).toEqual([
      "accessToken",
      "expiresInSeconds",
      "idToken",
      "refreshToken",
      "tokenType"
    ]);
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("is not behind the /v1 authenticate guard", async () => {
    const rejected = await request(appWith())
      .post("/auth/google/token/authorization-code")
      .set("Authorization", "Bearer definitely-not-valid")
      .send(validCodeExchange());
    expect(rejected.status).toBe(200);

    // The guard itself must still be in force for the versioned API.
    const guarded = await request(appWith()).get("/v1/me/invitations");
    expect(guarded.status).toBe(401);
    expect(guarded.body.error.code).toBe("ID_TOKEN_REQUIRED");
  });

  it("refreshes with an expired ID token present", async () => {
    const broker = brokerStub();
    const response = await request(appWith({}, async () => {}, undefined, broker))
      .post("/auth/google/token/refresh")
      .set("Authorization", "Bearer expired-id-token")
      .send({ clientId: BROKERED_CLIENT_ID, refreshToken: "stored-refresh-token" });

    expect(response.status).toBe(200);
    expect(broker.refreshAccessToken).toHaveBeenCalledWith({
      refreshToken: "stored-refresh-token"
    });
  });

  it("rejects an unknown client or redirect without calling Google", async () => {
    const broker = brokerStub();
    const app = appWith({}, async () => {}, undefined, broker);

    const wrongClient = await request(app)
      .post("/auth/google/token/authorization-code")
      .send({ ...validCodeExchange(), clientId: "attacker.apps.googleusercontent.com" });
    expect(wrongClient.status).toBe(400);
    expect(wrongClient.body.error.code).toBe("UNKNOWN_OAUTH_CLIENT");

    const wrongRedirect = await request(app)
      .post("/auth/google/token/authorization-code")
      .send({ ...validCodeExchange(), redirectUri: "http://evil.example.com/cb" });
    expect(wrongRedirect.status).toBe(400);
    expect(wrongRedirect.body.error.code).toBe("UNSUPPORTED_REDIRECT_URI");

    expect(broker.exchangeAuthorizationCode).not.toHaveBeenCalled();
  });

  it("rejects a malformed PKCE verifier", async () => {
    const response = await request(appWith())
      .post("/auth/google/token/authorization-code")
      .send({ ...validCodeExchange(), codeVerifier: "too-short" });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_REQUEST");
  });

  it("maps a rejected grant to 401 without echoing Google's description", async () => {
    const broker = brokerStub();
    broker.exchangeAuthorizationCode.mockRejectedValue(
      new ApiError({
        status: 401,
        code: "GOOGLE_GRANT_REJECTED",
        message: "Google rejected the sign-in credential.",
        action: "Sign in with Google again."
      })
    );
    const response = await request(appWith({}, async () => {}, undefined, broker))
      .post("/auth/google/token/authorization-code")
      .send(validCodeExchange());

    expect(response.status).toBe(401);
    expect(response.body.error).toMatchObject({
      code: "GOOGLE_GRANT_REJECTED",
      retryable: false
    });
    expect(JSON.stringify(response.body)).not.toContain("Bad Request");
    expect(JSON.stringify(response.body)).not.toContain("invalid_grant");
  });

  it("marks a Google outage retryable so the client keeps its refresh token", async () => {
    const broker = brokerStub();
    broker.refreshAccessToken.mockRejectedValue(
      new ApiError({
        status: 503,
        code: "GOOGLE_TOKEN_ENDPOINT_UNAVAILABLE",
        message: "Google's token endpoint is unreachable.",
        action: "Retry in a moment.",
        retryable: true
      })
    );
    const response = await request(appWith({}, async () => {}, undefined, broker))
      .post("/auth/google/token/refresh")
      .send({ clientId: BROKERED_CLIENT_ID, refreshToken: "stored-refresh-token" });

    expect(response.status).toBe(503);
    expect(response.body.error).toMatchObject({
      code: "GOOGLE_TOKEN_ENDPOINT_UNAVAILABLE",
      retryable: true
    });
  });

  it("rate limits a single caller and returns Retry-After", async () => {
    const app = appWith();
    const callFrom = (ip: string) =>
      request(app)
        .post("/auth/google/token/refresh")
        .set("X-Forwarded-For", ip)
        .send({ clientId: BROKERED_CLIENT_ID, refreshToken: "r" });

    let last = await callFrom("203.0.113.7");
    for (let attempt = 1; attempt < 21; attempt += 1) {
      last = await callFrom("203.0.113.7");
    }

    expect(last.status).toBe(429);
    expect(last.body.error).toMatchObject({
      code: "TOO_MANY_TOKEN_REQUESTS",
      retryable: true
    });
    expect(Number(last.headers["retry-after"])).toBeGreaterThan(0);

    // Per-IP, not global: a different caller is unaffected below the total ceiling.
    const other = await callFrom("198.51.100.4");
    expect(other.status).toBe(200);
  });

  it("rejects an oversized broker body", async () => {
    const response = await request(appWith())
      .post("/auth/google/token/authorization-code")
      .send({ ...validCodeExchange(), code: "x".repeat(9000) });
    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe("REQUEST_BODY_TOO_LARGE");
  });

  it("404s an unknown broker path", async () => {
    const response = await request(appWith())
      .post("/auth/google/token/nonsense")
      .send({});
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("ROUTE_NOT_FOUND");
  });
});
