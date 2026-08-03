# Architecture

## Authority boundaries

- **Firestore is authoritative** for labs, memberships, roles, invitations, onboarding state, immutable IDs, workbook/tab configuration, shared column maps, revisions, idempotency records, and onboarding events.
- **Google Sheets is authoritative** for task-log contents.
- **The Admin workbook is an operator-only import source.** The desktop client never reads it, asks users to select it, or receives its file ID. The app contains no code that reads or writes a roster workbook at run time, and writes nothing back to it — the workbook is an input snapshot, never a mirror. The two directions of authority therefore never meet inside one code path.
- **Local storage is a cache only.** It contains non-secret configuration, identity metadata, preferences, and visibly stale dataset caches.

The Tauri client calls the Cloud Run onboarding API with a Google ID token. The API verifies issuer, audience, signature, expiry, and verified email, then authorizes against active Firestore membership. Cloud Run is designed for Firestore access only; its runtime identity does not receive Google Drive access.

## Desktop authentication

Google OAuth uses a Desktop app client with authorization code plus PKCE and requests only `openid`, `email`, `profile`, and `drive.file`. The fixed callback is `http://127.0.0.1:53682`; the client rejects any other scheme, host, port, path, or state. Token exchanges send the client ID and PKCE verifier, never a bundled client secret. `prompt=consent` is omitted normally and used only when Google does not return a refresh token or the caller explicitly forces consent.

Google's token endpoint requires `client_secret` for Desktop clients even under PKCE, so the backend brokers both grants rather than shipping the secret to devices. `POST /auth/google/token/authorization-code` and `POST /auth/google/token/refresh` accept the PKCE result and inject the secret server-side, reading it from Secret Manager as `GOOGLE_OAUTH_CLIENT_SECRET`. Both routes are mounted outside `/v1` and are necessarily unauthenticated: the code-exchange caller has no ID token yet, and the refresh caller's ID token has expired by definition. They are constrained instead by a pinned client ID, a pinned redirect URI, PKCE itself, an 8 KB body cap, and a fixed-window rate limit (20 requests per IP and 200 total per five minutes, per instance). Google's `error_description` is never relayed; responses are a fixed field whitelist. Revocation and userinfo still call Google directly, since neither needs the secret.

Broker failures are classified as retryable or terminal, and the desktop keys its recovery on that distinction: a rejected grant clears the credential vault, while a transient backend or Google outage leaves the stored refresh token intact. Google classifies installed-app client secrets as non-confidential, so this is not a confidentiality boundary; the gain is that the live secret is no longer distributed in every installer and can be rotated without shipping a build.

The authorization response must include an ID token, and refresh responses must provide a refreshed ID token before the app publishes the session. Refresh tokens are stored under the normalized account in the OS credential vault. Access and ID tokens remain in memory. Startup awaits vault hydration and refresh before setting a session, so privileged routes cannot render from local identity metadata alone. Refreshes are securely persisted before the new in-memory session is published. Source and build hygiene reject any hardcoded Google client secret value and likely token logging or direct token `localStorage` writes.

Sign-out clears the in-memory session immediately, attempts Google revocation using the refresh token (or access token when no refresh token exists), and deletes local metadata and vault credentials in a `finally`-equivalent path. Fresh-sign-in recovery also clears the vault. Vault failures are surfaced for manual remediation.

The Tauri build manifest generates explicit permissions for Picker and secret commands; the `main` window capability grants only those commands plus the required shell/OAuth plugin permissions. A real-vault diagnostic exists only as an explicit packaged/debug binary flag. It generates its value in Rust, uses a unique disposable `@invalid` account label, verifies store/load equality, requires deletion, emits only non-secret JSON evidence, and is never called during normal startup.

## Authoritative onboarding

The normal lifecycle is:

1. `invited`
2. `needsSharing`
3. `needsPicker`
4. `needsColumnReview`
5. `ready`

`blocked` records the prior state, owner, reason, and next action. Resume returns to that recorded state. Creation uses idempotency keys; mutations require expected revisions and reject stale clients.

An operator creates or synchronizes a lab by running the roster importer against
the canonical `Roles` and `SheetRegistry` tabs. The importer validates the full
input before atomically writing Firestore. There is no desktop bootstrap route.

Members, invitations, labs, and task records use stable IDs. Firestore member configs hold the exact spreadsheet ID, active tab, proposed map, and member-accepted map. The accepted shared map is used on other devices; it is not reconstructed from a local-only preference.

The pilot inventory tool accepts only a redacted/exported JSON fixture and performs no network calls. It reports duplicate identities and file IDs, missing stable IDs, tab/map mismatches, task-ID metadata, role-derived exact file sets, and proposed lifecycle classifications as versioned JSON evidence. It cannot mutate Sheets, Drive, or Firestore.

## Drive provisioning

A manager or PI authorized by Firestore asks the backend to provision Drive access. The backend derives the exact files from Firestore; clients cannot submit arbitrary file IDs. The caller's Drive token is passed in a separate header, used in memory for that request, and never persisted or logged.

Sharing and Picker are distinct. Drive sharing lets the account open the file; `drive.file` still requires that same account to select the exact configured file. Picker proof must come from the target member and must match the authoritative spreadsheet ID.

## Reads, caches, and writes

Manager data loads are member-isolated. Authentication failures stop the load, while missing grants, stale tabs, and member-specific Sheets errors become explicit issues. Successful members remain visible, and last-known records for failed members may be merged from the per-viewer cache with stale markers.

Existing task updates re-find the stable Task ID and verify the expected `Task Revision` immediately before writing, then update only changed mapped cells while incrementing the revision in the same Sheets `values.batchUpdate`. Missing metadata is added/backfilled for populated legacy rows before mutation. This detects moved rows and revisions that changed before the final verification read, but Sheets provides no compare-and-swap precondition: another writer can still change the row between that read and the batch commit. Firestore mutations use transactions and revision checks.

## Remaining constraints

- Firestore and Google Sheets cannot share one transaction. Firestore remains the runtime authority, and operator imports must be reviewed before applying.
- Picker grants are per account and exact file and cannot be centrally transferred.
- Duplicate, missing, externally deleted, or manually corrupted Task IDs/Revisions require repair. Multi-writer reconciliation remains necessary for the final Sheets read-to-batch race.
- Formatted Sheets values, especially ambiguous dates, still need validation.
- OS vault behavior, OAuth loopback callbacks, signing, and notarization require packaged testing on each platform.
- The disposable vault diagnostic proves only one store/load/delete round trip for the exact executable and current OS account that ran it; it does not prove restart, denial, migration, or sign-out behavior.
- This architecture and its deployment tooling do not prove that a Cloud Run service, GCP project, or real lab migration exists.
