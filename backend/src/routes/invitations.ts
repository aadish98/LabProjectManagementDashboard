import { Router } from "express";
import { z } from "zod";
import { requireLabManager } from "../auth/authorizeLab.js";
import type { OnboardingRepository } from "../firestore/repository.js";
import {
  columnMapSchema,
  idempotencyKey,
  invitationIdParams,
  labIdParams,
  memberConfigInputSchema,
  revisionSchema,
  rolesSchema
} from "./schemas.js";

const createSchema = memberConfigInputSchema.extend({
  expiresAt: z.string().datetime().refine((value) => Date.parse(value) > Date.now(), {
    message: "expiresAt must be in the future"
  })
});

const updateSchema = z
  .object({
    expectedRevision: revisionSchema,
    displayName: z.string().trim().min(1).max(200).optional(),
    roles: rolesSchema.optional(),
    expiresAt: z.string().datetime().optional(),
    spreadsheetId: z.string().trim().min(1).max(300).optional(),
    taskLogUrl: z.string().url().max(2000).optional(),
    activeSheetName: z.string().trim().min(1).max(200).optional(),
    proposedColumnMap: columnMapSchema.optional()
  })
  .refine((body) => Object.keys(body).some((key) => key !== "expectedRevision"), {
    message: "At least one invitation field must be changed."
  });

const revisionBody = z.object({ expectedRevision: revisionSchema });
const revisionQuery = z.object({ revision: z.coerce.number().int().positive() });

export function invitationsRouter(repository: OnboardingRepository): Router {
  const router = Router();

  router.get("/me/invitations", async (request, response) => {
    const invitations = await repository.listInvitationsForEmail(request.identity.email);
    response.json({ invitations });
  });

  router.get("/labs/:labId/invitations", async (request, response) => {
    const { labId } = labIdParams.parse(request.params);
    await requireLabManager(repository, labId, request.identity);
    response.json({ invitations: await repository.listInvitations(labId) });
  });

  router.get("/labs/:labId/invitations/:invitationId", async (request, response) => {
    const { labId, invitationId } = invitationIdParams.parse(request.params);
    const invitation = await repository.getInvitation(labId, invitationId);
    const isInvitee =
      invitation.normalizedEmail === request.identity.email.trim().toLowerCase();
    if (!isInvitee) await requireLabManager(repository, labId, request.identity);
    response.json({ invitation });
  });

  router.post("/labs/:labId/invitations", async (request, response) => {
    const { labId } = labIdParams.parse(request.params);
    await requireLabManager(repository, labId, request.identity);
    const input = createSchema.parse(request.body);
    const result = await repository.createInvitation(
      labId,
      request.identity,
      input,
      idempotencyKey(request.headers)
    );
    response.status(result.replayed ? 200 : 201).json({
      ...result.value,
      replayed: result.replayed
    });
  });

  router.patch("/labs/:labId/invitations/:invitationId", async (request, response) => {
    const { labId, invitationId } = invitationIdParams.parse(request.params);
    await requireLabManager(repository, labId, request.identity);
    const { expectedRevision, ...patch } = updateSchema.parse(request.body);
    response.json(
      await repository.updateInvitation(
        labId,
        invitationId,
        request.identity,
        expectedRevision,
        patch
      )
    );
  });

  router.post("/labs/:labId/invitations/:invitationId/accept", async (request, response) => {
    const { labId, invitationId } = invitationIdParams.parse(request.params);
    const { expectedRevision } = revisionBody.parse(request.body);
    response.json(
      await repository.acceptInvitation(
        labId,
        invitationId,
        request.identity,
        expectedRevision
      )
    );
  });

  router.delete("/labs/:labId/invitations/:invitationId", async (request, response) => {
    const { labId, invitationId } = invitationIdParams.parse(request.params);
    await requireLabManager(repository, labId, request.identity);
    const { revision } = revisionQuery.parse(request.query);
    const invitation = await repository.revokeInvitation(
      labId,
      invitationId,
      request.identity,
      revision
    );
    response.json({ invitation });
  });

  return router;
}
