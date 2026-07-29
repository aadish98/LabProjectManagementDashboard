import { GoogleAuth } from "google-auth-library";
import { createApp } from "./app.js";
import { GoogleIdentityVerifier } from "./auth/verifyGoogleIdentity.js";
import { loadConfig } from "./config.js";
import { GoogleSheetsEmptyRolesVerifier } from "./drive/bootstrapVerifier.js";
import { GoogleDrivePermissionClient } from "./drive/googleDrive.js";
import {
  createFirestore,
  FirestoreOnboardingRepository
} from "./firestore/firestoreRepository.js";

const config = loadConfig();
const firestore = createFirestore(config.projectId, config.databaseId);
const applicationDefaultCredentials = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/datastore"]
});
const app = createApp({
  repository: new FirestoreOnboardingRepository(firestore),
  identityVerifier: new GoogleIdentityVerifier(config.googleOAuthClientIds),
  emptyRolesVerifier: new GoogleSheetsEmptyRolesVerifier(),
  drivePermissionClient: new GoogleDrivePermissionClient(),
  corsAllowedOrigins: config.corsAllowedOrigins,
  bootstrapClaimTtlSeconds: config.bootstrapClaimTtlSeconds,
  readinessCheck: async () => {
    await applicationDefaultCredentials.getClient();
    await firestore.doc("_service/readiness").get();
  }
});

const server = app.listen(config.port, "0.0.0.0", () => {
  process.stdout.write(`Lab workflow backend listening on port ${config.port}\n`);
});

const shutdown = (signal: string): void => {
  process.stdout.write(`Received ${signal}; shutting down\n`);
  server.close((error) => {
    if (error) {
      process.stderr.write("HTTP server shutdown failed\n");
      process.exitCode = 1;
    }
    void firestore.terminate().finally(() => process.exit());
  });
};

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
