import express, { Router } from "express";
import { z } from "zod";
import {
  BROKERED_REDIRECT_URI,
  type GoogleTokenBroker
} from "../auth/googleTokenBroker.js";
import { ApiError } from "../http/errors.js";
import { rateLimit } from "../http/rateLimit.js";

// RFC 7636 bounds the verifier at 43-128 characters.
const codeVerifierSchema = z.string().min(43).max(128);

const authorizationCodeSchema = z.object({
  clientId: z.string().trim().min(1).max(300),
  code: z.string().min(1).max(2048),
  codeVerifier: codeVerifierSchema,
  redirectUri: z.string().min(1).max(300)
});

const refreshSchema = z.object({
  clientId: z.string().trim().min(1).max(300),
  refreshToken: z.string().min(1).max(2048)
});

/**
 * Unauthenticated by necessity: the authorization-code caller has no ID token
 * yet, and the refresh caller's ID token has expired by definition, so
 * verifyIdToken would reject it. Mounted outside /v1 so it never sits behind
 * the authenticate() prefix guard and quietly look protected.
 */
export function googleTokenRouter(
  broker: GoogleTokenBroker,
  brokeredClientId: string
): Router {
  const router = Router();

  router.use(express.json({ limit: "8kb" }));
  router.use(
    rateLimit({ windowMs: 5 * 60_000, maxPerIp: 20, maxTotal: 200 })
  );

  router.post("/authorization-code", async (request, response) => {
    const body = authorizationCodeSchema.parse(request.body);
    assertBrokeredClient(body.clientId, brokeredClientId);
    if (body.redirectUri !== BROKERED_REDIRECT_URI) {
      throw new ApiError({
        status: 400,
        code: "UNSUPPORTED_REDIRECT_URI",
        message: "The requested OAuth redirect URI is not brokered by this service.",
        action: `Use the desktop loopback redirect ${BROKERED_REDIRECT_URI}.`
      });
    }
    response.json(
      await broker.exchangeAuthorizationCode({
        code: body.code,
        codeVerifier: body.codeVerifier,
        redirectUri: body.redirectUri
      })
    );
  });

  router.post("/refresh", async (request, response) => {
    const body = refreshSchema.parse(request.body);
    assertBrokeredClient(body.clientId, brokeredClientId);
    response.json(await broker.refreshAccessToken({ refreshToken: body.refreshToken }));
  });

  return router;
}

function assertBrokeredClient(requested: string, brokered: string): void {
  if (requested === brokered) return;
  throw new ApiError({
    status: 400,
    code: "UNKNOWN_OAUTH_CLIENT",
    message: "The requested Google OAuth client is not brokered by this service.",
    action:
      "The client ID is fixed by this deployment. Clear any custom client ID in Setup and sign in again."
  });
}
