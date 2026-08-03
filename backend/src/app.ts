import { randomUUID } from "node:crypto";
import express, { type RequestHandler } from "express";
import { authenticate } from "./auth/middleware.js";
import type { GoogleTokenBroker } from "./auth/googleTokenBroker.js";
import type { IdentityVerifier } from "./auth/verifyGoogleIdentity.js";
import type { DrivePermissionClient } from "./drive/googleDrive.js";
import type { OnboardingRepository } from "./firestore/repository.js";
import { ApiError, errorHandler, notFoundHandler } from "./http/errors.js";
import { drivePermissionsRouter } from "./routes/drivePermissions.js";
import { googleTokenRouter } from "./routes/googleToken.js";
import { invitationsRouter } from "./routes/invitations.js";
import { membersRouter } from "./routes/members.js";

export interface AppDependencies {
  repository: OnboardingRepository;
  identityVerifier: IdentityVerifier;
  drivePermissionClient: DrivePermissionClient;
  googleTokenBroker: GoogleTokenBroker;
  brokeredClientId: string;
  corsAllowedOrigins: string[];
  readinessCheck: () => Promise<void>;
}

export function createApp(dependencies: AppDependencies): express.Express {
  const app = express();
  app.disable("x-powered-by");
  // Cloud Run appends the caller address as the last X-Forwarded-For entry.
  // Without this, request.ip is the internal front end and per-IP rate limiting
  // collapses into a single shared bucket.
  app.set("trust proxy", 1);
  app.use(requestMetadata(dependencies.corsAllowedOrigins));

  // Mounted before the 256kb parser so the broker keeps its own tighter limit.
  app.use(
    "/auth/google/token",
    googleTokenRouter(dependencies.googleTokenBroker, dependencies.brokeredClientId)
  );

  app.use(express.json({ limit: "256kb" }));

  // Avoid Cloud Run reserved paths that end in "z" (e.g. /healthz is intercepted
  // by Google's edge and returns a Google HTML 404 before reaching the container).
  app.get("/health", (_request, response) => {
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

function isAllowedOrigin(origin: string, allowed: Set<string>): boolean {
  if (allowed.has(origin)) return true;
  // Tauri production webviews use tauri://localhost or http(s)://tauri.localhost
  // (sometimes with an explicit port). Keep exact env allowlist entries authoritative
  // for any other origins.
  if (/^tauri:\/\/localhost(?::\d+)?$/i.test(origin)) return true;
  if (/^https?:\/\/tauri\.localhost(?::\d+)?$/i.test(origin)) return true;
  return false;
}

function requestMetadata(allowedOrigins: string[]): RequestHandler {
  const allowed = new Set(allowedOrigins);
  return (request, response, next) => {
    request.id = request.header("x-request-id")?.slice(0, 128) || randomUUID();
    response.setHeader("X-Request-Id", request.id);
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Cache-Control", "no-store");

    const origin = request.header("origin");
    if (origin && isAllowedOrigin(origin, allowed)) {
      response.setHeader("Access-Control-Allow-Origin", origin);
      response.setHeader("Vary", "Origin");
      response.setHeader("Access-Control-Max-Age", "600");
      response.setHeader(
        "Access-Control-Allow-Headers",
        "Authorization, Content-Type, Idempotency-Key, X-Google-Drive-Access-Token, X-Request-Id"
      );
      response.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
    }
    if (request.method === "OPTIONS") {
      response.sendStatus(origin && isAllowedOrigin(origin, allowed) ? 204 : 403);
      return;
    }
    next();
  };
}
