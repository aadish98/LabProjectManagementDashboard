#!/usr/bin/env node

import { loadEnv } from "vite";

const env = {
  ...loadEnv("production", process.cwd(), ""),
  ...process.env
};

const required = [
  "VITE_BACKEND_BASE_URL",
  "VITE_GOOGLE_CLIENT_ID",
  "VITE_GOOGLE_CLIENT_SECRET",
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
