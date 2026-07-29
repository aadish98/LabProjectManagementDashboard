import { Router } from "express";
import { z } from "zod";
import { delegatedDriveToken } from "../auth/middleware.js";
import type { DrivePermissionClient } from "../drive/googleDrive.js";
import type { OnboardingRepository } from "../firestore/repository.js";
import { ApiError } from "../http/errors.js";
import { memberIdParams, revisionSchema } from "./schemas.js";

const bodySchema = z.object({ expectedRevision: revisionSchema });

export function drivePermissionsRouter(
  repository: OnboardingRepository,
  drive: DrivePermissionClient
): Router {
  const router = Router();

  router.post(
    "/labs/:labId/members/:memberId/drive-permissions",
    async (request, response) => {
      const { labId, memberId } = memberIdParams.parse(request.params);
      const { expectedRevision } = bodySchema.parse(request.body);
      const context = await repository.getDriveProvisioningContext(
        labId,
        request.identity.email,
        memberId
      );
      if (context.target.onboarding.status === "needsPicker") {
        response.json({
          member: context.target,
          results: [],
          replayed: true,
          message: "Drive sharing was already recorded; continue with exact-file Picker verification."
        });
        return;
      }
      if (context.target.onboarding.status !== "needsSharing") {
        throw new ApiError({
          status: 409,
          code: "DRIVE_PROVISIONING_NOT_READY",
          message: `Drive permissions cannot be provisioned while onboarding is ${context.target.onboarding.status}.`,
          action:
            context.target.onboarding.status === "invited"
              ? "Have the invited member accept the invitation first."
              : "Resolve the current onboarding state before provisioning Drive access."
        });
      }
      if (context.target.revision !== expectedRevision) {
        throw new ApiError({
          status: 409,
          code: "REVISION_CONFLICT",
          message: "The member changed after the Drive provisioning request was prepared.",
          action: "Fetch the latest member and retry with its current revision.",
          details: {
            expectedRevision,
            currentRevision: context.target.revision,
            context: { entity: "member", labId, memberId, operation: "driveProvisioning" }
          }
        });
      }

      // This token is intentionally scoped to this request. It is never passed to
      // persistence, included in an error, or attached to application logs.
      const accessToken = delegatedDriveToken(request);
      const results = [];
      try {
        for (const resource of context.resources) {
          results.push(
            await drive.createUserPermission(accessToken, resource, context.target.email)
          );
        }
        const state = await repository.recordDriveSharing(
          labId,
          memberId,
          request.identity,
          results.map((result) => result.fileId),
          expectedRevision
        );
        response.json({ ...state, results, replayed: false });
      } catch (error) {
        const created = results.filter(
          (result) => result.status === "created" && result.permissionId
        );
        const rollback = await Promise.allSettled(
          created.map((result) =>
            drive.deletePermission(accessToken, result.fileId, result.permissionId!)
          )
        );
        const failed = rollback.flatMap((result, index) =>
          result.status === "rejected"
            ? [{
                fileId: created[index]?.fileId ?? "unknown",
                permissionId: created[index]?.permissionId ?? "unknown"
              }]
            : []
        );
        if (failed.length > 0) {
          throw new ApiError({
            status: 500,
            code: "DRIVE_PROVISIONING_ROLLBACK_FAILED",
            message:
              "Drive provisioning did not commit, and one or more newly created permissions could not be removed.",
            action:
              "Use the returned exact file and permission IDs to remove the grants, then refresh the member before retrying.",
            retryable: false,
            details: { rollbackRequired: failed }
          });
        }
        throw error;
      }
    }
  );

  return router;
}
