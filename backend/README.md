# Lab Workflow Cloud Run Backend

This directory is an isolated TypeScript service for Google Cloud Run. Firestore is authoritative for lab access, roles, invitations, onboarding state, shared task-log configuration, and append-only onboarding events. Google Sheets remains task storage and a later compatibility mirror; it is not an authorization source.

The service does not persist or log Google OAuth tokens. Every authenticated `/v1` request uses a Google ID token in `Authorization: Bearer …`; `/healthz` and `/readyz` are intentionally unauthenticated. Operations that call Google Drive or verify the bootstrap workbook require a separate, short-lived token in `X-Google-Drive-Access-Token`.

## Data model

Firestore records use stable UUIDs and integer revisions:

- `labs/{labId}` — immutable lab ID, display name, admin workbook ID, revision.
- `labs/{labId}/members/{memberId}` — normalized email, Firestore roles, active flag, revision, exact onboarding state.
- `labs/{labId}/invitations/{invitationId}` — invitee email index, roles, expiry, acceptance/revocation status, revision.
- `labs/{labId}/configs/{memberId}` — authoritative workbook ID, explicit tab, proposed/accepted shared column maps, sharing and Picker proof timestamps.
- `labs/{labId}/events/{eventId}` — append-only actor, transition, revision, and timestamp audit events.
- `bootstrapClaims/{claimId}` — short-lived proof that the claiming Google account successfully read an intentionally empty canonical `Roles` sheet.
- lab/global `idempotency` documents — hashed request keys pointing to stable resource UUIDs.

Invitation discovery uses a Firestore collection-group query on normalized email, pending status, and expiration. The required composite index is declared in `firestore.indexes.json` and created idempotently by `cloudbuild.yaml`.

## Exact onboarding lifecycle

The only normal progression is:

1. `invited` — invitation/member/config transaction exists.
2. `needsSharing` — the invited Google account accepted the invitation.
3. `needsPicker` — a Firestore-authorized manager or PI used `permissions.create` for every required Drive file.
4. `needsColumnReview` — the member reported exact-file Picker proof matching the authoritative spreadsheet ID.
5. `ready` — a non-empty accepted shared column map was saved.

`blocked` records the prior status, owner, reason, and next action. Resume returns only to that recorded prior status. Skipping lifecycle prerequisites returns `409 INVALID_ONBOARDING_TRANSITION`.

## API

All `/v1` routes require the Google ID token. Manager routes query the caller's active Firestore member record and require `manager` or `pi`; file access is never interpreted as authorization.

- `GET /healthz` — process-only liveness; never checks Firestore.
- `GET /readyz` — readiness check that performs a Firestore read.
- `GET /v1/me/invitations`
- `GET /v1/me/memberships`
- `POST /v1/labs/bootstrap`
- `POST /v1/labs/bootstrap/:claimId/claim`
- `GET|POST /v1/labs/:labId/members`
- `GET|PATCH|DELETE /v1/labs/:labId/members/:memberId`
- `PATCH /v1/labs/:labId/members/:memberId/setup`
- `GET|PATCH /v1/labs/:labId/members/:memberId/config`
- `POST /v1/labs/:labId/members/:memberId/picker-proof`
- `GET|POST /v1/labs/:labId/members/:memberId/manager-file-proof`
- `POST /v1/labs/:labId/members/:memberId/onboarding/block`
- `POST /v1/labs/:labId/members/:memberId/onboarding/resume`
- `GET|POST /v1/labs/:labId/invitations`
- `GET|PATCH|DELETE /v1/labs/:labId/invitations/:invitationId`
- `POST /v1/labs/:labId/invitations/:invitationId/accept`
- `POST /v1/labs/:labId/members/:memberId/drive-permissions`

Creation routes require an `Idempotency-Key` header. PATCH/DELETE/status routes require the current revision and return `409 REVISION_CONFLICT` when stale.

Drive provisioning derives the permitted file set from Firestore. Employees receive their configured task log. Manager/PI targets receive the admin workbook and every configured task log. The client cannot supply an arbitrary Drive file ID.

Errors have a stable shape:

