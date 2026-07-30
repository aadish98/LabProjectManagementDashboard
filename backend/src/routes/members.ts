import { Router } from "express";
import { z } from "zod";
import { requireLabManager, requireSelfOrLabManager } from "../auth/authorizeLab.js";
import type { OnboardingRepository } from "../firestore/repository.js";
import { ApiError } from "../http/errors.js";
import {
  columnMapSchema,
  idempotencyKey,
  labIdParams,
  memberConfigInputSchema,
  memberIdParams,
  revisionSchema,
  rolesSchema
} from "./schemas.js";

const memberPatchSchema = z
  .object({
    expectedRevision: revisionSchema,
    displayName: z.string().trim().min(1).max(200).optional(),
    roles: rolesSchema.optional(),
    active: z.boolean().optional()
  })
  .refine((body) => Object.keys(body).some((key) => key !== "expectedRevision"), {
    message: "At least one member field must be changed."
  });

const revisionQuery = z.object({
  revision: z.coerce.number().int().positive(),
  invitationId: z.string().trim().min(1).optional(),
  invitationRevision: z.coerce.number().int().positive().optional()
}).refine(
  (query) => !!query.invitationId === (query.invitationRevision !== undefined),
  { message: "invitationId and invitationRevision must be provided together." }
);
const pickerProofSchema = z.object({
  expectedRevision: revisionSchema,
  spreadsheetId: z.string().trim().min(1).max(300)
});
const managerFileProofSchema = z.object({
  expectedRevision: revisionSchema,
  selectedFileIds: z.array(z.string().trim().min(1).max(300)).min(1).max(500)
});
const configPatchSchema = z
  .object({
    expectedRevision: revisionSchema,
    spreadsheetId: z.string().trim().min(1).max(300).optional(),
    taskLogUrl: z.string().url().max(2000).optional(),
    activeSheetName: z.string().trim().min(1).max(200).optional(),
    proposedColumnMap: columnMapSchema.optional(),
    acceptedColumnMap: columnMapSchema.optional(),
    columnReviewComplete: z.boolean().default(false)
  })
  .refine(
    (body) =>
      body.columnReviewComplete ||
      Object.keys(body).some(
        (key) => key !== "expectedRevision" && key !== "columnReviewComplete"
      ),
    { message: "At least one config field must be changed." }
  );
const blockSchema = z.object({
  expectedRevision: revisionSchema,
  reason: z.string().trim().min(1).max(500),
  nextAction: z.string().trim().min(1).max(500)
});
const resumeSchema = z.object({ expectedRevision: revisionSchema });
const memberSetupPatchSchema = z.object({
  expectedMemberRevision: revisionSchema,
  expectedConfigRevision: revisionSchema,
  member: z.object({
    displayName: z.string().trim().min(1).max(200),
    roles: rolesSchema,
    active: z.boolean()
  }),
  config: z.object({
    spreadsheetId: z.string().trim().min(1).max(300),
    taskLogUrl: z.string().url().max(2000),
    activeSheetName: z.string().trim().min(1).max(200),
    proposedColumnMap: columnMapSchema
  })
});

