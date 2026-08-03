# Lab Workflow Desktop

Role-based Tauri desktop app for lab task logs. Employees create and update experiment records; managers get Kanban, Gantt, compliance, feedback, and RunLog views across the team. The supported production topology is the signed desktop app plus a Cloud Run API: the API verifies Google ID tokens, stores application records in Firestore, and handles Google Drive access tokens only for the duration of the requested operation. Google Sheets remains the user-controlled workflow data source.

## Quick start

```bash
npm install
cp .env.example .env   # fill in Google OAuth / Picker values
npm run dev            # Tauri desktop shell (requires Rust)
```

The browser-hosted Vite build is not a supported product or authentication environment. Development and distribution must run through Tauri. The app hits real services; there is no mock data path.

## Security and data flow

- Google sign-in requests only `openid`, `email`, `profile`, and per-file `drive.file`.
- OAuth uses the fixed `127.0.0.1:53682` loopback callback, state, and PKCE S256 for a Desktop OAuth client. Google's token endpoint requires the Desktop client secret alongside PKCE, so the backend brokers the exchange (`/auth/google/token/*`) and reads the secret from Secret Manager; no client secret is compiled into the desktop bundle.
- The desktop client sends the short-lived Google ID token to Cloud Run for server-side audience, issuer, signature, and expiry verification.
- Cloud Run stores application records and account metadata in Firestore. It does not persist Google Drive access or refresh tokens.
- Drive access tokens are processed in memory only while servicing a Sheets/Picker operation and are then discarded.
- Desktop refresh tokens are stored in the operating system credential vault (macOS Keychain, Windows Credential Manager, or Linux Secret Service), never in `localStorage`.
- Non-secret device preferences and caches may remain in the Tauri WebView's local storage.

## Access model

Firestore is authoritative for labs, memberships, roles, invitations, onboarding state, stable IDs, workbook IDs, tabs, and shared column maps. The app never infers a role from Google Sheets readability or from a missing permission.

- Active Firestore membership determines employee, manager, and PI capabilities.
- A pending invitation can route only the matching verified Google email into onboarding.
- An account with neither membership nor invitation is unauthorized.
- Lab creation and roster import are operator-only commands. The distributed desktop app cannot bootstrap a lab or ask an unrecognized employee to open the Admin workbook.

Google Drive access is a separate data-access gate. Managers provision exact-file sharing through the backend; each invited account must then select its exact configured file through Picker because `drive.file` grants are account- and file-specific.

## Onboarding checklist

1. Create a Google Cloud project; enable **Google Sheets API**, **Google Drive API**, and **Google Picker API**. The backend uses Drive only with the signed-in operator's delegated token when provisioning exact-file access.
2. Configure OAuth consent with scopes: `openid`, `email`, `profile`, `drive.file`.
3. Create a **Desktop app** OAuth client. Add `http://127.0.0.1:53682` under **Authorized redirect URIs**.
4. Create a browser API key for Picker; restrict it to your app origins and the Picker API.
5. Copy `.env.example` → `.env` and set:
   - `VITE_BACKEND_BASE_URL` (HTTPS Cloud Run service URL)
   - `VITE_GOOGLE_CLIENT_ID` (Desktop app OAuth client). Do **not** set `VITE_GOOGLE_CLIENT_SECRET`: the secret belongs in Secret Manager for the backend, and the build fails if it is present.
   - `VITE_GOOGLE_API_KEY`, `VITE_GOOGLE_APP_ID` (Cloud project number)
6. Create the canonical Admin workbook with `Roles` and `SheetRegistry`; share it only with operator accounts that run the roster import.
7. Authenticate Application Default Credentials with the read-only Sheets and Cloud Platform scopes shown by `npm --prefix backend run roster:import -- --help`.
8. Preview the import, then repeat the reviewed command with `--apply`. The command creates the lab, active membership, task-log config, and audit documents in Firestore.
9. A Firestore-authorized manager/PI provisions the exact required Drive files.
10. Each employee signs in normally, selects only their configured task-log workbook in Picker, and reviews its column map.