```json
{
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "The record changed after it was loaded.",
    "action": "Fetch the latest record, merge the intended change, and retry.",
    "retryable": false,
    "requestId": "..."
  }
}
```

## Local setup

Requires Node.js 22 or later and Application Default Credentials for a real Firestore project.

```sh
cd backend
cp .env.example .env
npm ci
npm run typecheck
npm test
npm run dev
```

The process reads environment variables directly; load `.env` with your preferred local process runner. Do not put access tokens in `.env`.

For repository integration tests, start a Firestore emulator, export its host, then run:

```sh
export FIRESTORE_EMULATOR_HOST=127.0.0.1:8085
export GOOGLE_CLOUD_PROJECT=lab-workflow-backend-test
npm run test:emulator
```

The emulator test clears only the configured emulator project, then verifies transactional lab claim, stable UUIDs, invitation idempotency, and normalized-email discovery. It is skipped during the normal unit test command when `FIRESTORE_EMULATOR_HOST` is absent.

## Production deployment

Deployment is split into auditable components:

- `firestore.indexes.json` is the canonical invitation lookup index definition.
- `cloudbuild.yaml` builds and pushes an immutable image, ensures the index exists, deploys a no-traffic tagged candidate with explicit runtime settings, smoke-checks health, Firestore readiness, and the unauthenticated `/v1` boundary, and only then promotes that revision to 100% traffic.
- `scripts/deploy.sh` performs fail-closed local/CI preflight checks. Its default `--check` mode never submits a build; only `--deploy` mutates Google Cloud.
- `.github/workflows/deploy-backend.yml` validates TypeScript, tests, builds the container, then authenticates through GitHub OIDC and Google Workload Identity Federation. It does not accept or reference a service-account JSON key.

The Cloud Run service is network-public because the Tauri client presents a Google OAuth ID token, not a Cloud Run IAM token. Application middleware verifies every `/v1` request against the configured OAuth audiences. Only `/healthz` and `/readyz` are intentionally unauthenticated. If organizational policy requires Cloud Run IAM, place a trusted gateway in front and change the ingress/authentication design before deployment.

### Required Google Cloud resources

1. A billing-enabled Google Cloud project and a Firestore Native Mode database.
2. Enabled APIs: Cloud Run, Cloud Build, Artifact Registry, Firestore, Google Drive, and Google Sheets.
3. A Docker Artifact Registry repository in the deployment region.
4. A dedicated runtime service account with `roles/datastore.user`.
5. A dedicated Cloud Build service account with build/logging access, Artifact Registry writer, Cloud Run deployment permission, `roles/datastore.indexAdmin`, and `iam.serviceAccounts.actAs` on the runtime service account.
6. A separate GitHub deployer service account able to create Cloud Builds, inspect the preflight resources, and act as the Cloud Build service account.
7. Google OAuth desktop client IDs for every accepted ID-token audience, plus exact non-wildcard CORS origins.

Do not grant Drive access to the runtime service account. Drive calls use only the manager's short-lived delegated token.

### Safe command-line deployment

Export explicit values; the script does not read or change the active gcloud project configuration:

```sh
export GCP_PROJECT_ID=your-project-id
export GCP_REGION=us-central1
export CLOUD_RUN_SERVICE=lab-workflow-backend
export CLOUD_RUN_RUNTIME_SERVICE_ACCOUNT=lab-workflow-runtime@your-project-id.iam.gserviceaccount.com
export CLOUD_BUILD_SERVICE_ACCOUNT=lab-workflow-builder@your-project-id.iam.gserviceaccount.com
export ARTIFACT_REGISTRY_REPOSITORY=cloud-run
export FIRESTORE_DATABASE_ID='(default)'
export GOOGLE_OAUTH_CLIENT_IDS='000000000000-example.apps.googleusercontent.com'
export CORS_ALLOWED_ORIGINS='tauri://localhost,http://tauri.localhost'
export BOOTSTRAP_CLAIM_TTL_SECONDS=600

backend/scripts/deploy.sh --check
backend/scripts/deploy.sh --deploy
```