export function membersRouter(repository: OnboardingRepository): Router {
  const router = Router();

  router.get("/me/memberships", async (request, response) => {
    const memberships = await repository.listMembershipsForEmail(request.identity.email);
    response.json({
      memberships: memberships.map(({ lab, ...membership }) => {
        const { adminSpreadsheetId: _operatorOnly, ...clientLab } = lab;
        return { ...membership, lab: clientLab };
      })
    });
  });

  router.get("/labs/:labId/members", async (request, response) => {
    const { labId } = labIdParams.parse(request.params);
    await requireLabManager(repository, labId, request.identity);
    response.json({ members: await repository.listMembers(labId) });
  });

  router.post("/labs/:labId/members", async (request, response) => {
    const { labId } = labIdParams.parse(request.params);
    await requireLabManager(repository, labId, request.identity);
    const input = memberConfigInputSchema.parse(request.body);
    const result = await repository.createMember(
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

  router.get("/labs/:labId/members/:memberId", async (request, response) => {
    const { labId, memberId } = memberIdParams.parse(request.params);
    const member = await requireSelfOrLabManager(
      repository,
      labId,
      memberId,
      request.identity
    );
    response.json({ member });
  });

  router.patch("/labs/:labId/members/:memberId", async (request, response) => {
    const { labId, memberId } = memberIdParams.parse(request.params);
    await requireLabManager(repository, labId, request.identity);
    const { expectedRevision, ...patch } = memberPatchSchema.parse(request.body);
    const member = await repository.updateMember(
      labId,
      memberId,
      request.identity,
      expectedRevision,
      patch
    );
    response.json({ member });
  });

  router.patch("/labs/:labId/members/:memberId/setup", async (request, response) => {
    const { labId, memberId } = memberIdParams.parse(request.params);
    await requireLabManager(repository, labId, request.identity);
    const body = memberSetupPatchSchema.parse(request.body);
    response.json(
      await repository.updateMemberSetup(
        labId,
        memberId,
        request.identity,
        body.expectedMemberRevision,
        body.expectedConfigRevision,
        body.member,
        body.config
      )
    );
  });

  router.delete("/labs/:labId/members/:memberId", async (request, response) => {
    const { labId, memberId } = memberIdParams.parse(request.params);
    await requireLabManager(repository, labId, request.identity);
    const { revision, invitationId, invitationRevision } = revisionQuery.parse(request.query);
    const member = await repository.deactivateMember(
      labId,
      memberId,
      request.identity,
      revision,
      invitationId && invitationRevision
        ? { id: invitationId, expectedRevision: invitationRevision }
        : undefined
    );
    response.json({ member });
  });

  router.get("/labs/:labId/members/:memberId/config", async (request, response) => {
    const { labId, memberId } = memberIdParams.parse(request.params);
    await requireSelfOrLabManager(repository, labId, memberId, request.identity);
    response.json({ config: await repository.getConfig(labId, memberId) });
  });

  router.patch("/labs/:labId/members/:memberId/config", async (request, response) => {
    const { labId, memberId } = memberIdParams.parse(request.params);
    await requireSelfOrLabManager(repository, labId, memberId, request.identity);
    const { expectedRevision, columnReviewComplete, ...patch } = configPatchSchema.parse(
      request.body
    );
    response.json(
      await repository.updateConfig(
        labId,
        memberId,
        request.identity,
        expectedRevision,
        patch,
        columnReviewComplete
      )
    );
  });

  router.post("/labs/:labId/members/:memberId/picker-proof", async (request, response) => {
    const { labId, memberId } = memberIdParams.parse(request.params);
    const member = await repository.getMember(labId, memberId);
    if (member.normalizedEmail !== request.identity.email.trim().toLowerCase()) {
      throw new ApiError({
        status: 403,
        code: "PICKER_PROOF_MUST_BE_SELF_REPORTED",
        message: "Exact-file Picker proof must come from the invited member's Google account.",
        action: "Sign in as the member and select the exact invited workbook."
      });
    }
    const body = pickerProofSchema.parse(request.body);
    response.json(
      await repository.recordPickerProof(
        labId,
        memberId,
        request.identity,
        body.spreadsheetId,
        body.expectedRevision
      )
    );
  });

  router.get(
    "/labs/:labId/members/:memberId/manager-file-proof",
    async (request, response) => {
      const { labId, memberId } = memberIdParams.parse(request.params);
      response.json(
        await repository.getManagerFileProgress(
          labId,
          memberId,
          request.identity
        )
      );
    }
  );

  router.post(
    "/labs/:labId/members/:memberId/manager-file-proof",
    async (request, response) => {
      const { labId, memberId } = memberIdParams.parse(request.params);
      const body = managerFileProofSchema.parse(request.body);
      response.json(
        await repository.recordManagerFileProof(
          labId,
          memberId,
          request.identity,
          body.selectedFileIds,
          body.expectedRevision
        )
      );
    }
  );

  router.post("/labs/:labId/members/:memberId/onboarding/block", async (request, response) => {
    const { labId, memberId } = memberIdParams.parse(request.params);
    await requireLabManager(repository, labId, request.identity);
    const body = blockSchema.parse(request.body);
    const member = await repository.blockMember(
      labId,
      memberId,
      request.identity,
      body.expectedRevision,
      body.reason,
      body.nextAction
    );
    response.json({ member });
  });

  router.post("/labs/:labId/members/:memberId/onboarding/resume", async (request, response) => {
    const { labId, memberId } = memberIdParams.parse(request.params);
    await requireLabManager(repository, labId, request.identity);
    const body = resumeSchema.parse(request.body);
    const member = await repository.resumeMember(
      labId,
      memberId,
      request.identity,
      body.expectedRevision
    );
    response.json({ member });
  });

  return router;
}
