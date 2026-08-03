#!/usr/bin/env node

import { access } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const flags = new Set(process.argv.slice(2));
const allowedFlags = new Set(["--emulator", "--help", "--live-smoke", "--package", "--vault"]);
for (const flag of flags) {
  if (!allowedFlags.has(flag)) {
    process.stderr.write(`Unknown release verification option: ${flag}\n`);
    process.exit(64);
  }
}

if (flags.has("--help")) {
  process.stdout.write(`Usage: npm run verify:release -- [options]

Default checks are local and non-mutating:
  frontend typecheck, tests, font/terminology/security checks, and build
  pilot inventory sample, backend typecheck/tests/build/offline preflight
  Rust format/check/tests, and staged/unstaged diff whitespace

Options (all fail closed when requested):
  --emulator    Run the explicit local Firestore emulator integration suite
  --package     Build unsigned/current-host Tauri bundles
  --vault       Run VAULT_VERIFY_BINARY --verify-credential-vault
  --live-smoke  Run non-mutating backend smoke against HTTPS SERVICE_URL
`);
  process.exit(0);
}

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const completed = [];

function run(label, executable, arguments_, options = {}) {
  process.stdout.write(`\n==> ${label}\n`);
  const startedAt = Date.now();
  const result = spawnSync(executable, arguments_, {
    cwd: options.cwd ?? process.cwd(),
    env: { ...process.env, ...(options.env ?? {}) },
    encoding: options.capture ? "utf8" : undefined,
    stdio: options.capture ? "pipe" : "inherit"
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (options.capture && result.stderr) process.stderr.write(result.stderr);
    throw new Error(`${label} failed with exit code ${result.status ?? "unknown"}.`);
  }
  completed.push({ check: label, durationMs: Date.now() - startedAt });
  return result;
}

function runNpm(label, arguments_, options) {
  return run(label, npmCommand, arguments_, options);
}

function offlineDeployEnvironment() {
  return {
    DEPLOY_PREFLIGHT_OFFLINE: "1",
    GCP_PROJECT_ID: "lab-workflow-local",
    GCP_REGION: "us-central1",
    CLOUD_RUN_SERVICE: "lab-workflow-backend",
    CLOUD_RUN_RUNTIME_SERVICE_ACCOUNT:
      "runtime@lab-workflow-local.iam.gserviceaccount.com",
    CLOUD_BUILD_SERVICE_ACCOUNT: "build@lab-workflow-local.iam.gserviceaccount.com",
    ARTIFACT_REGISTRY_REPOSITORY: "cloud-run",
    GOOGLE_OAUTH_CLIENT_IDS: "123456789-local.apps.googleusercontent.com",
    GOOGLE_OAUTH_TOKEN_CLIENT_ID: "123456789-local.apps.googleusercontent.com",
    GOOGLE_OAUTH_CLIENT_SECRET_NAME: "google-oauth-client-secret",
    CORS_ALLOWED_ORIGINS: "https://local.invalid"
  };
}

try {
  runNpm("Frontend typecheck", ["run", "typecheck"]);
  runNpm("Frontend tests", ["test"]);
  runNpm("Audit structure", ["run", "check:audit-structure"]);
  runNpm("Portable font policy", ["run", "check:fonts"]);
  runNpm("Terminology policy", ["run", "check:terminology"]);
  // Token hygiene now scans dist/ too, so it must run on fresh build output.
  // frontend:build invokes check:token-hygiene after vite build; running it
  // here as well would scan a stale bundle from a previous release.
  runNpm("Frontend production build", ["run", "frontend:build"]);

  const inventory = run(
    "Pilot migration inventory sample",
    process.execPath,
    ["scripts/pilot-migration-inventory.mjs", "scripts/pilot-migration.sample.json"],
    { capture: true }
  );
  const inventoryEvidence = JSON.parse(inventory.stdout);
  if (
    inventoryEvidence.schemaVersion !== "pilot-migration-inventory/v1" ||
    inventoryEvidence.mutationMode !== "none"
  ) {
    throw new Error("Pilot inventory did not produce non-mutating v1 evidence.");
  }

  runNpm("Backend typecheck", ["--prefix", "backend", "run", "typecheck"]);
  runNpm("Backend tests", ["--prefix", "backend", "test"]);
  runNpm("Backend build", ["--prefix", "backend", "run", "build"]);
  runNpm(
    "Backend offline deployment preflight",
    ["--prefix", "backend", "run", "deploy:check"],
    { env: offlineDeployEnvironment() }
  );

  run("Rust format check", "cargo", [
    "fmt",
    "--manifest-path",
    "src-tauri/Cargo.toml",
    "--check"
  ]);
  run("Rust check", "cargo", [
    "check",
    "--manifest-path",
    "src-tauri/Cargo.toml"
  ]);
  run("Rust tests", "cargo", [
    "test",
    "--manifest-path",
    "src-tauri/Cargo.toml"
  ]);
  run("Unstaged diff whitespace", "git", ["diff", "--check"]);
  run("Staged diff whitespace", "git", ["diff", "--cached", "--check"]);

  if (flags.has("--emulator")) {
    runNpm("Firestore emulator integration", ["run", "test:firestore-emulator"]);
  }

  if (flags.has("--package")) {
    runNpm("Current-host Tauri package", ["run", "tauri:build"]);
  }

  if (flags.has("--vault")) {
    const binary = process.env.VAULT_VERIFY_BINARY?.trim();
    if (!binary) {
      throw new Error(
        "--vault requires VAULT_VERIFY_BINARY to name a packaged/debug Tauri executable."
      );
    }
    const absoluteBinary = path.resolve(binary);
    await access(absoluteBinary);
    const result = run(
      "Real OS credential-vault round trip",
      absoluteBinary,
      ["--verify-credential-vault"],
      { capture: true }
    );
    const evidence = JSON.parse(result.stdout.trim());
    if (
      evidence.schemaVersion !== 1 ||
      evidence.roundTripVerified !== true ||
      evidence.credentialDeleted !== true ||
      !String(evidence.accountLabel ?? "").startsWith("vault-verification-")
    ) {
      throw new Error("Credential-vault verification returned invalid evidence.");
    }
    process.stdout.write(`${JSON.stringify(evidence)}\n`);
  }

  if (flags.has("--live-smoke")) {
    const serviceUrl = process.env.SERVICE_URL?.trim();
    if (!serviceUrl) {
      throw new Error("--live-smoke requires SERVICE_URL.");
    }
    const parsed = new URL(serviceUrl);
    if (parsed.protocol !== "https:" || parsed.origin !== serviceUrl) {
      throw new Error("SERVICE_URL must be an exact HTTPS origin.");
    }
    runNpm("Live non-mutating backend smoke", [
      "--prefix",
      "backend",
      "run",
      "smoke",
      "--",
      `--base-url=${serviceUrl}`
    ]);
  }

  process.stdout.write(
    `\n${JSON.stringify({
      schemaVersion: "local-release-verification/v1",
      completedAt: new Date().toISOString(),
      optional: {
        emulator: flags.has("--emulator"),
        package: flags.has("--package"),
        vault: flags.has("--vault"),
        liveSmoke: flags.has("--live-smoke")
      },
      checks: completed
    })}\n`
  );
} catch (error) {
  process.stderr.write(
    `\nRelease verification stopped: ${error instanceof Error ? error.message : String(error)}\n`
  );
  process.exitCode = 1;
}