Preflight verifies gcloud installation and authentication, project and region, both project-owned service accounts, the Firestore database, Artifact Registry, all required APIs, OAuth audience syntax, exact CORS origins, TTL bounds, and required deployment files. Cloud Build then waits for the Firestore index and no-traffic candidate smoke checks before changing production traffic.

### Keyless GitHub deployment

Create a Workload Identity Pool/provider that trusts GitHub's OIDC issuer. Restrict its attribute condition to this repository and the protected `backend-production` environment or approved ref; do not use a wildcard repository condition. Grant that principal `roles/iam.workloadIdentityUser` on the GitHub deployer service account.

Configure the protected GitHub environment `backend-production` with required reviewers and these environment variables:

- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_DEPLOYER_SERVICE_ACCOUNT`
- `GCP_PROJECT_ID`
- `GCP_REGION`
- `CLOUD_RUN_SERVICE`
- `CLOUD_RUN_RUNTIME_SERVICE_ACCOUNT`
- `CLOUD_BUILD_SERVICE_ACCOUNT`
- `ARTIFACT_REGISTRY_REPOSITORY`
- `FIRESTORE_DATABASE_ID`
- `GOOGLE_OAUTH_CLIENT_IDS`
- `CORS_ALLOWED_ORIGINS`
- `BOOTSTRAP_CLAIM_TTL_SECONDS`

These values are identifiers/configuration, not service-account JSON secrets. The manual workflow requires the operator to type the exact protected project ID and explicitly enable deployment.

## Health, readiness, and smoke checks

Cloud Run startup and liveness probes call `/healthz`. That endpoint reports only whether the HTTP process is alive, so a temporary Firestore outage does not cause a destructive restart loop.

`/readyz` performs a Firestore document read using the runtime identity. It returns `200` only when the authoritative store is reachable and returns typed `503 SERVICE_NOT_READY` for a missing database, wrong project, unavailable service, or insufficient runtime IAM.

Cloud Build retrieves the deployed service URL and retries both checks. It also requires an unauthenticated discovery request to return `401 ID_TOKEN_REQUIRED` with `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, and an `X-Request-Id`, both before and after traffic promotion.

```sh
curl --fail --retry 10 https://SERVICE_URL/healthz
curl --fail --retry 10 https://SERVICE_URL/readyz
```

The operator smoke harness runs the same non-mutating checks and emits structured evidence. From `backend/`:

```sh
export SERVICE_URL='https://SERVICE_HASH-REGION.a.run.app'
npm run smoke -- --base-url="${SERVICE_URL}"
```

That default never sends credentials and never mutates Firestore or Drive. For real-account membership and invitation discovery, explicitly supply a fresh Google user ID token through the environment. Never put a token in a command argument, `.env`, shell history, CI variable, or log:

```sh
read -rs SMOKE_GOOGLE_ID_TOKEN
export SMOKE_GOOGLE_ID_TOKEN
printf '\n'
npm run smoke -- --base-url="${SERVICE_URL}"
unset SMOKE_GOOGLE_ID_TOKEN
```

The token must be a short-lived Google **ID token** whose `aud` is one of `GOOGLE_OAUTH_CLIENT_IDS`; an OAuth access token is not interchangeable. Authenticated mode calls both `/v1/me/memberships` and `/v1/me/invitations` and records counts only.

### Explicit disposable Drive provisioning smoke

Drive mutation remains disabled unless every safeguard below is present. Use only a newly created, employee-only disposable member in `needsSharing`, with one disposable task-log file, no pre-existing grant, and an operator-approved cleanup window. The authenticated caller must be an active Firestore manager or PI.

