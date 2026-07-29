import type { Request, RequestHandler } from "express";
import { ApiError } from "../http/errors.js";
import type { IdentityVerifier } from "./verifyGoogleIdentity.js";

export function authenticate(verifier: IdentityVerifier): RequestHandler {
  return async (request, _response, next) => {
    try {
      const authorization = request.header("authorization") ?? "";
      const match = authorization.match(/^Bearer\s+(.+)$/i);
      if (!match?.[1]) {
        throw new ApiError({
          status: 401,
          code: "ID_TOKEN_REQUIRED",
          message: "A Google ID token is required.",
          action: "Send the ID token in the Authorization: Bearer header."
        });
      }
      request.identity = await verifier.verify(match[1]);
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function delegatedDriveToken(request: Request): string {
  const token = request.header("x-google-drive-access-token")?.trim();
  if (!token) {
    throw new ApiError({
      status: 400,
      code: "DRIVE_ACCESS_TOKEN_REQUIRED",
      message: "A short-lived Google Drive access token is required for this operation.",
      action: "Request Drive consent, then send the token in X-Google-Drive-Access-Token."
    });
  }
  return token;
}
