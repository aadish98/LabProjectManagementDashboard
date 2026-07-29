import { Router } from "express";
import { z } from "zod";
import { delegatedDriveToken } from "../auth/middleware.js";
import type { EmptyRolesVerifier } from "../drive/bootstrapVerifier.js";
import type { OnboardingRepository } from "../firestore/repository.js";
import { idempotencyKey } from "./schemas.js";

const bootstrapBody = z.object({
  labName: z.string().trim().min(1).max(200),
  adminSpreadsheetId: z.string().trim().min(1).max(300)
});
const claimParams = z.object({ claimId: z.string().uuid() });

export function labsRouter(
  repository: OnboardingRepository,
  verifier: EmptyRolesVerifier,
  bootstrapClaimTtlSeconds: number
): Router {
  const router = Router();

  router.post("/bootstrap", async (request, response) => {
    const body = bootstrapBody.parse(request.body);
    const accessToken = delegatedDriveToken(request);
    await verifier.verify(accessToken, body.adminSpreadsheetId);
    const result = await repository.createBootstrapClaim(
      request.identity,
      { ...body, ttlSeconds: bootstrapClaimTtlSeconds },
      idempotencyKey(request.headers)
    );
    response.status(result.replayed ? 200 : 201).json({
      claim: result.value,
      replayed: result.replayed
    });
  });

  router.post("/bootstrap/:claimId/claim", async (request, response) => {
    const { claimId } = claimParams.parse(request.params);
    const result = await repository.claimLab(
      request.identity,
      claimId,
      idempotencyKey(request.headers)
    );
    response.status(result.replayed ? 200 : 201).json({
      ...result.value,
      replayed: result.replayed
    });
  });

  return router;
}