Example preview (omit `--lab-id` to derive a stable UUID from the project and Admin workbook):

```sh
npm --prefix backend run roster:import -- \
  --project YOUR_PROJECT_ID \
  --spreadsheet-id YOUR_ADMIN_SPREADSHEET_ID \
  --lab-name "Your Lab" \
  --actor-email operator@example.com
```

The importer is dry-run by default, validates the whole roster before writing,
and preserves existing Firestore members that are absent from the sheet. Add
`--apply` only after reviewing the JSON plan.

The enforced lifecycle is `invited → needsSharing → needsPicker → needsColumnReview → ready`. `blocked` preserves the prior state and a specific recovery action. See [docs/PILOT_MIGRATION_RUNBOOK.md](docs/PILOT_MIGRATION_RUNBOOK.md) before piloting existing lab data.

For a non-mutating legacy inventory, run `npm run pilot:inventory -- /path/to/redacted-export.json --pretty`. The sample fixture and test live in `scripts/`; output is versioned machine-readable evidence and never calls Sheets, Drive, or Firestore.

## Manager setup

Bootstrap configuration lives in `.env`; membership and onboarding records live in Firestore. Team setup writes revisioned Firestore records through the backend API and does not touch Google Sheets.

Manager dashboards load available task logs independently. A failed, stale-tab, or missing-Picker workbook produces a member-specific issue while successfully loaded members remain visible; the last-known cache can fill failed members and is visibly marked stale.

Use **Manager view** for the employee overview (metrics, rollups, change log) or **Personal tasks** for your own bench work when the same email also has an Employee role linked to a task log. Personal tasks reuses the employee Kanban/Gantt workflow (create, complete, resolve overdue) without signing out.

### Manager who also runs experiments

Assign both roles to the same Firestore member ID and configure that member's task log. The same signed-in account can then use Personal tasks and Manager view.

### PI setup

Assign the PI capability in Firestore. A PI may also have Manager and Employee capabilities on the same immutable member record.

## Employee setup

Lab members need:

1. A pending backend invitation matching their verified Google email.
2. Manager-provisioned Drive access to the exact configured task-log spreadsheet.
3. Per-account Picker proof for that exact spreadsheet.
4. Review and acceptance of the proposed shared column map.

Accepted column maps are shared in Firestore and keyed by stable member/workbook IDs. Device caches improve startup but are not authoritative.

## Admin workbook structure (operator import only)

The Admin workbook is read **only** by the `roster:import` operator command, to seed a lab into Firestore. The desktop app contains no code that reads or writes it: it never opens the workbook, asks a user to select it, or receives its file ID. Nothing in the app writes these tabs back, so the workbook is an input snapshot, not a mirror.

The importer reads two tabs, `Roles` and `SheetRegistry`. Headers normalize to lowercase alphanumeric (`Lab Member` → `labmember`).

### Roles

| Column | Content |
|--------|---------|
| `email` | Google account email (required) |
| `role` | `employee`, `manager`, or `pi` (required) |
| `labmember` | Display name; links the row to a `SheetRegistry` task-log row (required) |
| `memberid` | Optional stable member ID; derived deterministically when absent |
| `active` | Optional; blank counts as active |

One person may have several rows to hold several roles.

### SheetRegistry

Required for every `employee`. Managers and PIs need a row only if they also keep a task log.

| Column | Content |
|--------|---------|
| `labmember` | Display name, matched against `Roles` (required) |
| `tasklogurl` | Task-log URL or spreadsheet ID (required) |
| `activesheet` | Tab name inside that workbook (required) |
| `active` | `true`, `yes`, `y`, or `1`; blank counts as active |
| `memberid` | Optional stable member ID |

The import is preview-only until `--apply`, and validation failures are reported together before Firestore is contacted.