```sh
export DISPOSABLE_LAB_ID='00000000-0000-4000-8000-000000000000'
export DISPOSABLE_MEMBER_ID='00000000-0000-4000-8000-000000000000'
export DISPOSABLE_FILE_ID='exact-google-drive-file-id'
export DISPOSABLE_TARGET_EMAIL='disposable-user@example.com'
export DISPOSABLE_MEMBER_REVISION='1'

read -rs SMOKE_GOOGLE_ID_TOKEN
export SMOKE_GOOGLE_ID_TOKEN
printf '\n'
read -rs SMOKE_DRIVE_ACCESS_TOKEN
export SMOKE_DRIVE_ACCESS_TOKEN
printf '\n'

npm run smoke -- \
  --base-url="${SERVICE_URL}" \
  --drive-provision \
  --lab-id="${DISPOSABLE_LAB_ID}" \
  --member-id="${DISPOSABLE_MEMBER_ID}" \
  --file-id="${DISPOSABLE_FILE_ID}" \
  --target-email="${DISPOSABLE_TARGET_EMAIL}" \
  --expected-member-revision="${DISPOSABLE_MEMBER_REVISION}" \
  --rollback=remove-created-permission-and-deactivate-member \
  --confirm-disposable-context="PROVISION_DISPOSABLE:${DISPOSABLE_LAB_ID}:${DISPOSABLE_MEMBER_ID}:${DISPOSABLE_FILE_ID}:${DISPOSABLE_TARGET_EMAIL}"

unset SMOKE_GOOGLE_ID_TOKEN SMOKE_DRIVE_ACCESS_TOKEN
```

Before mutation, the harness re-reads and exactly matches the lab ID, member ID, file ID, normalized target email, member revision, lifecycle state, active flag, and employee-only role. The backend also rejects a stale revision before calling Drive. On success the harness immediately deletes the permission it created and deactivates the disposable member. If the permission already existed, it is never deleted; the harness deactivates the member and fails. If permission removal fails, stderr names the exact non-secret file and permission IDs requiring manual rollback:

```sh
curl --fail --request DELETE \
  --header "Authorization: Bearer ${SMOKE_DRIVE_ACCESS_TOKEN}" \
  "https://www.googleapis.com/drive/v3/files/${DISPOSABLE_FILE_ID}/permissions/PERMISSION_ID?supportsAllDrives=true"
```

Confirm the disposable member is inactive and remove the disposable Firestore records under the approved data-retention procedure after preserving their audit evidence. The harness intentionally does not hard-delete Firestore audit records.

Successful JSON evidence contains `schemaVersion`, `checkedAt`, `baseUrl`, `mutationMode`, and `checks[]`. Each check includes `check`, `outcome`, `httpStatus`, and the service `requestId`; discovery checks add only `resultCount`, while Drive mode adds the exact confirmed lab/member/file IDs plus `permissionStatus`, `driveRollback`, and `memberRollback`. Tokens and response records are never emitted.

These checks verify container startup, routing, Firestore access, the application authentication boundary, and optionally real-account discovery. They do not replace review of the protected project, Cloud Run IAM/ingress, OAuth consent configuration, or Firestore index readiness.

For a local container liveness check:

```sh
docker build --file backend/Dockerfile --tag lab-workflow-backend:local backend
docker run --rm --publish 8080:8080 \
  --env GOOGLE_CLOUD_PROJECT=your-project-id \
  --env GOOGLE_OAUTH_CLIENT_IDS=000000000000-example.apps.googleusercontent.com \
  lab-workflow-backend:local
curl --fail http://127.0.0.1:8080/healthz
```

`/readyz` intentionally returns `503` until the container has valid Application Default Credentials or a configured Firestore emulator. The image also declares a process-only Docker `HEALTHCHECK` against `/healthz`.

No deployment has been performed by this repository work.

## Bootstrap safety

`POST /v1/labs/bootstrap` uses the delegated token only to read the canonical `Roles` range and requires exact `Email`, `Role`, `Lab Member` headers with no non-empty data rows. It returns a short-lived claim without storing the token. `POST /v1/labs/bootstrap/:claimId/claim` transactionally creates the lab and owner member as manager/PI. A non-empty or unreadable Roles sheet cannot create bootstrap privilege.

## Operational notes

- Request bodies are capped at 256 KB and responses use `Cache-Control: no-store`.
- No request logger is installed, preventing accidental authorization-header logging.
- Drive errors distinguish expired token, missing scope/file permission, domain policy, ownership, missing file, and retryable Google failures.
- Optional Firestore database IDs are supported through `FIRESTORE_DATABASE_ID`.
- The service intentionally does not mirror Firestore changes back to Sheets yet; that belongs to the later migration/mirroring phase and must remain visibly retryable rather than becoming a second authority.
