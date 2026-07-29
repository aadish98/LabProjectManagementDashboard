import { randomUUID } from "node:crypto";
import express, { type RequestHandler } from "express";
import { authenticate } from "./auth/middleware.js";
import type { IdentityVerifier } from "./auth/verifyGoogleIdentity.js";
import type { EmptyRolesVerifier } from "./drive/bootstrapVerifier.js";
import type { DrivePermissionClient } from "./drive/googleDrive.js";
import type { OnboardingRepository } from "./firestore/repository.js";
import { ApiError, errorHandler, notFoundHandler } from "./http/errors.js";
import { drivePermissionsRouter } from "./routes/drivePermissions.js";
import { invitationsRouter } from "./routes/invitations.js";
import { labsRouter } from "./routes/labs.js";
import { membersRouter } from "./routes/members.js";

export interface AppDependencies {
  repository: OnboardingRepository;
  identityVerifier: IdentityVerifier;
  emptyRolesVerifier: EmptyRolesVerifier;
  drivePermissionClient: DrivePermissionClient;
  corsAllowedOrigins: string[];
  bootstrapClaimTtlSeconds: number;
  readinessCheck: () => Promise<void>;
}

export function createApp(dependencies: AppDependencies): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(requestMetadata(dependencies.corsAllowedOrigins));
  app.use(express.json({ limit: "256kb" }));

  app.get("/healthz", (_request, response) => {
    response.json({ status: "ok", check: "process" });
  });

  app.get("/readyz", async (_request, response, next) => {
    try {
      await dependencies.readinessCheck();
      response.json({ status: "ready", checks: { firestore: "ok" } });
    } catch {
      next(
        new ApiError({
          status: 503,
          code: "SERVICE_NOT_READY",
          message: "The service cannot reach its authoritative Firestore database.",
          action: "Check the Firestore database, runtime service-account IAM, and project settings.",
          retryable: true
        })
      );
    }
  });

  app.use("/v1", authenticate(dependencies.identityVerifier));
  app.use(
    "/v1/labs",
    labsRouter(
      dependencies.repository,
      dependencies.emptyRolesVerifier,
      dependencies.bootstrapClaimTtlSeconds
    )
  );
  app.use("/v1", invitationsRouter(dependencies.repository));
  app.use("/v1", membersRouter(dependencies.repository));
  app.use(
    "/v1",
    drivePermissionsRouter(dependencies.repository, dependencies.drivePermissionClient)
  );

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

function requestMetadata(allowedOrigins: string[]): RequestHandler {
  const allowed = new Set(allowedOrigins);
  return (request, response, next) => {
    request.id = request.header("x-request-id")?.slice(0, 128) || randomUUID();
    response.setHeader("X-Request-Id", request.id);
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Cache-Control", "no-store");

    const origin = request.header("origin");
    if (origin && allowed.has(origin)) {
      response.setHeader("Access-Control-Allow-Origin", origin);
      response.setHeader("Vary", "Origin");
      response.setHeader(
        "Access-Control-Allow-Headers",
        "Authorization, Content-Type, Idempotency-Key, X-Google-Drive-Access-Token, X-Request-Id"
      );
      response.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
    }
    if (request.method === "OPTIONS") {
      response.sendStatus(origin && allowed.has(origin) ? 204 : 403);
      return;
    }
    next();
  };
}