## Task-log sheets

Row 1 must be a header row. Expected fields (aliases in parentheses):

`Project`, `Experiment`, `Time Estimate`, `Start Date`, `Projected End Date` (`End Date`), `Status`, `Schematic` (`Analysis Pipeline Schema`), `Result`, `Link to Data`, `Comments/ Improvements`, `Notebook Location`

**Column mapping:** Managers propose a shared map during invitation/setup; the member reviews and accepts it. Task writes update only mapped cells that changed.

**Safe writes:** Existing tasks carry stable `Task ID` and `Task Revision` metadata. The app adds/backfills those columns for populated legacy rows, then re-finds the task by ID and verifies the expected revision immediately before updating only changed mapped cells. The revision is incremented in the same `values.batchUpdate`. Google Sheets has no compare-and-swap precondition, so a second writer can still change the row between the final verification read and the batch commit. Admin compatibility updates separately preflight member ID/revision and write only the selected member's registry/role ranges.

**Dates** (`src/utils/date.ts`): `YYYY-MM-DD`, `M/D`, `M/D/YYYY`, serial numbers, and common string formats. Interpreted as calendar days in the user's local timezone. Unparseable dates flag cards and land in the Gantt repair queue.

**Status:** `Planned`, `In Progress`, `Ongoing`, `Complete`/`Completed`/`Done`, `Blocked`, or values containing `block`/`hold`.

**Compliance:** Active tasks need project, experiment, time estimate, parseable dates, status, schematic, and link to data. Completed tasks need result and link to data. Overdue = past projected end date by more than 24 hours without completion.

**Overdue resolution:** Appends new dates/estimates with strikethrough history; records delay reason in comments. Use the dedicated **Resolve overdue** modal to preserve history — regular edit overwrites multi-line date cells.

**Profile photos:** Stored in a `Profile` tab at the right end of each employee's task log (160×160 WebP/JPEG/PNG, ≤32 KB). Managers read them on refresh; failures fall back to initials.

## Gantt view

Available to all task roles. Defaults to the current quarter; any date range can be selected. Managers and PIs can filter people independently of Kanban tabs. Export: PNG download or print/save as PDF. Tasks with invalid dates appear in a repair queue with **Fix task**.

## Installing (end users)

Hand out the first installer from approved lab storage or published GitHub Release assets. In-app updates work only after the updater public key, signing secrets, matching `app-v*` release, and published `latest.json` are in place.

- **macOS (`.dmg`):** open the disk image and drag the app to Applications. If Gatekeeper blocks an unsigned build, right-click the app → **Open** → **Open**, or use **System Settings → Privacy & Security → Open Anyway**.
- **Windows (NSIS `.exe`):** run the installer (per-user; no admin/UAC). If SmartScreen appears, choose **More info → Run anyway**.
- **Updates:** a properly configured release checks on launch and prompts to install and restart when a newer published GitHub Release is available. In-place update bundles are minisign-verified. Builds made with `src-tauri/tauri.unsigned.conf.json` do not create updater artifacts, and operating-system trust prompts still depend on the signing/notarization status of each release.

Operator setup for updater signing keys and CI secrets is in [DISTRIBUTION_SETUP.md](DISTRIBUTION_SETUP.md) §4.

## Development and deployment

| Command | Output | Use when |
|---------|--------|----------|
| `npm run dev` | Tauri + Vite | Supported local desktop development |
| `npm run typecheck` | Type errors only | Pre-commit / CI |
| `npm run frontend:build` | `dist/` static bundle | Internal Tauri build input only |
| `npm run build` | `.dmg` / NSIS `.exe` installers | Native distribution |
| `npm run verify:release` | Local release checks + JSON evidence | Required local release gate |

**Tauri desktop only:** requires Rust and platform build tools (Xcode CLT on macOS, VS Build Tools on Windows). Code signing/notarization is required for trusted production installs. OAuth uses the system browser and a fixed loopback redirect; verify it in each signed installer.

