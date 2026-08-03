#!/usr/bin/env node

import { loadEnv } from "vite";

const env = {
  ...loadEnv("production", process.cwd(), ""),
  ...process.env
};

const required = [
  "VITE_BACKEND_BASE_URL",
  "VITE_GOOGLE_CLIENT_ID",
  "VITE_GOOGLE_API_KEY",
  "VITE_GOOGLE_APP_ID"
];
const missing = required.filter((name) => !env[name]?.trim());

if (missing.length > 0) {
  process.stderr.write(
    `Missing required desktop build variables: ${missing.join(", ")}\n`
  );
  process.exit(1);
}

// The backend brokers Google's token endpoint, so the bundle must never receive
// a client secret. Catches a stale .env or a leftover CI variable.
if (env.VITE_GOOGLE_CLIENT_SECRET?.trim()) {
  process.stderr.write(
    "VITE_GOOGLE_CLIENT_SECRET must not be set: the desktop bundle must not receive a Google client secret. " +
      "Store it in Secret Manager as GOOGLE_OAUTH_CLIENT_SECRET for the backend instead.\n"
  );
  process.exit(1);
}

let backend;
try {
  backend = new URL(env.VITE_BACKEND_BASE_URL);
} catch {
  process.stderr.write("VITE_BACKEND_BASE_URL must be a valid URL.\n");
  process.exit(1);
}

if (
  backend.protocol !== "https:" ||
  backend.origin !== env.VITE_BACKEND_BASE_URL.trim()
) {
  process.stderr.write(
    "VITE_BACKEND_BASE_URL must be an HTTPS origin without a path or trailing slash.\n"
  );
  process.exit(1);
}

process.stdout.write("Desktop build configuration is complete.\n");
