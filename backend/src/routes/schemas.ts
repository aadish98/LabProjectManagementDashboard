import { z } from "zod";
import type { Request } from "express";
import { LAB_ROLES } from "../domain/types.js";
import { ApiError } from "../http/errors.js";

export const labIdParams = z.object({ labId: z.string().uuid() });
export const memberIdParams = labIdParams.extend({ memberId: z.string().uuid() });
export const invitationIdParams = labIdParams.extend({ invitationId: z.string().uuid() });
export const revisionSchema = z.number().int().positive();
export const rolesSchema = z.array(z.enum(LAB_ROLES)).min(1).transform(unique);
export const columnMapSchema = z.record(
  z.string().min(1),
  z.object({
    mode: z.enum(["existing", "add"]),
    header: z.string().trim().min(1).max(200)
  })
);

export const memberConfigInputSchema = z.object({
  email: z.string().email().transform((value) => value.trim().toLowerCase()),
  displayName: z.string().trim().min(1).max(200),
  roles: rolesSchema,
  spreadsheetId: z.string().trim().min(1).max(300),
  taskLogUrl: z.string().url().max(2000).optional(),
  activeSheetName: z.string().trim().min(1).max(200),
  proposedColumnMap: columnMapSchema.default({})
});

export function idempotencyKey(headers: Request["headers"]): string {
  const value = headers["idempotency-key"];
  const key = Array.isArray(value) ? value[0] : value;
  if (!key || key.length < 8 || key.length > 200) {
    throw new ApiError({
      status: 400,
      code: "IDEMPOTENCY_KEY_REQUIRED",
      message: "This mutation requires an Idempotency-Key header between 8 and 200 characters.",
      action: "Generate a stable UUID for this user action and reuse it for retries."
    });
  }
  return key;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
