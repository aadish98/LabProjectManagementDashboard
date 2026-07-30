import { describe, expect, it } from "vitest";
import { resolveAuthoritativeViewerContext } from "./roles";
import type { Membership } from "../domain/onboarding";

const session = {
  email: "manager@example.com",
  name: "Manager",
  idToken: "id-token"
};

const membership = {
  member: {
    id: "member",
    labId: "lab",
    email: session.email,
    normalizedEmail: session.email,
    displayName: "Manager",
    roles: ["manager"],
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
    createdBy: "subject",
    updatedAt: "2026-01-01T00:00:00.000Z"
  },
  lab: {
    id: "lab",
    name: "Cell Lab",
    revision: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    createdBy: "subject",
    updatedAt: "2026-01-01T00:00:00.000Z"
  },
  config: null
} satisfies Membership;

describe("authoritative access resolution", () => {
  it("uses backend membership roles without requiring local admin workbook access", () => {
    expect(resolveAuthoritativeViewerContext(session, [membership], [], false)).toMatchObject({
      role: "manager",
      source: "backendMembership"
    });
  });

  it("preserves a verified membership while reporting a transport diagnostic", () => {
    const viewer = resolveAuthoritativeViewerContext(
      session,
      [membership],
      [],
      false,
      "Backend temporarily unavailable."
    );
    expect(viewer.role).toBe("manager");
    expect(viewer.reason).toContain("last verified");
  });

  it("does not infer employee access when no authoritative record exists", () => {
    expect(resolveAuthoritativeViewerContext(session, [], [], false)).toMatchObject({
      role: "unauthorized",
      source: "backendDenied"
    });
  });

  it("does not infer an Employee role from a malformed role-less membership", () => {
    const rolelessMembership = {
      ...membership,
      member: { ...membership.member, roles: [] }
    } satisfies Membership;

    expect(
      resolveAuthoritativeViewerContext(session, [rolelessMembership], [], false)
    ).toMatchObject({
      role: "unauthorized",
      source: "backendDenied",
      reason: expect.stringContaining("no explicit Access role")
    });
  });
});
