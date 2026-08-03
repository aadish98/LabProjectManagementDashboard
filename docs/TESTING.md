# Testing and Release Verification

Run from the repository root unless noted.

## Single local release command

```sh
npm ci
npm ci --prefix backend
npm run verify:release
```

The default command runs frontend typecheck/tests/font/terminology/token-hygiene/build, the sample pilot inventory, backend typecheck/tests/build, a synthetic offline deployment preflight, Rust format/check/tests, and staged/unstaged diff whitespace checks. It emits a final `local-release-verification/v1` JSON line. The offline preflight validates files and non-secret syntax only; it never queries cloud APIs or submits a build.

Security regressions cover exact loopback/state/PKCE handling, broker token requests that carry no client secret, conditional consent, least scopes, initial/refreshed ID-token capture, the 60-second refresh buffer, revocation, local-storage token scrubbing, legacy migration, startup gating, awaited vault persistence, fresh-sign-in cleanup, and typed vault errors. They also fence the retryable/terminal split: a transient broker failure must leave the credential vault intact, while a rejected grant must still clear it. Backend coverage asserts the broker routes stay reachable without an `Authorization` header while `/v1` keeps returning `ID_TOKEN_REQUIRED`, that Google's `error_description` never reaches a response, and that the configured secret never appears in a thrown error.

`check:token-hygiene` scans source, configuration, **and** generated frontend/backend bundles for hardcoded Google client secret values — a `GOCSPX-` match under `dist/` means the secret leaked back into the shipped bundle. The line-oriented token-logging and `localStorage` patterns run against source only: they depend on `.*` staying within one statement, which is meaningless in a minified bundle whose single line spans ~100 KB. Because bundles are scanned, the check must run on fresh build output; `frontend:build` invokes it after `vite build`, and `verify:release` deliberately does not run it separately beforehand. Private `.env` files are intentionally neither read nor printed.

Optional checks run only when explicitly requested and fail closed:

```sh
# Requires JDK 21+ and the local Firebase emulator tooling.
npm run verify:release -- --emulator

# Build unsigned/current-host bundles. This is not signing or notarization.
npm run verify:release -- --package

# Use the exact packaged or debug Tauri executable to exercise the real OS vault.
VAULT_VERIFY_BINARY="/absolute/path/to/tauri-executable" \
  npm run verify:release -- --vault

# Non-mutating smoke only; SERVICE_URL must be an exact HTTPS origin.
SERVICE_URL="https://SERVICE_HASH-REGION.a.run.app" \
  npm run verify:release -- --live-smoke
```

The vault executable receives only `--verify-credential-vault`. Rust generates a unique disposable `vault-verification-…@invalid` label and value, stores and reloads it, and requires confirmed deletion before returning success. Cleanup is attempted on every path, the value never enters JavaScript or output, and the verifier emits only versioned status plus the disposable account label. This is not automatic and does not substitute for signed-package restart, denial, migration, online/offline sign-out, or real-account OAuth tests.

`npm run build` also creates platform installers using the normal Tauri configuration. Run it on each target OS with the intended signing identity; a build on one OS does not validate another OS's credential vault or installer.

## Backend

`npm run verify:release` includes backend typecheck, ordinary tests, build, and `DEPLOY_PREFLIGHT_OFFLINE=1 npm --prefix backend run deploy:check`. To inspect real cloud resources without deploying, configure the variables in `backend/README.md` and run `npm --prefix backend run deploy:check` without offline mode. Do not run `backend/scripts/deploy.sh --deploy` without an approved project, change window, rollback owner, and explicit authorization.

The normal backend suite skips the Firestore integration file when no emulator is present. The explicit emulator command starts and stops a local Firestore process, uses a non-deployable `demo-*` project, and fails instead of skipping if the emulator environment is missing:

```sh
npm ci
npm ci --prefix backend
npm run test:firestore-emulator
```

The Firebase emulator requires JDK 21 or newer. `npm run test:firestore-emulator` runs `scripts/run-firestore-emulator.mjs`, which auto-discovers a JDK 21+ runtime (respecting `JAVA_HOME`, then `/usr/libexec/java_home`, then common Homebrew/Linux install paths) and fails with install guidance if none is found. Do not invoke `npm --prefix backend run test:emulator` against a remote host or deployable project; its runner rejects both.

## Packaged manual checks

On macOS, Windows, and supported Linux:

1. Launch the signed installer and confirm only the session-loading screen appears before vault hydration finishes.
2. Complete OAuth and confirm consent is not forced when Google returns an existing refresh token.
3. Restart and confirm the OS vault restores the session without any token in WebView local storage.
4. Expire/force-refresh the access token and confirm both access and ID tokens refresh.
5. Sign out while online, then verify the vault entry and local session metadata are gone.
6. Repeat sign-out offline; local/vault cleanup must still run and the UI must report unconfirmed Google revocation.
7. Lock or deny the OS vault and confirm the app fails closed without showing a privileged route.
8. Verify an unauthorized account cannot derive access from Sheet readability.

## Non-mutating backend dry run

1. Export only the intended project/resource identifiers documented in `backend/README.md`.
2. Run `backend/scripts/deploy.sh --check`. PR CI sets `DEPLOY_PREFLIGHT_OFFLINE=1` to validate artifacts and configuration syntax without cloud credentials; omit it for authenticated cloud-resource checks.
3. Review every resolved project, region, service account, OAuth audience, and CORS origin.
4. Build the container locally and call `/health`.
5. Use the Firestore emulator for authenticated lifecycle tests where possible.
6. Record missing IAM, indexes, signing, OAuth verification, and real-account tests as blockers.

This procedure validates configuration and artifacts only. It does not deploy Cloud Run, modify Drive permissions, write production Firestore data, or migrate a real lab.

## Deployed backend smoke evidence

From `backend/`, run the non-mutating harness against the exact deployed URL:

```sh
export SERVICE_URL='https://SERVICE_HASH-REGION.a.run.app'
npm run smoke -- --base-url="${SERVICE_URL}"
```

It must pass process health, Firestore readiness, `401 ID_TOKEN_REQUIRED` for unauthenticated `/v1`, `no-store`, `nosniff`, and request-ID checks. To add real-account discovery, enter a fresh Google user ID token without echoing or placing it in the command line:

```sh
read -rs SMOKE_GOOGLE_ID_TOKEN
export SMOKE_GOOGLE_ID_TOKEN
printf '\n'
npm run smoke -- --base-url="${SERVICE_URL}"
unset SMOKE_GOOGLE_ID_TOKEN
```

Archive the JSON output with the release evidence. Required fields are `schemaVersion`, `checkedAt`, `baseUrl`, `mutationMode`, and every `checks[]` entry's `check`, `outcome`, `httpStatus`, and `requestId`. Authenticated discovery adds only membership/invitation `resultCount`; it does not print tokens, emails, or returned records.

The optional Drive provisioning mode is mutation-capable and is never part of an ordinary smoke run, Cloud Build, or GitHub Actions. Its exact disposable-context command, prerequisites, automatic permission-removal/member-deactivation rollback, manual rollback command, and evidence fields are documented in `backend/README.md`. Do not run it against an existing member, manager/PI member, non-disposable file, or pre-existing permission.