`npm run verify:release -- --package` adds a current-host Tauri package. Optional `--emulator`, `--vault`, and `--live-smoke` checks run only when requested and fail closed if their prerequisites are absent. The vault option requires `VAULT_VERIFY_BINARY` pointing to the exact packaged/debug executable; it performs one disposable real OS-vault store/load/delete round trip without exposing the value. See [docs/TESTING.md](docs/TESTING.md).

**Presentations:** `presentations/` is a separate Node project that generates `.pptx` onboarding decks; not bundled with the app.

## Repository layout

| Path | Purpose |
|------|---------|
| `backend/` | Cloud Run API and Firestore persistence |
| `src/app/` | Root router, session/access/sync controllers, and screens |
| `src/domain/` | Workflow models, access rules, onboarding lifecycle, and compliance rules |
| `src/platform/` | Desktop auth, Picker, credential-vault, and updater boundaries |
| `src/services/sheets/` | Sheets client, typed errors, admin, task-log, dataset, and profile modules |
| `src/services/googleSheets.ts` | Thin compatibility façade re-exporting `src/services/sheets/` |
| `src/services/onboardingApi.ts` | Typed Cloud Run onboarding/invitation client |
| `src/features/onboarding/` | Clean-device employee/manager connect and column-review flows |
| `src/features/setup/` | Team setup orchestrator, member editor, and persistence hooks |
| `src/features/tasks/` | Shared task form and dialog primitives |
| `src/features/employee/` | Employee Kanban + Gantt workspace |
| `src/features/manager/` | Manager dashboard, rollups, change log |
| `src/features/gantt/` | Shared Gantt chart, schedule table, and export |
| `src/components/ui/` | Accessible dialog, banner, form-field, and status primitives |
| `src-tauri/` | Tauri 2 desktop packaging |
| `Code.gs` | Original Apps Script reference |
| `docs/PRIVACY/` | Public privacy policy (also at `docs/index.html`) |
| `docs/ARCHITECTURE.md` | Authority, identities, data flow, and constraints |
| `docs/TESTING.md` | Local, emulator, build, and dry-run verification |
| `docs/PILOT_MIGRATION_RUNBOOK.md` | Reversible pilot migration procedure |

## Local storage

Per-device `localStorage` keys (see `src/services/cache.ts`) contain app config, non-secret session identity, dataset cache, employee prefs, manager tab order, change snapshots, and profile cache. Refresh tokens live in the OS credential vault; access and ID tokens are not written to local storage. A one-time migration moves legacy refresh tokens out of the old session record. A new device starts fresh; `.env` provides first-run defaults.

## Remaining platform constraints

- Picker authorization is per Google account and exact file; sharing alone does not create a `drive.file` grant.
- Google Sheets and Firestore cannot participate in one transaction. They are kept on separate concerns instead: Firestore is authoritative for membership and onboarding, Sheets holds only task-log content, and no runtime path writes both.
- Task ID plus Task Revision verification detects moved rows and revisions that changed before the final read. Duplicate, missing, or corrupted metadata requires repair, and Google Sheets still has an unavoidable race between that read and the subsequent batch commit.
- Manager loads are intentionally partial. Cached rows for failed members are marked stale and must not be mistaken for a successful refresh.
- Sheets values are formatted strings; ambiguous or invalid dates still require user correction.
- OAuth, Keychain/Credential Manager/Secret Service, signing, and notarization require real packaged-app verification on each target OS.

## Privacy

See [docs/PRIVACY/README.md](docs/PRIVACY/README.md) and [docs/TERMS/README.md](docs/TERMS/README.md). Firestore records are retained while the account/lab uses the service. The current app supports deactivation/revocation but requires an approved operator procedure for hard deletion. Google Drive tokens are transient and are not retained by Cloud Run or Firestore.
