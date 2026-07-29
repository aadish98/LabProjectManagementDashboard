import type { Identity, Member } from "../domain/types.js";
import type { OnboardingRepository } from "../firestore/repository.js";
import { ApiError } from "../http/errors.js";

export async function requireLabManager(
  repository: OnboardingRepository,
  labId: string,
  identity: Identity
): Promise<Member> {
  const actor = await repository.findMemberByEmail(labId, identity.email);
  if (!actor?.active || !actor.roles.some((role) => role === "manager" || role === "pi")) {
    throw new ApiError({
      status: 403,
      code: "MANAGER_ROLE_REQUIRED",
      message: "This operation requires an active manager or PI role stored in Firestore.",
      action: "Ask a current PI to grant the role, then sign in again."
    });
  }
  return actor;
}

export async function requireSelfOrLabManager(
  repository: OnboardingRepository,
  labId: string,
  memberId: string,
  identity: Identity
): Promise<Member> {
  const target = await repository.getMember(labId, memberId);
  if (target.normalizedEmail === identity.email.trim().toLowerCase()) return target;
  await requireLabManager(repository, labId, identity);
  return target;
}
