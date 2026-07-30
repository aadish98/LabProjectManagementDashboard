# Lab Workflow Desktop: Distribution Setup

## 1. Prepare Google
- Create a Google Cloud project.
- Enable **Google Sheets API**, **Google Drive API**, and **Google Picker API**. Drive permission provisioning uses the signed-in manager/PI's delegated token; the Cloud Run runtime service account must not receive Drive access.
- Configure OAuth consent with scopes: `openid`, `email`, `profile`, `drive.file`.
- Create a **Desktop app** OAuth client and add redirect URI: `http://127.0.0.1:53682`.
- Configure the Desktop client ID and Desktop client secret in the app/CI. Google's token endpoint still requires that secret alongside PKCE; do not commit the real secret value.
- Create a browser API key for Picker and restrict it to the Picker API and your app origins.

## 2. Deploy the Backend
Run `backend/scripts/deploy.sh --check` first. It is a non-mutating preflight for the project, APIs, service accounts, Firestore database, Artifact Registry, OAuth audiences, CORS origins, indexes, and deployment files. Only an explicitly approved `--deploy` invocation submits Cloud Build.

The Cloud Run runtime service account needs Firestore access but must not receive Drive access. Every `/v1` request verifies a Google ID token. Drive provisioning receives the signed-in manager/PI's short-lived Drive token in a separate request header and discards it after the operation. Tokens must never enter Firestore, environment variables, logs, or errors.

No repository command or document proves that a production deployment has occurred. Record the approved project, Cloud Run revision, Firestore database, index state, and smoke-check evidence separately during release.

## 3. Configure the App
Create `.env` from `.env.example` and fill:

```bash
VITE_BACKEND_BASE_URL=https://YOUR_CLOUD_RUN_SERVICE
VITE_GOOGLE_CLIENT_ID=
VITE_GOOGLE_CLIENT_SECRET=
VITE_GOOGLE_API_KEY=
VITE_GOOGLE_APP_ID=
```

The Admin workbook ID is intentionally not embedded in or returned to the
distributed app. Desktop membership and role checks use Firestore only.

## 4. Updater signing keypair (one-time)
In-app auto-update uses Tauri’s free minisign key. Generate the keypair on a trusted machine; never commit the private key.

The checked-in updater public key is intentionally a placeholder until this one-time setup is completed. Do not describe or distribute a build as auto-updating while `REPLACE_WITH_TAURI_UPDATER_PUBLIC_KEY` remains in `src-tauri/tauri.conf.json`.

```bash
npx tauri signer generate -w ~/.tauri/labworkflow.key
```

Then:

1. Copy the printed **public** key into `src-tauri/tauri.conf.json` → `plugins.updater.pubkey` (replace `REPLACE_WITH_TAURI_UPDATER_PUBLIC_KEY`).
2. In the GitHub repo → **Settings → Secrets and variables → Actions**, add:
   - `TAURI_SIGNING_PRIVATE_KEY` — full contents of `~/.tauri/labworkflow.key`
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — the password you chose (empty string if none)
3. Keep `~/.tauri/labworkflow.key` only on the operator machine / password manager. Do not put it in git.

CI (`build-desktop.yml`) reads those secrets when building release artifacts. `npm run build` and manual workflow runs merge `src-tauri/tauri.unsigned.conf.json`, so they produce ordinary installers without updater artifacts or the private key. Tagged release builds keep updater artifacts enabled and require the signing secrets.

Tag releases as `app-v*` so CI attaches signed installers and `latest.json`. The workflow creates a **draft** release — **publish** it so `releases/latest/download/latest.json` resolves for installed apps. The GitHub repo/releases must be **public** for the updater endpoint (or host `latest.json` elsewhere).

## 5. Build and Distribute
Only the Tauri desktop application is supported. Do not publish `dist/` as a website; browser hosting bypasses the desktop credential-vault and loopback-auth assumptions.

```bash
npm install
npm ci --prefix backend
npm run verify:release
npm run verify:release -- --package
```

`--package` produces current-host artifacts under `src-tauri/target/release/bundle/` (macOS: `.dmg`; Windows CI: NSIS `.exe`). A successful local artifact is unsigned unless a signing identity was actually configured and verified. Initial installers are handed out manually (lab storage / download link). After first install, the app self-updates from the published GitHub Release. Verify OAuth loopback/state/PKCE login, conditional consent, initial/refreshed ID tokens, OS-vault persistence/deletion, token revocation, updater provenance if enabled, and platform signing/notarization on each target OS.

The real-vault round trip is explicitly opt-in and uses the exact packaged/debug binary:

```bash
VAULT_VERIFY_BINARY="/absolute/path/to/tauri-executable" \
  npm run verify:release -- --vault
```

It creates a unique disposable account label/value in Rust, verifies store/load, and requires deletion before success. It does not expose the value and does not run during normal startup. This one round trip is not signed-package acceptance evidence by itself.

## 6. Import the Authoritative Roster
Create the canonical workbook with `Roles` and `SheetRegistry`, and share it only
with operator accounts that run the import. Authenticate Application Default
Credentials using the scopes printed by:

```bash
npm --prefix backend run roster:import -- --help
```

Preview the import first, then repeat the reviewed command with `--apply`. The
import creates the Firestore lab, active member, task-log config, and audit
documents. It does not deactivate Firestore members that are absent from the
sheet.

After import:

1. A Firestore-authorized manager/PI provisions the exact Drive files.
2. The member selects only their configured task-log file through Picker.
3. The member accepts the shared column map; status becomes `ready`.

Compatibility `SheetRegistry`/`Roles` rows carry immutable member IDs and revisions. They are mirrors, not authorization inputs.

## 7. Drive Access Requirements
Google Drive sharing and Picker selection are both required.

- Employees need access only to their own task-log Sheet.
- Managers need access only to the configured task logs required for their role.
- PIs need access only to the configured task logs required for their role.

When prompted, use **Grant task-log access** to select missing Sheets through Google Picker.

Picker grants are per Google account and per file. A selection made by one manager authorizes only that manager; every manager, PI, and employee must separately select every Sheet their account needs.

## 8. Secrets, Retention, and Deletion
- Desktop refresh tokens are stored in the OS credential vault. Access and ID tokens are short-lived and are not persisted in WebView local storage.
- Startup blocks privileged UI until vault hydration and token refresh finish.
- Sign-out revokes the refresh token (or access token if no refresh token exists), then clears local metadata, in-memory tokens, and vault credentials even if network revocation fails.
- Cloud Run handles Drive tokens transiently and must not retain them after the request.
- Firestore application records remain until the owning account or lab requests deletion; there is no token-retention period because Drive tokens are never stored there.
- Deleting an account/lab must remove its Firestore documents. Uninstalling the app removes local app data; users may also remove the credential-vault entry and revoke Google access at <https://myaccount.google.com/permissions>.

## 9. Release Gate
Run `npm run verify:release` and archive its final JSON line, complete any explicitly required emulator/vault/live-smoke/package flags, and generate the versioned inventory evidence in [docs/PILOT_MIGRATION_RUNBOOK.md](docs/PILOT_MIGRATION_RUNBOOK.md). A local package does not prove signing or notarization. A real OAuth account, pilot, migration, Drive permission change, live service, or GCP deployment requires separate explicit execution, operator approval where mutation is involved, and recorded rollback ownership.
