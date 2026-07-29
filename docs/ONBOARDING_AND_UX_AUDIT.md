# Lab Workflow Desktop: Onboarding, Access, UI, and UX Audit

Date: 2026-07-15  
Closeout scope: Implementation audit of the React/Tauri desktop client, Firestore-authoritative onboarding API, Google authentication and Picker flows, Google Sheets task data and compatibility mirrors, manager/member workspaces, setup forms, accessibility primitives, and shared styling.  
Status: All 56 original UX findings are preserved and accounted for below. Code implementation, local automated verification, one real disposable macOS Keychain primitive, and release-real-account/platform evidence are reported as separate evidence classes. External release gates remain open.

## Executive summary

The implementation now has one authoritative onboarding lifecycle backed by Firestore. Labs, memberships, Access roles, invitations, immutable member IDs, workbook/tab configuration, accepted column maps, revisions, idempotency records, and onboarding events are resolved through the backend API. The Tauri client authenticates with Google, sends the ID token to that API, and uses the delegated Drive token only for an explicit sharing request. Google Sheets remains authoritative for task-log contents, profiles, feedback, and run-log data; `SheetRegistry` and `Roles` are compatibility mirrors and no longer grant runtime authorization.

The original monolithic `App.tsx`, setup, Sheets, and workspace paths were modularized into access verification, route selection, session orchestration, dataset synchronization, task mutations/auditing, onboarding screens, setup state/components, shared task forms, shared accessible UI primitives, and focused Sheets service modules. Local storage is now a non-secret cache; refresh tokens are stored through Tauri commands in the operating-system credential vault, while access and ID tokens remain in memory.

The implemented lifecycle is **Invited → Needs sharing → Needs Picker → Needs column review → Ready**, with **Blocked** retaining an owner, reason, next action, and resume state. Those are the exact current labels; creating or saving an invitation does not imply that it has advanced beyond **Invited**. Team setup renders the backend-returned state, owner, reason, and next action instead of equating persistence with readiness. Clean-device invitation discovery, exact-file Picker proof, shared accepted mappings, guided manager first-run file progress, partial manager datasets, and revision-checked member updates are implemented and covered by focused local tests.

Three constraints remain inherent and are not reported as silently solved:

- Firestore and Google Sheets cannot participate in one transaction. Firestore is authoritative; a failed compatibility-mirror write is visible, scoped to one member, revision checked, and retryable.
- `drive.file` Picker authorization is per Google account and exact file. Sharing can be provisioned, but one account's Picker grant cannot be transferred to another account.
- Task updates and completion use immutable Task IDs plus a **Task Revision** optimistic-concurrency value. The app reads and verifies ID/revision immediately before a batch write and increments the revision in that batch. Google Sheets exposes no compare-and-swap precondition for `values:batchUpdate`, so another writer can still change the row after the final verification read and before the batch commits; real multi-writer reconciliation remains a release/operational responsibility.

The local Firestore emulator integration ran 1/1 with JDK 21, and a disposable macOS Keychain store/load/delete round trip ran successfully through the Tauri binary. Those results verify local repository transaction behavior and one real macOS vault primitive only. They do **not** prove Cloud Run deployment, authenticated live smoke, live Drive/Picker/Google role behavior, a real pilot migration, Windows vault behavior, signed/notarized packaging, VoiceOver/NVDA behavior, or signed-platform acceptance.

## Resolution index and accounting

- **Resolved—automated:** 49 findings.
- **Resolved—static/manual pending:** 5 findings.
- **Mitigated—platform constraint:** 2 findings.
- **Accounting:** 49 + 5 + 2 = **56 unique IDs**; no ID is omitted or duplicated.
- Finding IDs occur exactly once, in the numerically ordered finding headings; `npm run check:audit-structure` enforces the sequence, category totals, required Resolution fields, and dedicated acceptance-test links.
- Numeric line ranges in the preserved historical evidence below identify the original audit snapshot. They are retained as evidence provenance, not asserted as current post-refactor locations; every Resolution block names current implementation modules/functions without relying on facade re-export locations.

## Expected product contract

After an authorized manager adds a person, the product should create a single, inspectable onboarding record and show one of these states:

- **Invited** — role and intended task log saved; awaiting the user's Google connection.
- **Needs file sharing** — the target account cannot access one or more required files.
- **Needs Picker authorization** — sharing exists, but `drive.file` has not authorized the app for the file.
- **Needs column review** — workbook and tab are known; the user must approve a proposed mapping.
- **Ready** — role, registry, Drive access, Picker grants, active tab, and column mapping are all valid.
- **Blocked** — a specific recoverable error is present, with an owner and next action.

This contract is now represented by `OnboardingState` in `src/domain/onboarding.ts`, enforced by `advanceOnboarding`, `completeManagerFileProof`, `blockOnboarding`, and `resumeOnboarding` in `backend/src/domain/lifecycle.ts`, persisted by the Firestore repository, and routed by `selectAppRoute` in `src/app/routing.ts`.

## Critical findings

### UX-001 — Adding a roster row does not provision employee access

**Evidence**

- An employee who cannot read the admin workbook is assigned an employee role without consulting `Roles` (`src/auth/roles.ts:58-66`).
- Employee task-log preferences are loaded from local storage by email (`src/App.tsx:99-105`; `src/services/cache.ts:90-129`).
- A first-time employee without local preferences is always sent through the full workbook, tab, column, and profile setup (`src/App.tsx:901-923`; `src/components/EmployeeSetupGate.tsx:257-297`).
- `EmployeeSetupGate` receives the session, device-local `initialPrefs`, and app configuration, but no central registry record (`src/App.tsx:901-923`; `src/components/EmployeeSetupGate.tsx:39-55`).

**Impact**

The manager enters the same workbook and tab information that the employee must enter again. A new device, cleared storage, or second computer repeats setup. “Added to the lab” and “can use the app” are different states with no handoff between them.

**Required outcome**

Resolve the signed-in email to a central onboarding record and prefill the intended workbook, tab, display name, and proposed column mapping. The employee should only confirm or repair that configuration. Store accepted mappings in a shared per-member configuration, not exclusively on one device.

**Resolution**

- **Status:** Resolved—automated.
- **Implemented fix:** Firestore memberships/invitations and `MemberConfig` now prefill clean-device onboarding; accepted mappings are shared authority and local preferences are cache only.
- **Current code:** `src/app/useAccessVerification.ts` — `useAccessVerification`, `resolveMemberTaskPrefs`; `src/features/onboarding/useEmployeeConnectController.ts` — `acceptInvitation`, `submit`; `src/domain/onboarding.ts` — `membershipPrefs`, `acceptedMemberPrefs`; `backend/src/routes/invitations.ts`; `backend/src/routes/members.ts`.
- **Automated evidence:** `src/features/onboarding/onboarding.acceptance.test.tsx` (AC03–AC05); `src/features/onboarding/EmployeeSetupGate.test.tsx`; `src/domain/onboarding.test.ts`; `src/auth/roles.authoritative.test.ts`; `backend/test/app.test.ts`.
- **Migration/rollout implication:** Existing roster rows require the pilot inventory and creation/backfill of authoritative member/config records before local preferences can be treated as cache.
- **Residual/manual limitation:** Clean-device acceptance with a real invited Google account and workbook remains release validation. **Owner: Release manager.**

### UX-002 — Adding a manager role cannot grant manager access

**Evidence**

- The app can recognize a manager only after it successfully reads the admin workbook and role directory (`src/auth/roles.ts:69-93`).
- The OAuth scope is `drive.file`, which requires both Drive sharing and an explicit Picker grant per account (`src/services/googleSheets.ts:38-42`).
- A person who cannot read the admin workbook is routed to the employee workflow, even if their email has a manager row that the app cannot read (`src/auth/roles.ts:58-66`).
- The manager recovery path is a secondary “Pick the admin workbook instead” action inside employee setup (`src/App.tsx:916-920`; `src/components/EmployeeSetupGate.tsx:765-778`).

**Impact**

An existing manager must separately share the admin workbook and relevant task logs, then the new manager must discover and select those files in Picker. Adding `Role = manager` alone can never satisfy the access check. The GUI implies a role edit grants access when it does not.

**Required outcome**

Treat manager onboarding as an invitation flow with explicit prerequisites. At minimum, show “Role saved; access incomplete,” list required files, and give the new manager a guided first-run Picker sequence. If “add manager and they can immediately sign in” is a hard requirement, `drive.file` plus a client-only Sheets architecture is insufficient; use a controlled backend or a different Google authorization model.

**Resolution**

- **Status:** Resolved—static/manual pending.
- **Implemented fix:** Manager access is granted only by backend membership; invitation, delegated Drive sharing, exact required-file progress, and guided per-account Picker proof are explicit first-run stages.
- **Current code:** `src/features/onboarding/ManagerFirstRun.tsx` — `ManagerFirstRun`, `selectExactFiles`; `src/features/setup/useTeamMemberActions.ts` — `provision`; `backend/src/auth/authorizeLab.ts` — `requireLabManager`; `backend/src/routes/drivePermissions.ts`; `backend/src/routes/members.ts` — manager-file-proof routes.
- **Automated evidence:** `src/features/onboarding/onboarding.acceptance.test.tsx` (AC08); `src/features/onboarding/ManagerFirstRun.test.tsx`; `backend/test/app.test.ts`; `backend/test/driveProvisioning.test.ts`.
- **Migration/rollout implication:** Every existing manager/PI must receive an authoritative membership and complete their own exact-file checklist during rollout.
- **Residual/manual limitation:** Real manager/PI accounts must verify sharing, Workspace policy, and per-account Picker grants; immediate access remains impossible until those external prerequisites complete. **Owner: Release manager.**

### UX-003 — “No admin access” is incorrectly treated as proof of employee authorization

**Evidence**

- Any signed-in Google account that cannot load the configured admin workbook becomes an employee (`src/auth/roles.ts:58-66`).
- A missing local admin-workbook configuration also forces the employee route before any role lookup (`src/App.tsx:235-243`).
- `probeAdminAccess` also converts most non-auth errors into `noAccess`, including schema, network, and unexpected API failures (`src/App.tsx:268-297`).
- Sheets HTTP 403 and 404 responses are both converted to the same file-access error (`src/services/googleSheets.ts:230-234`), so the UI cannot distinguish missing sharing, missing Picker authorization, and a missing/deleted file.
- The resulting user can connect any spreadsheet their Google account can access through Picker (`src/components/EmployeeSetupGate.tsx:549-581`).

**Impact**

The `Roles` tab is not actually the source of truth for employee access. Accounts with no verified roster authorization, transient failures, configuration errors, and legitimate employees all receive the same route. Their displayed identity is derived from their Google profile/email (`src/auth/roles.ts:58-63`; `src/domain/app.ts:237-246`), while manager views use the registry member name (`src/services/googleSheets.ts:466-470`), creating identity and filter mismatches.

**Required outcome**

Do not infer authorization from inability to read a file. Use an authorization record that employees can safely query, an invitation token, domain/group policy, or a backend lookup. Represent network error, missing Picker grant, missing sharing, unauthorized email, and valid employee as separate states.

**Resolution**

- **Status:** Resolved—automated.
- **Implemented fix:** Viewer authorization now comes only from backend memberships/invitations; transport diagnostics preserve a last verified membership, while backend denial, Sheets access classes, and onboarding states remain distinct.
- **Current code:** `src/auth/roles.ts` — `resolveAuthoritativeViewerContext`; `src/app/useAccessVerification.ts` — `probeAdminAccess`; `src/domain/identity.ts` — `backendAccessDiagnostic`; `src/app/routing.ts` — `selectAppRoute`; `src/services/sheets/client.ts` — typed error classifiers.
- **Automated evidence:** `src/features/onboarding/onboarding.acceptance.test.tsx` (AC06); `src/auth/roles.authoritative.test.ts`; `src/app/routing.test.ts`; `src/services/sheets/safety.test.ts`; `src/App.test.tsx`.
- **Migration/rollout implication:** Production cutover must populate backend memberships before Sheet-based role assumptions are retired.
- **Residual/manual limitation:** Unauthorized, offline, missing-sharing, missing-Picker, deleted-file, and schema-error states still need real-account exercise. **Owner: Release manager.**

### UX-004 — A failed `Roles` read can produce first-manager privilege

**Evidence**

- `getOptionalValuesForSheet` converts every non-auth error into an empty row set (`src/services/googleSheets.ts:259-270`).
- Both the admin overview and manager dataset read `Roles` through this optional helper (`src/services/googleSheets.ts:819-824`, `src/services/googleSheets.ts:1118-1125`).
- A missing `Roles` tab also produces an empty row set (`src/services/googleSheets.ts:1115-1125`); by contrast, `SheetRegistry` is explicitly required during a dataset load (`src/services/googleSheets.ts:809-817`).
- An empty role directory promotes a user who can read the workbook to first manager (`src/auth/roles.ts:107-116`).

**Impact**

A missing tab, API error, malformed range, or other read failure can be interpreted as “no roles configured,” which is a privileged bootstrap condition. This is both an access-control defect and a misleading UX state.

**Required outcome**

`Roles` must be required and fail closed after bootstrap. Only a positively verified, intentionally empty canonical `Roles` tab should permit first-manager setup.

**Resolution**

- **Status:** Resolved—automated.
- **Implemented fix:** Bootstrap requires a short-lived backend claim created only after exact canonical-empty `Roles` verification; normal authorization never reads the compatibility sheet.
- **Current code:** `src/features/onboarding/BootstrapLab.tsx` — `BootstrapLab`; `backend/src/drive/bootstrapVerifier.ts` — `GoogleSheetsEmptyRolesVerifier`; `backend/src/routes/labs.ts`; `backend/src/firestore/repository.ts` — bootstrap claim/claim transaction methods.
- **Automated evidence:** `src/features/onboarding/BootstrapLab.test.tsx`; `src/app/routing.test.ts`; `backend/test/bootstrapVerifier.test.ts`; `backend/test/app.test.ts`; `backend/test/repository.emulator.test.ts` passed 1/1 locally with JDK 21.
- **Migration/rollout implication:** Bootstrap is only for a new canonical lab; existing labs must be inventoried and migrated rather than re-bootstrapped.
- **Residual/manual limitation:** A real canonical/malformed workbook bootstrap matrix is still unexecuted. **Owner: Backend release owner.**

### UX-005 — One inaccessible task log blocks the entire manager dashboard

**Evidence**

- All active task logs are loaded in parallel, but any missing file is accumulated and then thrown as one fatal `GoogleSheetsFileAccessError` (`src/services/googleSheets.ts:845-925`).
- Accessible records are already merged before the missing-file check, then discarded when the error is thrown (`src/services/googleSheets.ts:906-925`).
- `App` clears the complete manager dataset when this occurs (`src/App.tsx:325-336`).
- File-access errors explicitly bypass the cached-dataset fallback (`src/services/googleSheets.ts:950-962`).
- The manager receives a separate grant screen instead of the accessible portion of the dashboard (`src/App.tsx:999-1095`).

**Impact**

Adding one new **active** member can make all existing team data disappear for every manager who has not yet picked the new file. New people default to active (`src/components/TeamSetupPanel.tsx:81-103`), while only active registry rows are loaded (`src/services/googleSheets.ts:826-836`). This gives each new roster row a lab-wide blast radius and forces each manager/PI to repeat a per-account Picker grant before normal work can continue. Stale tab names are already handled non-fatally (`src/services/googleSheets.ts:866-877`, `src/services/googleSheets.ts:912-914`), demonstrating that the same partial-data pattern is feasible for inaccessible files.

**Required outcome**

Load accessible task logs and represent inaccessible members as per-person placeholders with **Grant access**, **Retry**, and **Deactivate** actions. Never discard the usable dashboard because one member is incomplete.

**Resolution**

- **Status:** Resolved—automated.
- **Implemented fix:** Manager loads are member-isolated, retain accessible records and scoped last-known records, expose per-member issues, and provide inline **Grant / verify exact file**, **Retry member**, and revision-checked **Deactivate member** recovery without hiding healthy data.
- **Current code:** `src/services/sheets/dataset.ts` — `loadGoogleSheetsDataset`, `mergeLastKnownExperiments`; `src/app/useDatasetSync.ts` — `loadManagerData`; `src/features/manager/ManagerDashboardComponents.tsx` — per-member recovery list; `src/app/useMemberLoadRecovery.ts` — `grantAndVerify`, `retry`, `deactivate`.
- **Automated evidence:** `src/features/onboarding/onboarding.acceptance.test.tsx` (AC07, AC09); `src/services/sheets/safety.test.ts`; `src/app/useDatasetSync.test.ts`; `src/features/manager/ManagerWorkspace.test.tsx`; `src/app/useMemberLoadRecovery.test.ts`.
- **Migration/rollout implication:** No broad data migration is required, but rollout must retain stable backend member IDs so deactivation and issue scoping remain safe.
- **Residual/manual limitation:** Mixed accessible, unshared, revoked, and stale-tab workbooks still require runtime real-account recovery testing. **Owner: Release manager.**

### UX-006 — Lab setup silently selects the first workbook tab

**Evidence**

- After a manager chooses a task-log workbook, Lab setup assigns `metadata.sheets[0]` as the active tab (`src/components/TeamSetupPanel.tsx:455-469`).
- Save validation checks only that the tab string is non-empty, so this automatic value passes without an explicit user choice (`src/components/TeamSetupPanel.tsx:225-228`).
- Employee setup deliberately clears the tab and says there is no default (`src/components/EmployeeSetupGate.tsx:566-575`, `src/components/EmployeeSetupGate.tsx:856-861`).

**Impact**

If the first tab is a lab-wide log, instructions page, template, archive, or `Profile` tab, the member is registered against the wrong data. The inconsistency also makes manager setup appear successful without an explicit tab decision.

**Required outcome**

Never default a consequential tab choice to index zero. Require an explicit selection, or auto-select only when exactly one eligible non-system tab exists. Exclude `Profile` and admin-style tabs from suggestions and display workbook plus tab together in the save confirmation.

**Resolution**

- **Status:** Resolved—automated.
- **Implemented fix:** Picking a workbook clears the active tab and save validation requires an explicit selection; the member path preserves only an authoritative tab for the exact configured workbook.
- **Current code:** `src/features/setup/useTeamWorkbookActions.ts` — `pickWorkbook`; `src/features/setup/useTeamMemberActions.ts` — `savePerson`; `src/features/setup/WorkbookTabPicker.tsx`; `src/features/onboarding/columnMapping.ts` — `keepExplicitTabSelection`; `src/features/onboarding/useEmployeeConnectController.ts` — `pickSpreadsheet`.
- **Automated evidence:** `src/features/onboarding/onboarding.acceptance.test.tsx` (AC01, AC04); `src/components/TeamSetupPanel.test.tsx`; `src/features/onboarding/columnMapping.test.ts`.
- **Migration/rollout implication:** Legacy records with inferred or blank tabs must be flagged by the pilot inventory and explicitly confirmed.
- **Residual/manual limitation:** Multi-tab workbooks with `Profile`, instructions, archive, and template tabs in different orders need real-workbook verification. **Owner: Pilot migration owner.**

### UX-007 — New Task silently defaults to the first registry member

**Evidence**

- The manager New Task modal initializes its assignee from `registry[0]` (`src/features/manager/ManagerWorkspace.tsx:521-537`).
- That order comes from `SheetRegistry` rows (`src/services/googleSheets.ts:353-395`), not the sorted/selected manager tab.
- The modal is always passed the full registry and ignores the manager's current `activeTab` context (`src/features/manager/ManagerWorkspace.tsx:739-754`, `src/features/manager/ManagerWorkspace.tsx:1330-1336`).
- The dialog can therefore submit to that person's workbook unless the manager notices and changes the selector (`src/features/manager/ManagerWorkspace.tsx:539-582`).

**Impact**

Registry order, not manager intent, determines the initial destination. If the manager or lab log is first, a task intended for the new member can be written to the wrong spreadsheet.

**Required outcome**

Start with no assignee, or use the currently selected employee tab as explicit context and state that context in the dialog title. Require confirmation before writing to a different workbook.

**Resolution**

- **Status:** Resolved—automated.
- **Implemented fix:** New Task starts unassigned unless an explicit visible member ID is supplied; submission requires a selected member and the title states the destination.
- **Current code:** `src/features/tasks/taskFormFields.ts` — `getInitialAssigneeId`, `resolveAssigneeContext`; `src/features/manager/ManagerTaskDialogs.tsx` — `AddTaskDialog`; `src/features/manager/ManagerWorkspace.tsx`.
- **Automated evidence:** `src/features/onboarding/onboarding.acceptance.test.tsx` (AC10); `src/features/tasks/taskFormFields.test.ts`; `src/features/manager/ManagerWorkspace.test.tsx`.
- **Migration/rollout implication:** No data migration is required; managers receive the safer default immediately after client rollout.
- **Residual/manual limitation:** Keyboard-only destination review and wrong-destination prevention remain part of the packaged release walkthrough. **Owner: Product QA owner.**

### UX-008 — Team setup writes are destructive, non-transactional full replacements

**Evidence**

- Saving one person still serializes all saved people and rewrites both admin tabs (`src/components/TeamSetupPanel.tsx:528-548`).
- Global save does the same (`src/components/TeamSetupPanel.tsx:556-575`).
- Each writer clears the complete tab body before issuing a second write (`src/services/googleSheets.ts:1165-1213`, `src/services/googleSheets.ts:1225-1270`).
- `SheetRegistry` and `Roles` are two separate requests with no rollback.

**Impact**

Concurrent manager edits can overwrite each other. A network failure after clear can erase a tab. A successful registry write followed by a failed roles write leaves the system inconsistent while the UI reports only a generic save failure. The per-person path also derives its payload from stale `savedPeople`: unsaved additions and edits are omitted, while a person removed only from current `people` can be written back when another row is saved (`src/components/TeamSetupPanel.tsx:398-402`, `src/components/TeamSetupPanel.tsx:520-548`).

**Required outcome**

Use stable IDs, row-level updates, optimistic concurrency/version checks, and one batch transaction where possible. Never clear before replacement data is guaranteed. Detect and reconcile external changes before save.

**Resolution**

- **Status:** Mitigated—platform constraint.
- **Implemented fix:** Firestore member/setup mutations are transactional and revision checked; compatibility writes preflight one member's immutable ID/revision and commit only that member's registry/role ranges in one Sheets batch without clearing tabs. Mirror failure is visible and retryable.
- **Current code:** `backend/src/firestore/firestoreRepository.ts` — transactional member/invitation/setup methods; `backend/src/routes/members.ts` — `updateMemberSetup`; `src/services/sheets/admin/writes.ts` — `mirrorMemberCompatibilityRows`; `src/services/sheets/admin/concurrency.ts` — `prepareRegistryUpsert`, `prepareMemberRoleSync`, `writeAdminValueRanges`; `src/features/setup/useTeamMemberActions.ts` — authoritative save and mirror retry.
- **Automated evidence:** `backend/test/app.test.ts`; `backend/test/repository.emulator.test.ts` passed 1/1 locally with JDK 21; `src/services/sheets/adminConcurrency.test.ts`; `src/features/setup/TeamSetupDraftRecovery.test.tsx`.
- **Migration/rollout implication:** Firestore must be populated first; compatibility mirrors are then reconciled member by member and can temporarily lag.
- **Residual/manual limitation:** Firestore and Sheets cannot share one transaction; simultaneous real-manager edits and mirror failure/retry remain manual. **Owner: Backend/Sheets integration owner.**

### UX-009 — Editing a task can erase unrelated spreadsheet columns

**Evidence**

- `buildRowValues` returns an empty string for every header that is not mapped to an app field (`src/services/googleSheets.ts:522-559`).
- `updateTaskInSheet` writes that complete row from column A through the last header (`src/services/googleSheets.ts:1670-1695`).
- The repository already documents this as a known limitation (`README.md:179-184`).

**Impact**

Editing through the GUI can clear formulas, custom metadata, owner notes, or other lab-specific columns. This is a data-integrity problem disguised as a normal edit action.

**Required outcome**

Update only changed mapped cells with `values:batchUpdate`. Preserve unknown columns and formulas. Show a one-time compatibility warning until this is fixed.

**Resolution**

- **Status:** Resolved—automated.
- **Implemented fix:** Existing tasks are re-found by immutable Task ID; changed mapped cells and the incremented Task Revision are sent in one batch. Creation reserves an immutable ID row and populates mapped cells without overwriting formulas/custom columns.
- **Current code:** `src/services/sheets/taskLog/identity.ts` — `resolveTaskRowById`, `verifyTaskRevisionBeforeMutation`; `src/services/sheets/taskLog/rowMapping.ts` — `buildChangedTaskCellUpdates`; `src/services/sheets/taskLog/writes.ts` — `updateTaskInSheet`, `createTaskInSheet`.
- **Automated evidence:** `src/services/sheets/safety.test.ts` covers changed-cell-only writes, Task Revision conflicts, metadata backfill, and concurrent row reservation; `src/services/sheets/parsers.test.ts`.
- **Migration/rollout implication:** Existing task tabs need targeted Task ID/Task Revision metadata backfill and a refresh before edits are enabled.
- **Residual/manual limitation:** Google Sheets has an unavoidable final read-to-batch race because it offers no compare-and-swap precondition; formulas, protected ranges, duplicate aliases, and custom columns still need real-Sheets validation. **Owner: Sheets data-integrity owner.**

## High-priority findings

### UX-010 — Employee and manager configuration can permanently diverge

The employee's **Change task log** updates only local preferences (`src/App.tsx:482-493`), while the manager dashboard continues using `SheetRegistry`. Renaming a tab or changing a workbook can therefore fix the employee view while leaving every manager on the old source. Provide a request/approval flow that updates the central record or make the central record authoritative and read-only to employees.

**Resolution**

- **Status:** Resolved—automated.
- **Implemented fix:** Member changes update the authoritative backend config with expected revision, invalidate caches, and are reloaded by manager sync; local state no longer overrides backend mapping authority.
- **Current code:** `src/features/onboarding/useEmployeeConnectController.ts` — ready-state `submit`; `src/services/onboardingApi.ts` — `updateConfig`; `src/app/useAccessVerification.ts` — `loadAuthoritativeManagerMembers`; `src/services/cache.ts` — `invalidateDatasetCaches`.
- **Automated evidence:** `src/features/onboarding/EmployeeSetupGate.test.tsx`; `src/app/useDatasetSync.test.ts`; `src/domain/onboarding.test.ts`.
- **Migration/rollout implication:** Device-local overrides should be cleared or ignored only after each legacy member has an authoritative config.
- **Residual/manual limitation:** Cross-device propagation and renamed/deleted-tab recovery still need real-account confirmation. **Owner: Release manager.**

### UX-011 — Manager writes do not use the employee's accepted column map

Manager create/update operations construct preferences from only the task-log URL and active tab (`src/App.tsx:770-785`, `src/App.tsx:812-833`). Even a manager's personal-task preferences can recover a column map only from that manager's device-local employee preferences and only when spreadsheet IDs match (`src/domain/people.ts:152-168`). Employee mappings remain local (`src/services/cache.ts:90-129`). Nonstandard but valid employee sheets can therefore read correctly for the employee and write incorrectly for managers. Persist one shared mapping per registry entry.

**Resolution**

- **Status:** Resolved—automated.
- **Implemented fix:** Every manager mutation resolves the backend-accepted map and refuses to write if column review has not completed.
- **Current code:** `src/app/useAccessVerification.ts` — `resolveMemberTaskPrefs`; `src/domain/onboarding.ts` — `acceptedMemberPrefs`; `src/app/useTaskMutations.ts` — `handleManagerCreateTask`, `handleManagerUpdateTask`, personal-task handlers.
- **Automated evidence:** `src/app/useTaskMutations.test.ts`; `src/domain/onboarding.test.ts`; `src/services/sheets/helpers.test.ts`.
- **Migration/rollout implication:** Legacy column maps must be proposed and accepted centrally before manager writes are enabled.
- **Residual/manual limitation:** Nonstandard real sheets must verify that manager and member writes address identical columns. **Owner: Pilot migration owner.**

### UX-012 — Picker “query” is a URL search, not a file selection

The app passes a saved spreadsheet URL as `query` when reopening a person's workbook or granting missing access (`src/components/TeamSetupPanel.tsx:450`; `src/App.tsx:729-746`). The Tauri Picker sends that string to `DocsView.setQuery` (`src-tauri/src/main.rs:308-313`), which performs text search rather than selecting a file by ID. This can return no result or unrelated results. Use file IDs for verification and human-readable names only for search assistance.

**Resolution**

- **Status:** Resolved—automated.
- **Implemented fix:** Saved URLs are stripped from Picker search hints; setup uses human-readable titles, while exactness is established only by comparing the returned file ID with backend-authoritative IDs.
- **Current code:** `src/services/googleDrivePicker.ts` — `pickerSearchQuery`, `openSpreadsheetPicker`; `src/features/setup/useTeamWorkbookActions.ts` — `pickWorkbook`; `src/features/onboarding/useEmployeeConnectController.ts` — `pickSpreadsheet`; `src/features/onboarding/ManagerFirstRun.tsx` — `selectExactFiles`.
- **Automated evidence:** `src/features/onboarding/onboarding.acceptance.test.tsx` (AC05); `src/services/googleDrivePicker.test.ts`; `src/features/onboarding/EmployeeSetupGate.test.tsx`; `src/features/onboarding/ManagerFirstRun.test.tsx`.
- **Migration/rollout implication:** Stored workbook IDs remain valid; no data rewrite is required, but rollout should preserve authoritative IDs rather than URL-derived search state.
- **Residual/manual limitation:** Real Google Picker search behavior and exact-ID rejection remain unverified. **Owner: Release manager.**

### UX-013 — The grant flow does not verify that the required files were selected

The multi-select Picker reports success based on the number of picked files and immediately retries the full load (`src/App.tsx:729-755`). It does not compare selected IDs with the missing IDs, show progress per member, or retain the accessible subset. Present a checklist keyed by exact spreadsheet ID and report remaining files after each Picker return.

**Resolution**

- **Status:** Resolved—automated.
- **Implemented fix:** Backend progress computes required, verified, and remaining exact IDs; subset proofs are retained across retries and the UI renders an exact-file checklist.
- **Current code:** `src/features/onboarding/ManagerFirstRun.tsx` — `ManagerFirstRun`, `selectExactFiles`; `backend/src/routes/members.ts` — manager-file-proof routes; `backend/src/firestore/firestoreRepository.ts` — `getManagerFileProgress`, `recordManagerFileProof`.
- **Automated evidence:** `src/features/onboarding/onboarding.acceptance.test.tsx` (AC08–AC09); `src/features/onboarding/ManagerFirstRun.test.tsx`; `backend/test/app.test.ts`; `backend/test/lifecycle.test.ts`.
- **Migration/rollout implication:** Each manager/PI starts with a per-account proof record and may need several Picker returns to complete the required set.
- **Residual/manual limitation:** Multi-return Picker sessions and revoked grants require real-account verification. **Owner: Release manager.**

### UX-014 — Lab setup's “Saved” message overstates readiness

The save handlers only write `SheetRegistry` and `Roles` and then say “Saved” or “Saved. Reloading dashboard...” (`src/components/TeamSetupPanel.tsx:542-548`, `src/components/TeamSetupPanel.tsx:569-575`). They do not check the new person's sharing, Picker grants, headers, write permission, or employee-local setup. Replace **Saved** with an onboarding status summary and next actions.

**Resolution**

- **Status:** Resolved—automated.
- **Implemented fix:** Team setup renders the exact backend-returned lifecycle label—**Invited**, **Needs sharing**, **Needs Picker**, **Needs column review**, **Ready**, or **Blocked**—plus owner, reason, and next action. Saving an invitation remains **Invited** unless a later backend transition has actually occurred.
- **Current code:** `src/features/setup/useTeamMemberActions.ts` — `savePerson`; `src/features/setup/MemberEditor.tsx`; `src/domain/onboarding.ts` — `ONBOARDING_STATUS_LABELS`; `backend/src/domain/lifecycle.ts` — `STATUS_DEFAULTS`.
- **Automated evidence:** `src/features/onboarding/onboarding.acceptance.test.tsx` (AC02) checks the exact ordered labels/statuses; `src/components/TeamSetupPanel.test.tsx`; `backend/test/lifecycle.test.ts`.
- **Migration/rollout implication:** Existing members receive a computed/persisted lifecycle state during migration; operators must not map a successful mirror write directly to Ready.
- **Residual/manual limitation:** Product-copy comprehension remains a manager onboarding walkthrough item. **Owner: Product owner.**

### UX-015 — Roles and registry are joined by mutable display name

Role rows link to registry entries through `labMember`, and setup reconstructs people by normalized name or email (`src/components/TeamSetupPanel.tsx:126-168`). Names are not stable identifiers. Renames, collisions, or formatting differences can split or merge people unexpectedly. Introduce an immutable person/member ID referenced by both tabs.

**Resolution**

- **Status:** Resolved—automated.
- **Implemented fix:** Firestore members/configs and compatibility rows use immutable member IDs; role visibility fails closed when linkage is missing.
- **Current code:** `src/domain/onboarding.ts` — `Member`, `MemberConfig`; `src/domain/access.ts` — `roleCapabilitiesForRegistryEntry`; `src/services/sheets/admin/parsing.ts` — `backfillMemberIds`, registry/role parsers and serializers; `backend/src/firestore/firestoreRepository.ts`.
- **Automated evidence:** `src/features/setup/teamSetupState.test.ts`; `src/domain/access.test.ts`; `src/services/sheets/parsers.test.ts`; `backend/test/repository.emulator.test.ts` passed 1/1 locally with JDK 21.
- **Migration/rollout implication:** Duplicate-name and unlinked legacy rows require an approved stable-ID map before compatibility backfill.
- **Residual/manual limitation:** Duplicate-name legacy rows have not been migrated or inspected in a real pilot. **Owner: Pilot migration owner.**

### UX-016 — Per-person save can overwrite unseen external changes

“Save” on one person is not a row-level save; it writes the complete `savedPeople` snapshot (`src/components/TeamSetupPanel.tsx:520-548`). Any sheet edits made after the panel loaded are silently replaced. Rename the action until it is truly scoped, and add revision/conflict detection.

**Resolution**

- **Status:** Resolved—automated.
- **Implemented fix:** Per-member updates carry expected backend and config revisions; mirror updates preflight one member's revision and surface conflicts without overwriting other rows.
- **Current code:** `src/features/setup/useTeamMemberActions.ts` — `savePerson`, mirror retry handling; `backend/src/routes/members.ts` — member setup patch; `src/services/sheets/admin/concurrency.ts` — revision assertions and scoped range preparation; `src/services/sheets/admin/writes.ts` — `mirrorMemberCompatibilityRows`.
- **Automated evidence:** `backend/test/app.test.ts`; `src/services/sheets/adminConcurrency.test.ts`.
- **Migration/rollout implication:** Rollout must establish initial revisions for authoritative members and compatibility rows before concurrent editing.
- **Residual/manual limitation:** Two-manager real-time conflict handling and reconciliation remain manual release tests. **Owner: Backend/Sheets integration owner.**

### UX-017 — Existing profile photos cannot actually be removed

Choosing **Use initials instead** sets only local `profileChoice = noPhoto` (`src/components/EmployeeSetupGate.tsx:539-547`). Submit writes a profile only for `profileChoice.kind === "new"` (`src/components/EmployeeSetupGate.tsx:655-686`). An existing image therefore remains in the Sheet and continues appearing for managers. Add an explicit delete/clear write and confirmation.

**Resolution**

- **Status:** Resolved—automated.
- **Implemented fix:** Choosing initials writes an empty profile picture to the Profile sheet and clears the local cache.
- **Current code:** `src/features/onboarding/useEmployeeProfile.ts` — `useInitials`; `src/services/sheets/profile.ts` — `writeEmployeeProfile`; `src/features/onboarding/ProfileStep.tsx`.
- **Automated evidence:** `src/features/onboarding/EmployeeSetupGate.test.tsx`; `src/services/sheets/parsers.test.ts`.
- **Migration/rollout implication:** No schema migration is required; existing images remain until a member explicitly chooses initials.
- **Residual/manual limitation:** Manager profile refresh after deletion still needs a real-workbook check. **Owner: Product QA owner.**

### UX-018 — Optional profile failure blocks otherwise valid onboarding after partial mutation

Column insertions occur before the profile write, and profile failure prevents `onValidated` (`src/components/EmployeeSetupGate.tsx:604-688`). The optional photo can block access after the sheet has already been modified. Complete task-log connection first; make profile save independently retryable and non-blocking.

**Resolution**

- **Status:** Resolved—automated.
- **Implemented fix:** Profile upload/deletion is a separate independently retryable action; errors are isolated and never gate column acceptance or workspace entry.
- **Current code:** `src/features/onboarding/useEmployeeConnectController.ts` — `submit`; `src/features/onboarding/useEmployeeProfile.ts` — `saveFile`, `useInitials`; `src/features/onboarding/ProfileStep.tsx`.
- **Automated evidence:** `src/features/onboarding/EmployeeSetupGate.test.tsx`.
- **Migration/rollout implication:** Profile data can be migrated independently and must not block authoritative onboarding cutover.
- **Residual/manual limitation:** A real Profile-tab write failure after successful onboarding has not been induced. **Owner: Product QA owner.**

### UX-019 — “Optional” task fields are mandatory during connection

`Comments` and `Notebook Location` are described as optional task data (`src/domain/app.ts:142-156`), but the connection validator requires a column selection for every `TASK_FIELDS` item without checking `field.required` (`src/components/EmployeeSetupGate.tsx:97-121`, `src/components/EmployeeSetupGate.tsx:489-500`). The UI explicitly says those optional fields still require columns (`src/components/EmployeeSetupGate.tsx:963-968`). Permit genuinely optional columns to remain unmapped and make write paths tolerate their absence.

**Resolution**

- **Status:** Resolved—automated.
- **Implemented fix:** Mapping validation requires only fields marked required; optional fields can remain unmapped and cell-update builders tolerate absent indices.
- **Current code:** `src/features/onboarding/columnMapping.ts` — `validateSelections`, `buildColumnMap`; `src/features/onboarding/ColumnMappingStep.tsx`; `src/services/sheets/taskLog/rowMapping.ts` — mapped-cell builders; `src/services/sheets/taskLog/writes.ts`.
- **Automated evidence:** `src/features/onboarding/columnMapping.test.ts`; `src/services/sheets/parsers.test.ts`; `src/services/sheets/helpers.test.ts`.
- **Migration/rollout implication:** Existing accepted maps may omit optional fields; no placeholder columns need to be added during migration.
- **Residual/manual limitation:** End-to-end onboarding against a real sheet lacking both optional columns remains. **Owner: Product QA owner.**

### UX-020 — First-run setup is unnecessarily duplicated and cognitively heavy

Employee setup requires file choice, tab choice, mapping eleven fields, possibly inserting columns, and profile setup in one gate (`src/components/EmployeeSetupGate.tsx:756-1133`). Most of this information already exists or could be proposed from the manager's registry record and header inference. Prefill verified data, separate required connection from optional customization, and offer advanced mapping only when inference is ambiguous.

**Resolution**

- **Status:** Resolved—automated.
- **Implemented fix:** Invitations prefill exact workbook/tab/proposed mapping, lifecycle routing shows only the current prerequisite, inferred mappings are reviewed only when required, and profile remains optional.
- **Current code:** `src/features/onboarding/EmployeeSetupGate.tsx`; `src/features/onboarding/OnboardingSteps.tsx`; `src/features/onboarding/ColumnMappingStep.tsx`; `src/domain/onboarding.ts` — `membershipPrefs`.
- **Automated evidence:** `src/features/onboarding/onboarding.acceptance.test.tsx` (AC03–AC05); `src/features/onboarding/EmployeeSetupGate.test.tsx`; `src/features/onboarding/columnMapping.test.ts`; `backend/test/lifecycle.test.ts`.
- **Migration/rollout implication:** Legacy workbooks should be inventoried so rollout can prefill known values and surface only unresolved review.
- **Residual/manual limitation:** Moderated first-run usability with new and legacy workbooks remains. **Owner: Product research owner.**

### UX-021 — Generic failures change the user's role instead of preserving context

`probeAdminAccess` treats most unexpected failures as `noAccess` and routes to employee setup (`src/App.tsx:268-297`). A manager experiencing a temporary Sheets error can suddenly see an employee onboarding screen. Preserve the last verified role, show an offline/error state, and never turn transport failure into authorization state.

**Resolution**

- **Status:** Resolved—automated.
- **Implemented fix:** A retryable backend transport failure preserves the cached verified membership; dataset failures preserve role and scoped data and render diagnostics rather than reclassifying the user.
- **Current code:** `src/app/useAccessVerification.ts` — `probeAdminAccess`; `src/auth/roles.ts` — `resolveAuthoritativeViewerContext`; `src/app/useDatasetSync.ts` — `loadManagerData`; `src/app/screens.tsx` — `ManagerShell`.
- **Automated evidence:** `src/auth/roles.authoritative.test.ts`; `src/app/useDatasetSync.test.ts`; `src/app/routing.test.ts`.
- **Migration/rollout implication:** Verified membership cache entries must be versioned/invalidated at authorization cutover.
- **Residual/manual limitation:** Offline/reconnect runtime behavior after a previously verified manager session remains. **Owner: Release manager.**

### UX-022 — Hosted-web distribution guidance conflicts with Tauri-only auth and Picker implementations

The documentation recommends a hosted static build (`README.md:145-158`; `DISTRIBUTION_SETUP.md:23-31`), but sign-in uses Tauri OAuth and shell plugins (`src/auth/googleIdentity.ts:1-4`, `src/auth/googleIdentity.ts:77-106`) and Picker uses `@tauri-apps/api/core.invoke` (`src/services/googleDrivePicker.ts:1-2`, `src/services/googleDrivePicker.ts:82-92`). A normal browser cannot invoke those native commands. Either implement browser-specific OAuth/Picker adapters or remove hosted-web claims.

**Resolution**

- **Status:** Resolved—static/manual pending.
- **Implemented fix:** Distribution is documented as Tauri desktop only; OAuth, Picker, and secret storage are explicit platform adapters and browser hosting is no longer presented as a supported release.
- **Current code:** `src/platform/contracts.ts`; `src/platform/tauri/auth.ts`; `src/platform/tauri/picker.ts`; `src/platform/tauri/secrets.ts`; `README.md`; `DISTRIBUTION_SETUP.md`.
- **Automated evidence:** `src/services/googleDrivePicker.test.ts`; `src/platform/tauri/secrets.test.ts`; `src/auth/googleIdentity.test.ts`; `npm run verify:release` checks the desktop build contracts.
- **Migration/rollout implication:** Remove any hosted `dist/` deployment from release procedures and distribute only approved desktop packages.
- **Residual/manual limitation:** Signed packaged execution is unverified on supported desktop OSes; hosted-web execution is not supported. **Owner: Release engineering owner.**

### UX-023 — Unauthorized users are offered a misleading setup action

The unauthorized screen tells the user to ask a manager, but also provides **Open setup** (`src/components/UnauthorizedScreen.tsx:21-40`). `App` opens bootstrap configuration, not team access management (`src/App.tsx:870-896`). An unauthorized user cannot grant themselves a role there; they can only alter local Google/admin configuration. Replace this with **Request access**, copyable diagnostics, or sign-out/account-switch actions.

**Resolution**

- **Status:** Resolved—automated.
- **Implemented fix:** Unauthorized users receive Request access, Switch Google account, Sign out, and diagnostics; no setup/self-grant action is offered.
- **Current code:** `src/components/UnauthorizedScreen.tsx` — `UnauthorizedScreen`; `src/app/screens.tsx` — `UnauthorizedShell`; `src/app/routing.ts` — `selectAppRoute`.
- **Automated evidence:** `src/app/screens.test.tsx`; `src/app/routing.test.ts`.
- **Migration/rollout implication:** No data migration is required; support documentation should point users to the new request/account actions.
- **Residual/manual limitation:** Default mail-client behavior and account switching need packaged-build verification. **Owner: Product QA owner.**

### UX-024 — Manager editing is inconsistent and largely hidden

Manager Kanban cards provide only **See more** (`src/features/manager/ManagerWorkspace.tsx:279-325`). The edit handler is exposed through the Gantt repair queue for unscheduled/invalid tasks (`src/features/manager/ManagerWorkspace.tsx:1228-1236`; `src/features/gantt/GanttView.tsx:603-611`). Managers can add tasks but cannot discoverably edit a normal task from the primary Kanban view. Add a consistent task action menu and permission model.

**Resolution**

- **Status:** Resolved—automated.
- **Implemented fix:** Every manager Kanban task exposes Edit task, using the shared manager edit dialog and explicit permission rules.
- **Current code:** `src/features/manager/ManagerDashboardComponents.tsx` — `ManagerTaskCard`, `ManagerKanban`; `src/features/manager/ManagerTaskDialogs.tsx` — `EditTaskDialog`; `src/features/tasks/taskFormFields.ts` — `TASK_FORM_PERMISSION_RULES`.
- **Automated evidence:** `src/features/manager/ManagerWorkspace.test.tsx`; `src/features/tasks/taskFormFields.test.ts`.
- **Migration/rollout implication:** No data migration is required; the action appears with the updated client.
- **Residual/manual limitation:** Discoverability and permission copy require manager/PI user review. **Owner: Product owner.**

### UX-025 — Row-number identity makes GUI actions unsafe after external sheet edits

Record IDs and writes depend on sheet row numbers (`src/services/googleSheets.ts:460-488`, `src/services/googleSheets.ts:1670-1695`). Inserting, sorting, or deleting rows after load can cause the GUI to update a different task. Add an immutable task ID column and verify it immediately before mutation.

**Resolution**

- **Status:** Resolved—automated.
- **Implemented fix:** Task IDs and Task Revisions are generated/backfilled, mutations refuse missing metadata, and the target row plus expected revision are re-read immediately before writes; legacy backfill forces a refresh/reopen.
- **Current code:** `src/services/sheets/taskLog/rowMapping.ts` — `TASK_ID_HEADER`, `TASK_REVISION_HEADER`, metadata builders; `src/services/sheets/taskLog/identity.ts` — `backfillTaskIdsInSheet`, `resolveTaskRowById`, `verifyTaskRevisionBeforeMutation`; `src/app/useTaskMutations.ts` — identity requirements.
- **Automated evidence:** `src/services/sheets/safety.test.ts` covers Task ID relocation, stale Task Revision rejection, and metadata backfill; `src/app/useTaskMutations.test.ts`; `src/services/sheets/parsers.test.ts`.
- **Migration/rollout implication:** Pilot migration must backfill both immutable Task ID and Task Revision cells through targeted writes, then refresh all clients.
- **Residual/manual limitation:** External sort/insert/delete and duplicate/corrupt metadata repair need real-Sheets testing; a write can still land in the final verification-read-to-batch race. **Owner: Sheets data-integrity owner.**

## UI consistency and accessibility findings

### UX-026 — Status banners are not announced and success has no success styling

Application statuses render as `banner--error` or `banner--info`; success is also mapped to info (`src/App.tsx:870-877`, `src/App.tsx:926-932`, `src/App.tsx:957-963`). These banners lack `role="status"`, `role="alert"`, and `aria-live`, and they remain until another action clears them. Add semantic live regions, distinct success treatment, dismissal, and lifecycle rules.

**Resolution**

- **Status:** Resolved—automated.
- **Implemented fix:** A shared banner has success/info/error tones, correct live-region semantics, atomic announcements, and optional dismiss controls.
- **Current code:** `src/components/ui/StatusBanner.tsx` — `StatusBanner`; `src/app/screens.tsx` — `StatusMessageBanner`; `src/styles/components.css`.
- **Automated evidence:** `src/components/ui/accessibility.test.tsx`.
- **Migration/rollout implication:** No data migration is required; routes adopt the shared banner with the client rollout.
- **Residual/manual limitation:** Announcement timing remains unverified with VoiceOver and NVDA. **Owner: Accessibility QA owner.**

### UX-027 — Dialogs lack core keyboard and screen-reader behavior

Dialogs use `role="dialog"` and `aria-modal`, but do not provide `aria-labelledby`, initial focus, a focus trap, Escape handling, background inertness, or focus restoration (`src/features/employee/EmployeeWorkspace.tsx:191-210`; `src/features/manager/ManagerWorkspace.tsx:344-518`, `src/features/manager/ManagerWorkspace.tsx:521-710`). Use a shared accessible dialog primitive.

**Resolution**

- **Status:** Resolved—automated.
- **Implemented fix:** All task, confirmation, and setup dialogs use a portal primitive with labeling, initial focus, trap, Escape close, modal isolation, and focus restoration.
- **Current code:** `src/components/ui/Dialog.tsx` — `Dialog`; `src/components/ui/ConfirmDialog.tsx` — `ConfirmDialog`; `src/hooks/useFocusTrap.ts`; `src/hooks/useModalIsolation.ts`; `src/features/tasks/TaskDialogShell.tsx`.
- **Automated evidence:** `src/components/ui/accessibility.test.tsx`; `src/features/setup/MemberEditor.test.tsx`; `src/features/employee/EmployeeWorkspace.accessibility.test.tsx` exercises Escape focus restoration in the member task dialog.
- **Migration/rollout implication:** No data migration is required; legacy dialogs are replaced at client rollout.
- **Residual/manual limitation:** Screen-reader rotor, nested focus, and macOS/Windows keyboard behavior remain manual. **Owner: Accessibility QA owner.**

### UX-028 — Form errors are visual but not programmatically linked

Forms render hints and top-level error paragraphs without `aria-invalid`, `aria-describedby`, `role="alert"`, an error summary, or focus movement to the first invalid field (for example `src/features/employee/EmployeeWorkspace.tsx:221-393`; `src/components/TeamSetupPanel.tsx:184-240`, `src/components/TeamSetupPanel.tsx:755-761`). Add stable field IDs and accessible validation behavior.

**Resolution**

- **Status:** Resolved—automated.
- **Implemented fix:** Shared fields link labels, hints, and errors; summaries link to invalid controls; setup/task/config flows focus the first invalid field.
- **Current code:** `src/components/ui/FormField.tsx` — `FormField`; `src/components/ui/ErrorSummary.tsx` — `ErrorSummary`; `src/features/tasks/TaskForm.tsx`; `src/features/manager/ManagerTaskDialogs.tsx`; `src/components/ConfigPanel.tsx`; `src/features/setup/TeamSetupPanel.tsx`.
- **Automated evidence:** `src/components/ui/accessibility.test.tsx`; `src/components/ConfigPanel.test.tsx`; `src/features/onboarding/EmployeeSetupGate.test.tsx`; `src/features/employee/EmployeeWorkspace.accessibility.test.tsx` exercises first-invalid-field focus and descriptions.
- **Migration/rollout implication:** No data migration is required; form semantics ship with the client.
- **Residual/manual limitation:** Complete error-recovery flows with VoiceOver/NVDA remain unexecuted. **Owner: Accessibility QA owner.**

### UX-029 — Reorderable tabs are mouse-drag-only and incomplete ARIA tabs

Employee tabs are draggable buttons with `role="tab"`, but have no keyboard reordering, arrow-key tab navigation, `aria-controls`, associated `tabpanel`, or drag instructions (`src/features/manager/ManagerWorkspace.tsx:131-195`). Provide keyboard controls and announcements, or use ordinary non-draggable filters with a separate reorder mode.

**Resolution**

- **Status:** Resolved—automated.
- **Implemented fix:** ARIA tabs support arrows/Home/End and linked panels; a separate keyboard-operable reorder mode uses Move earlier/later with live announcements.
- **Current code:** `src/components/ui/TabList.tsx` — `TabList`, `TabPanel`; `src/features/manager/ManagerDashboardComponents.tsx` — `ReorderableTabs`.
- **Automated evidence:** `src/features/onboarding/onboarding.acceptance.test.tsx` (AC12) exercises arrow-key tab focus; `src/components/ui/accessibility.test.tsx`; `src/features/manager/ManagerWorkspace.test.tsx`.
- **Migration/rollout implication:** Existing tab-order preferences remain usable; no data migration is required.
- **Residual/manual limitation:** Reorder announcements and RTL behavior need assistive-technology verification. **Owner: Accessibility QA owner.**

### UX-030 — Segmented view controls expose active state only visually

Kanban/Gantt and Manager view/Personal tasks use styled buttons without `aria-pressed` or tab semantics (`src/features/manager/ManagerWorkspace.tsx:1026-1060`; `src/features/employee/EmployeeWorkspace.tsx:728-743`). Add semantic selected state and connect controls to their panels.

**Resolution**

- **Status:** Resolved—automated.
- **Implemented fix:** Workspace switches use a keyboard-operable radiogroup with programmatic checked state.
- **Current code:** `src/components/ui/SegmentedControl.tsx` — `SegmentedControl`; `src/features/employee/EmployeeWorkspace.tsx`; `src/features/manager/ManagerWorkspace.tsx`.
- **Automated evidence:** `src/components/ui/accessibility.test.tsx`; `src/features/manager/ManagerWorkspace.test.tsx`.
- **Migration/rollout implication:** No data migration is required; selection state stays client-local.
- **Residual/manual limitation:** Screen-reader naming and selected-state announcements remain manual. **Owner: Accessibility QA owner.**

### UX-031 — Several interaction targets are below desktop accessibility guidance

The shared button minimum height is 2.4rem (about 38 px at the default font size), below the commonly recommended 44 px target (`src/styles.css:262-278`). Manager filter buttons are reduced further to 2.1rem (`src/styles.css:1862-1866`), and compact checkboxes are 0.9rem (`src/styles.css:1895-1899`). Increase hit areas while preserving visual density.

**Resolution**

- **Status:** Resolved—automated.
- **Implemented fix:** A 44 px control-hit token governs interactive controls and a CSS contract test rejects undersized overrides.
- **Current code:** `src/styles/tokens.css` — `--control-hit-size`; `src/styles/base.css`; `src/styles/components.css`; `src/styles/features.css`.
- **Automated evidence:** `src/styles/accessibilityContract.test.ts`.
- **Migration/rollout implication:** No data migration is required; the updated CSS token applies globally at rollout.
- **Residual/manual limitation:** Effective hit areas need verification at OS scaling and on touch-enabled Windows hardware. **Owner: Accessibility QA owner.**

### UX-032 — Fixed floating actions can cover content

The employee FAB and manager FAB group are fixed 1.5rem from the bottom (`src/styles.css:2046-2094`), while the page reserves only 3rem of bottom padding on desktop and 2rem on narrow screens (`src/styles.css:129-138`, `src/styles.css:2299-2301`). Long cards and mobile content can sit beneath the controls. Reserve a safe bottom inset and account for platform safe areas.

**Resolution**

- **Status:** Resolved—automated.
- **Implemented fix:** Workspace shells reserve separate member/manager action depths and fixed actions honor safe-area insets and viewport bounds.
- **Current code:** `src/styles/tokens.css` — `--safe-action-bottom`, `--safe-manager-actions-bottom`; `src/styles/layout.css`; `src/styles/features.css`.
- **Automated evidence:** `src/styles/accessibilityContract.test.ts`; `src/features/manager/ManagerWorkspace.test.tsx`.
- **Migration/rollout implication:** No data migration is required; layout spacing changes with the client.
- **Residual/manual limitation:** Long content at 320–720 px widths and platform scaling needs visual inspection. **Owner: Product QA owner.**

### UX-033 — Removal lacks a scoped confirmation or undo

**Remove** immediately deletes a person from the editable list (`src/components/TeamSetupPanel.tsx:398-402`, `src/components/TeamSetupPanel.tsx:624-630`). The only protection is a generic unsaved-changes prompt when closing the entire panel (`src/components/TeamSetupPanel.tsx:583-590`). Add a person-specific confirmation, mark as pending removal, and offer undo before save.

**Resolution**

- **Status:** Resolved—automated.
- **Implemented fix:** Removal is a scoped deactivation confirmation, updates one authoritative member/invitation by revision, and exposes an undo reactivation action.
- **Current code:** `src/features/setup/useTeamMemberActions.ts` — `confirmRemoval`, `undoMemberDeactivation`; `src/features/setup/TeamSetupViews.tsx`; `src/components/ui/ConfirmDialog.tsx`; `src/features/setup/MemberEditor.tsx`.
- **Automated evidence:** `src/features/setup/MemberEditor.test.tsx`; `src/components/TeamSetupPanel.test.tsx`; `src/app/useMemberLoadRecovery.test.ts` exercises revision-fetched inline deactivation.
- **Migration/rollout implication:** Legacy removals should be represented as inactive authoritative records rather than destructive row deletion.
- **Residual/manual limitation:** Interruption/retry around deactivation and undo needs a live backend. **Owner: Backend release owner.**

### UX-034 — Loading feedback often replaces the whole useful state

Manager loading and access errors frequently clear `dataset` and show a separate no-data shell (`src/App.tsx:303-356`, `src/App.tsx:975-1095`). Employee loading is a generic banner while task controls remain visible (`src/features/employee/EmployeeWorkspace.tsx:726-743`). Keep last-known data visible with a refreshing indicator, disable only affected mutations, and distinguish stale data from no data.

**Resolution**

- **Status:** Resolved—automated.
- **Implemented fix:** Refresh preserves scoped data, marks stale state, renders sync health, and disables mutations while refresh is active.
- **Current code:** `src/app/useDatasetSync.ts` — `loadManagerData`, `loadEmployeeData`; `src/components/ui/SyncStatus.tsx`; `src/features/employee/EmployeeWorkspace.tsx`; `src/features/manager/ManagerWorkspace.tsx`.
- **Automated evidence:** `src/app/useDatasetSync.test.ts` exercises data preservation; `src/features/manager/ManagerWorkspace.test.tsx`; `src/features/employee/EmployeeWorkspace.accessibility.test.tsx` exercises the member loading/busy controls.
- **Migration/rollout implication:** Dataset cache versioning invalidates incompatible old snapshots; no server data migration is required.
- **Residual/manual limitation:** Runtime slow-network, offline, and retry transitions remain. **Owner: Product QA owner.**

### UX-035 — Terminology is inconsistent across roles and screens

The same entity is called **person**, **employee**, **lab member**, **manager**, and **PI**, while a manager may also need an Employee role for personal work (`src/components/TeamSetupPanel.tsx:796-903`; `src/features/manager/ManagerWorkspace.tsx:1063-1095`). “Lab setup,” “Bootstrap setup,” “backend data store,” “admin workbook,” “task log,” and “lab log” also overlap. Establish a product glossary and use:

- **Member** for a person.
- **Access role** for Employee/Manager/PI capabilities.
- **Task-log workbook** for an individual's work file.
- **Admin workbook** for the central roster/configuration file.
- **Active task tab** for the selected tab inside a task-log workbook.

**Resolution**

- **Status:** Resolved—automated.
- **Implemented fix:** Primary rendered `.tsx` surfaces use Member, Access role, Task-log workbook, Admin workbook, Active task tab, and Team setup consistently. The enforcement script intentionally scans user-facing JSX text/attributes in non-test `.tsx` files; it does not prove terminology in `.ts`-generated runtime strings, documentation, backend responses, or external Google UI.
- **Current code:** `src/app/screens.tsx`; `src/components/UnauthorizedScreen.tsx`; `src/features/setup/TeamSetupPanel.tsx`; `src/features/setup/teamSetupState.ts` — `roleLabel`; `src/features/onboarding/EmployeeSetupGate.tsx`.
- **Automated evidence:** `scripts/check-terminology.mjs` statically parses rendered fragments in non-test `.tsx` files and runs in `npm run frontend:build`; component tests verify selected primary copy.
- **Migration/rollout implication:** Support, migration, and release documents need a separate editorial pass because the executable check does not scan them.
- **Residual/manual limitation:** Secondary help, `.ts`-generated errors, backend/external copy, and migration documentation remain outside enforcement. **Owner: Product content owner.**

### UX-036 — Task forms are duplicated and already inconsistent

Employee and manager create/edit forms are separate implementations (`src/features/employee/EmployeeWorkspace.tsx:221-395`; `src/features/manager/ManagerWorkspace.tsx:344-710`). Their status options, validation, labels, placeholders, and available fields differ. For example, the manager create form omits `Complete`, `Result`, and `Notebook Location`, while edit forms expose different requirements. Consolidate them into shared field definitions and reusable form components.

**Resolution**

- **Status:** Resolved—automated.
- **Implemented fix:** Member and manager dialogs share task field rendering, validation order, draft conversion, and explicit permission rules for create/edit/completion fields.
- **Current code:** `src/features/tasks/TaskForm.tsx` — `TaskForm`; `src/features/tasks/taskFormFields.ts` — `TASK_FORM_PERMISSION_RULES`, validation helpers; `src/features/employee/EmployeeTaskDialogs.tsx`; `src/features/manager/ManagerTaskDialogs.tsx`.
- **Automated evidence:** `src/features/tasks/taskFormFields.test.ts`; `src/features/manager/ManagerWorkspace.test.tsx`; `src/features/employee/EmployeeWorkspace.accessibility.test.tsx`.
- **Migration/rollout implication:** No data migration is required; permission differences remain explicit in shared definitions.
- **Residual/manual limitation:** Labels and workflows still need comparison with member/manager users. **Owner: Product owner.**

### UX-037 — “Run summary” can report completion even when refresh fails

`handleRunSummary` records a completion time and snapshot in `finally` (`src/features/manager/ManagerWorkspace.tsx:890-907`). `onRefresh` ultimately calls a loader that handles errors internally rather than rejecting (`src/App.tsx:599-607`, `src/App.tsx:303-357`). The FAB can therefore show a recent successful-looking run after a failed refresh. Even on success, the snapshot is built from the pre-refresh `dataset.experiments` prop captured by the handler, not from the refreshed payload (`src/features/manager/ManagerWorkspace.tsx:901-905`). Return the refreshed dataset, snapshot that exact payload, and record run success only after verification.

**Resolution**

- **Status:** Resolved—automated.
- **Implemented fix:** Run summary records time and snapshot only when refresh returns a dataset, and snapshots that returned payload.
- **Current code:** `src/features/manager/useManagerRunSummary.ts` — `useManagerRunSummary`, `runSummary`; `src/app/useDatasetSync.ts` — `loadManagerData`.
- **Automated evidence:** `src/features/manager/ManagerWorkspace.test.tsx`.
- **Migration/rollout implication:** Existing client-local run snapshots may be discarded; no authoritative data migration is required.
- **Residual/manual limitation:** A real Sheets refresh failure has not been used to confirm that no successful-looking run is stored. **Owner: Product QA owner.**

### UX-038 — The app has no employee-facing manual refresh or sync health

Employees see a last-loaded local view but have no explicit refresh action, last-sync timestamp, stale-data notice, or conflict warning (`src/features/employee/EmployeeWorkspace.tsx:669-812`). Managers have “Run summary,” which mixes refresh with change tracking. Provide a consistent **Refresh** action and visible sync state in both workspaces.

**Resolution**

- **Status:** Resolved—automated.
- **Implemented fix:** Member and manager workspaces expose explicit refresh actions, last-sync state, stale reasons, and syncing status.
- **Current code:** `src/features/employee/EmployeeWorkspace.tsx`; `src/features/manager/ManagerWorkspace.tsx`; `src/components/ui/SyncStatus.tsx`.
- **Automated evidence:** `src/features/employee/EmployeeWorkspace.accessibility.test.tsx` genuinely exercises the member refresh/loading control state; `src/features/manager/ManagerWorkspace.test.tsx` exercises personal-task refresh; `src/app/useDatasetSync.test.ts` exercises sync preservation. These are component/hook tests, not sleep/resume coverage.
- **Migration/rollout implication:** No server migration is required; cache versioning and sync labels take effect on client update.
- **Residual/manual limitation:** Timestamps, stale copy, and refresh behavior across sleep/resume and offline transitions remain manual. **Owner: Product QA owner.**

### UX-039 — Dark-theme typography is not portable across distributed platforms

The sole font family is `"Avenir Next"` with no explicit fallback stack (`src/styles.css:8-13`). It will render differently or fall back unpredictably on Windows, even though the app distributes desktop installers. Define system fallbacks or bundle a licensed cross-platform family and verify text metrics on macOS and Windows.

**Resolution**

- **Status:** Resolved—static/manual pending.
- **Implemented fix:** Font tokens use the approved Avenir/system fallback stack and a repository-wide font policy check rejects unapproved declarations or external font providers.
- **Current code:** `src/styles/tokens.css` — `--font-primary`, `--font-secondary`; `src/features/gantt/gantt.css`; `scripts/check-fonts.mjs`.
- **Automated evidence:** `npm run check:fonts` runs inside `npm run frontend:build`; `scripts/check-fonts.mjs` is the executable static check.
- **Migration/rollout implication:** No data migration is required; fallback metrics can change layout and therefore require platform visual baselines.
- **Residual/manual limitation:** Text metrics, wrapping, and fallback rendering require signed macOS/Windows acceptance testing. **Owner: Release engineering owner.**

## Additional onboarding and access findings

### UX-040 — Lab setup has no Drive-sharing step

Lab setup saves only registry and role rows (`src/components/TeamSetupPanel.tsx:542-548`, `src/components/TeamSetupPanel.tsx:569-575`). There is no check or action to share the selected task log with the new member, share the admin workbook with a new manager, or confirm edit permission. Missing sharing is discovered only later and is conflated with Picker authorization. Add a clearly owned **Share in Google Drive** prerequisite or implement a supported permission-management backend.

**Resolution**

- **Status:** Resolved—static/manual pending.
- **Implemented fix:** Team setup exposes an explicit Drive provisioning action; the backend derives exact files from Firestore, uses the manager's transient Drive token, maps policy/ownership errors, and advances sharing separately from Picker proof.
- **Current code:** `src/features/setup/useTeamMemberActions.ts` — `provision`; `src/services/onboardingApi.ts` — `provisionDrive`; `backend/src/routes/drivePermissions.ts`; `backend/src/drive/googleDrive.ts` — `GoogleDrivePermissionClient.createUserPermission`; `backend/src/drive/bootstrapVerifier.ts`.
- **Automated evidence:** `src/services/onboardingApi.test.ts`; `backend/test/driveProvisioning.test.ts`; `backend/test/app.test.ts`.
- **Migration/rollout implication:** Existing members require an explicit sharing inventory and operator-approved provisioning; no permission mutation is implied by migration dry-run.
- **Residual/manual limitation:** No live Drive permission or Workspace policy test occurred; owner, organizer, shared-drive, external-domain, view-only, revoked, and notification behavior remain open. **Owner: Google Workspace release owner.**

### UX-041 — Picker authorization is a per-manager onboarding tax

Selecting a task log in Lab setup grants `drive.file` access only to the manager account performing that selection (`src/services/googleSheets.ts:38-42`; `src/components/TeamSetupPanel.tsx:436-469`). Every other manager and PI must separately pick the new file, and until then their entire dashboard is cleared (`src/App.tsx:325-336`, `src/App.tsx:1031-1061`). Show grant readiness per viewer and preserve partial dashboards; do not imply one manager's selection authorized the team.

**Resolution**

- **Status:** Mitigated—platform constraint.
- **Implemented fix:** Each manager/PI gets a retained exact-file checklist, while partial datasets stay usable and missing grants are per-member issues. The UI no longer implies that another account's selection transfers authorization.
- **Current code:** `src/features/onboarding/ManagerFirstRun.tsx`; `backend/src/firestore/firestoreRepository.ts` — `getManagerFileProgress`, `recordManagerFileProof`; `src/services/sheets/dataset.ts` — `loadGoogleSheetsDataset`; `src/app/useDatasetSync.ts` — `loadManagerData`.
- **Automated evidence:** `src/features/onboarding/onboarding.acceptance.test.tsx` (AC08–AC09); `src/features/onboarding/ManagerFirstRun.test.tsx`; `backend/test/app.test.ts`; `src/services/sheets/safety.test.ts`; `src/app/useDatasetSync.test.ts`.
- **Migration/rollout implication:** Rollout must schedule exact-file Picker completion independently for every manager/PI account.
- **Residual/manual limitation:** `drive.file` grants are inherently per account/exact file; every release-role account must complete real Picker validation. **Owner: Release manager.**

### UX-042 — Lab setup silently adds Employee capability

New people start with Employee checked (`src/components/TeamSetupPanel.tsx:100-103`). Existing task-log rows with no recognized role are also automatically assigned Employee in the edit model (`src/components/TeamSetupPanel.tsx:170-173`). This can create an active employee entry and trigger the multi-manager Picker failure even when the operator intended a manager-only or repair-only row. Require explicit role confirmation and explain the dashboard consequences before activation.

**Resolution**

- **Status:** Resolved—automated.
- **Implemented fix:** New invitation drafts start with no roles and per-member validation blocks save until at least one Access role is explicitly selected.
- **Current code:** `src/features/setup/teamSetupState.ts` — `emptyRoles`, `blankPerson`, `validatePeople`; `src/features/setup/RoleConfirmation.tsx`; `src/features/setup/useTeamMemberActions.ts` — `savePerson`.
- **Automated evidence:** `src/features/onboarding/onboarding.acceptance.test.tsx` (AC01); `src/components/TeamSetupPanel.test.tsx`; `src/features/setup/teamSetupState.test.ts`.
- **Migration/rollout implication:** Legacy rows with implicit/default roles must be reviewed before authoritative invitation creation.
- **Residual/manual limitation:** Role-only and dual-role invitation copy needs manager review. **Owner: Product owner.**

### UX-043 — Changing the admin workbook discards the in-memory roster

When a different backend workbook is picked, Lab setup immediately clears `people`, `savedPeople`, and the save signature (`src/components/TeamSetupPanel.tsx:419-427`). The action has no unsaved-change confirmation specific to changing the data store. Protect it as a destructive context switch and preserve/recover the draft if loading the replacement fails.

**Resolution**

- **Status:** Resolved—automated.
- **Implemented fix:** Connection setup holds a pending workbook switch until explicit confirmation, and authoritative team reload failures preserve the visible draft.
- **Current code:** `src/components/ConfigPanel.tsx` — `handlePickAdminSpreadsheet`, `pendingAdminSwitch`; `src/features/setup/useTeamSetupController.ts` — `loadAuthoritativePeople`.
- **Automated evidence:** `src/components/ConfigPanel.test.tsx`; `src/features/setup/TeamSetupDraftRecovery.test.tsx`.
- **Migration/rollout implication:** Admin-workbook changes require an explicit operator decision and should not be bundled into automatic migration.
- **Residual/manual limitation:** Cancelled/failed switches with unsaved edits need a packaged-session test. **Owner: Product QA owner.**

### UX-044 — The manager recovery path is narrowly gated and easy to miss

**Pick the admin workbook instead** appears only for `viewer.source === "noAdminAccess"` (`src/App.tsx:916-920`). It is absent for role-resolved employees and the separate unauthorized screen, and it searches using the saved workbook URL rather than verifying an ID (`src/App.tsx:691-716`). Create a dedicated account/access diagnostic screen available from every non-ready state.

**Resolution**

- **Status:** Resolved—automated.
- **Implemented fix:** Access-check, unauthorized, member onboarding, manager first-run, and manager recovery surfaces each provide state-specific diagnostics and retry/account actions.
- **Current code:** `src/app/screens.tsx` — `AccessCheckScreen`, `UnauthorizedShell`, `ManagerShell`; `src/components/UnauthorizedScreen.tsx`; `src/features/onboarding/EmployeeOnboardingViews.tsx` — `OnboardingStatusCard`; `src/features/onboarding/ManagerFirstRun.tsx`.
- **Automated evidence:** `src/app/screens.test.tsx`; `src/app/routing.test.ts`; `src/features/onboarding/EmployeeSetupGate.test.tsx`; `src/features/onboarding/ManagerFirstRun.test.tsx`.
- **Migration/rollout implication:** Support runbooks should map backend diagnostic codes to these recovery surfaces.
- **Residual/manual limitation:** Every non-ready state still needs keyboard and screen-reader walkthrough in packaged builds. **Owner: Accessibility QA owner.**

### UX-045 — Manager-plus-employee personal tasks depend on local state and name heuristics

The app first tries the role link, then falls back to matching the Google display name or a name derived from email (`src/domain/people.ts:127-149`). It then merges a column map from device-local employee preferences when available (`src/domain/people.ts:152-168`). A dual-role user can therefore have a valid team dashboard but broken or differently mapped personal-task writes on another device. Use immutable member linkage and the shared mapping.

**Resolution**

- **Status:** Resolved—automated.
- **Implemented fix:** Dual-role personal-task context is linked by immutable member ID and uses only backend-accepted preferences.
- **Current code:** `src/app/useAccessVerification.ts` — `resolveMemberTaskPrefs`; `src/app/useTaskMutations.ts` — manager personal-task handlers; `src/domain/onboarding.ts` — `acceptedMemberPrefs`; `src/domain/access.ts`.
- **Automated evidence:** `src/app/useTaskMutations.test.ts`; `src/domain/onboarding.test.ts`; `src/domain/access.test.ts`.
- **Migration/rollout implication:** Dual-role legacy users need one stable member linkage and accepted shared map before cutover.
- **Residual/manual limitation:** Manager-plus-member behavior on a second clean device remains unverified. **Owner: Release manager.**

### UX-046 — Authorization state is incorrectly coupled to the task dataset

After the initial admin probe, roles are held inside `dataset`. Manager load failures then set `dataset` to `null` (`src/App.tsx:325-345`). With `adminAccess = ok` and no dataset, `resolveViewerContext` interprets the absent role directory as an empty `Roles` tab and emits `firstManager` (`src/auth/roles.ts:107-116`). Keep verified identity/role state separate from task data and never infer bootstrap from a missing dataset.

**Resolution**

- **Status:** Resolved—automated.
- **Implemented fix:** Access membership state is held by `useAccessVerification` independently of dataset state; bootstrap requires a separate positive claim path and dataset failures cannot alter Access role.
- **Current code:** `src/app/useAccessVerification.ts`; `src/auth/roles.ts` — `resolveAuthoritativeViewerContext`; `src/app/useDatasetSync.ts`; `src/app/routing.ts`.
- **Automated evidence:** `src/auth/roles.authoritative.test.ts`; `src/app/useDatasetSync.test.ts`; `src/app/routing.test.ts`; `src/App.test.tsx`.
- **Migration/rollout implication:** Backend membership must be available before dashboard data loads are enabled in production.
- **Residual/manual limitation:** Runtime transport failure while manager data is empty remains an offline test. **Owner: Product QA owner.**

### UX-047 — Roster saves do not invalidate stale dashboard caches

Generic live-sync failures return the previous dataset cache with a `syncNote` (`src/services/googleSheets.ts:950-962`). Lab setup writes and `onSaved` do not invalidate that cache (`src/components/TeamSetupPanel.tsx:542-575`; `src/App.tsx:964-973`). Immediately after adding or removing a member, a failed refresh can therefore show an old roster while setup says the changes were saved. Version or invalidate caches after roster mutation and make stale state prominent during onboarding.

**Resolution**

- **Status:** Resolved—automated.
- **Implemented fix:** Every setup/config/deactivation mutation marks matching viewer caches stale with a reason, and workspace sync health renders stale state without discarding data.
- **Current code:** `src/services/cache.ts` — `DATASET_CACHE_VERSION`, `invalidateDatasetCaches`; `src/features/setup/TeamSetupPanel.tsx`; `src/features/onboarding/EmployeeSetupGate.tsx`; `src/components/ui/SyncStatus.tsx`.
- **Automated evidence:** `src/services/cache.test.ts`; `src/app/useDatasetSync.test.ts`; `src/features/manager/ManagerWorkspace.test.tsx`.
- **Migration/rollout implication:** Incremented cache versions invalidate pre-cutover datasets so old roster state is not silently reused.
- **Residual/manual limitation:** Stale-state presentation after an induced refresh failure needs packaged-app observation. **Owner: Product QA owner.**

### UX-048 — Manager changes to employee sheets have no attribution

Managers can write directly to employee task logs through create/update handlers (`src/App.tsx:770-856`). The optional `RunLog` is read during dataset load but no corresponding manager mutation is recorded (`src/services/googleSheets.ts:819-824`, `src/services/googleSheets.ts:935-945`). Confirm the destination workbook before writes and record actor, timestamp, task ID, and changed fields in an audit log.

**Resolution**

- **Status:** Resolved—automated.
- **Implemented fix:** Manager writes require immutable member/task identity and backend-accepted destination; successful changes append actor, destination, action, timestamp, Task ID, changed fields, and status to RunLog. Audit failure is surfaced without claiming rollback.
- **Current code:** `src/app/taskAudit.ts` — `buildManagerAuditEntry`, `changedTaskFields`, `createdTaskFields`; `src/app/useTaskMutations.ts` — `appendManagerAudit`, manager handlers; `src/services/sheets/admin/audit.ts` — `appendRunLogEntry`.
- **Automated evidence:** `src/app/taskAudit.test.ts`; `src/app/useTaskMutations.test.ts`.
- **Migration/rollout implication:** Ensure the canonical RunLog schema and permissions exist before manager mutations are enabled.
- **Residual/manual limitation:** Audit visibility, permissions, and task-write/audit partial-failure recovery need real-workbook verification. **Owner: Compliance/product owner.**

### UX-049 — Access-check loading falls through to manager dashboard chrome

While admin access is unknown/loading, the viewer role is `guest` (`src/auth/roles.ts:49-55`). `App` has explicit signed-out, unauthorized, and employee branches but no signed-in guest branch; it falls through to the manager/PI shell (`src/App.tsx:859-957`). Users can briefly see “Manager dashboard,” “No data loaded,” and setup controls before their role is known. Render a dedicated access-check screen and expose no privileged chrome until resolution.

**Resolution**

- **Status:** Resolved—automated.
- **Implemented fix:** Signed-in guests and vault-hydration state render dedicated non-privileged loading screens; manager routes require resolved backend role and ready onboarding.
- **Current code:** `src/app/routing.ts` — `selectAppRoute`; `src/app/screens.tsx` — `AccessCheckScreen`; `src/app/useSessionOrchestration.ts`; `src/app/AppRouter.tsx`.
- **Automated evidence:** `src/app/routing.test.ts`; `src/app/screens.test.tsx`; `src/App.test.tsx`; `src/app/useSessionOrchestration.test.tsx`.
- **Migration/rollout implication:** No data migration is required; backend access must resolve before privileged routes appear.
- **Residual/manual limitation:** Privileged-chrome flashes on packaged cold starts remain a manual visual check. **Owner: Security QA owner.**

### UX-050 — Gantt data is not available to screen-reader or keyboard users

The timeline is an SVG image with visual bars and `<title>` tooltips, but no equivalent schedule table or keyboard-reachable task representation (`src/features/gantt/GanttView.tsx:476-520`; `src/features/gantt/GanttChart.tsx`). Its wide scroll region is not focusable and has no keyboard pan controls (`src/features/gantt/GanttView.tsx:509-519`). Provide an accessible table/list containing owner, task, start, end, and status, plus a focusable scroll region or explicit timeline controls.

**Resolution**

- **Status:** Resolved—automated.
- **Implemented fix:** Gantt includes a captioned schedule table and a focusable, instructed timeline region with arrow/Shift/Home/End panning.
- **Current code:** `src/features/gantt/GanttView.tsx` — `handleTimelineKeyDown`, accessible schedule table; `src/features/gantt/GanttChart.tsx`.
- **Automated evidence:** `src/features/gantt/GanttView.accessibility.test.tsx`.
- **Migration/rollout implication:** No data migration is required; accessible representation is derived from current tasks.
- **Residual/manual limitation:** Large-table and pan announcements require VoiceOver/NVDA verification. **Owner: Accessibility QA owner.**

### UX-051 — The application lacks primary landmarks and skip navigation

Workspace content is built from generic `div` and `section` containers, with no application-level `<main>` or navigation landmark and no skip link (`src/App.tsx:859-1099`; `src/features/employee/EmployeeWorkspace.tsx:669-853`; `src/features/manager/ManagerWorkspace.tsx:925-1351`). Add stable landmarks and a **Skip to tasks** link so keyboard and screen-reader users can bypass repeated topbar actions.

**Resolution**

- **Status:** Resolved—automated.
- **Implemented fix:** Every top-level route has one main landmark and a route-appropriate skip link; workspaces expose stable task targets.
- **Current code:** `src/app/screens.tsx` — `SkipToTasks`, route shells; `src/features/onboarding/EmployeeOnboardingViews.tsx` — `OnboardingShell`; `src/features/onboarding/ManagerFirstRun.tsx`.
- **Automated evidence:** `src/features/onboarding/onboarding.acceptance.test.tsx` (AC12) checks one-main and skip-link semantics; `src/app/screens.test.tsx`.
- **Migration/rollout implication:** No data migration is required; landmarks ship with the client.
- **Residual/manual limitation:** Skip-link focus/scroll behavior at platform zoom levels remains manual. **Owner: Accessibility QA owner.**

### UX-052 — Setup and dashboard remain interactive at the same time

For managers, `TeamSetupPanel` renders above `ManagerWorkspace` instead of replacing it or opening as a modal/route (`src/App.tsx:964-998`). This permits roster changes beside a dashboard based on the previous dataset and creates two competing sets of top-level actions. Use a dedicated setup route or properly managed modal surface and refresh before returning to the dashboard.

**Resolution**

- **Status:** Resolved—automated.
- **Implemented fix:** Team setup opens inside the shared modal primitive with background isolation; close/save returns to and refreshes the manager workspace.
- **Current code:** `src/app/screens.tsx` — `ManagerShell`; `src/components/ui/Dialog.tsx`; `src/features/setup/TeamSetupPanel.tsx`.
- **Automated evidence:** `src/components/ui/accessibility.test.tsx`; `src/app/useDatasetSync.test.ts`.
- **Migration/rollout implication:** No data migration is required; setup routing changes with the client.
- **Residual/manual limitation:** Background inertness and refreshed data after close need packaged-build verification. **Owner: Accessibility QA owner.**

### UX-053 — Employee loading leaves stale mutation controls enabled

Employee loading is represented only by a banner, while existing cards and the create FAB remain interactive (`src/features/employee/EmployeeWorkspace.tsx:726-812`). A user can edit or create against stale/empty state during refresh. Add `aria-busy`, retain clearly marked stale content, and disable affected mutations until the current sheet version is known.

**Resolution**

- **Status:** Resolved—automated.
- **Implemented fix:** Member task content exposes `aria-busy`, stale sync state remains visible, and create/edit/complete/overdue controls are disabled during loading.
- **Current code:** `src/features/employee/EmployeeWorkspace.tsx`; `src/components/ui/SyncStatus.tsx`; `src/app/useDatasetSync.ts` — `loadEmployeeData`.
- **Automated evidence:** `src/features/employee/EmployeeWorkspace.accessibility.test.tsx` directly renders the Member workspace loading state and verifies `aria-busy` plus disabled create/edit/complete/refresh controls; `src/app/useDatasetSync.test.ts` separately covers preservation. Manager tests are not used as a substitute for this member behavior.
- **Migration/rollout implication:** No data migration is required; controls adopt the guarded state with the client.
- **Residual/manual limitation:** Keyboard/mouse mutation attempts during a deliberately slow real-Sheets refresh remain manual. **Owner: Product QA owner.**

### UX-054 — Profile selection state is hidden from assistive technology

The profile preview container is `aria-hidden="true"` even when it contains an image with alt text (`src/components/EmployeeSetupGate.tsx:1007-1012`). The hidden file input has no programmatic label relationship to its trigger (`src/components/EmployeeSetupGate.tsx:1016-1036`). Announce photo/initials state in a live text region and use a labeled file-input pattern.

**Resolution**

- **Status:** Resolved—automated.
- **Implemented fix:** Profile preview has an accessible image label, the file input is explicitly labeled, and current photo/initials state is announced in a polite live region.
- **Current code:** `src/features/onboarding/ProfileStep.tsx` — `ProfileStep`.
- **Automated evidence:** `src/features/onboarding/EmployeeSetupGate.test.tsx`.
- **Migration/rollout implication:** No data migration is required; existing profile state receives accessible rendering.
- **Residual/manual limitation:** File chooser and state announcements need VoiceOver/NVDA verification. **Owner: Accessibility QA owner.**

### UX-055 — Google reconnect unnecessarily repeats consent

OAuth sets `prompt=consent` for every sign-in (`src/auth/googleIdentity.ts:62-74`), adding repeated browser friction even when the user already granted scopes. Request explicit consent only when a refresh token or additional scope is actually needed.

**Resolution**

- **Status:** Resolved—automated.
- **Implemented fix:** OAuth omits consent normally and retries with forced consent only when Google returns no refresh token or the caller explicitly requests it; scopes are limited to identity and `drive.file`.
- **Current code:** `src/auth/googleIdentity.ts` — `buildGoogleAuthUrl`, `signInWithGoogle`; `src/services/sheets/client.ts` — `GOOGLE_WORKSPACE_SCOPES`.
- **Automated evidence:** `src/auth/googleIdentity.test.ts`.
- **Migration/rollout implication:** Existing refresh tokens can continue in the vault; users without one may receive a one-time forced-consent retry.
- **Residual/manual limitation:** Returning-account consent behavior and OAuth policy require real Google accounts. **Owner: Google identity release owner.**

### UX-056 — Long-lived OAuth tokens are stored in WebView local storage

The complete session, including refresh token, is serialized to `localStorage` (`src/services/cache.ts:70-76`; `src/domain/app.ts:34-40`). On shared machines this persists beyond app close and is available to any script executing in the WebView origin. Store secrets in the operating system credential vault and make **Sign out** revoke/erase them explicitly.

**Resolution**

- **Status:** Resolved—static/manual pending.
- **Implemented fix:** Local storage contains identity metadata only; legacy tokens are scrubbed before vault I/O, refresh tokens use the OS vault, access/ID tokens stay in memory, startup awaits hydration, and sign-out attempts revocation while always clearing local/vault state.
- **Current code:** `src/services/cache.ts` — `readStoredSessionWithSecrets`, `migrateLegacySessionSecrets`, `writeStoredSessionSecurely`, `clearStoredSessionSecurely`; `src/app/useSessionOrchestration.ts`; `src/platform/tauri/secrets.ts`; `src-tauri/src/commands/secrets.rs`; `src/auth/googleIdentity.ts` — `revokeGoogleSession`.
- **Automated evidence:** `src/services/cache.test.ts`; `src/app/useSessionOrchestration.test.tsx`; `src/platform/tauri/secrets.test.ts`; `src/auth/googleIdentity.test.ts`; two normal Rust unit tests pass. The ignored real-vault Rust unit uses the same primitive and was exercised separately through the Tauri binary: a disposable macOS Keychain credential was stored, loaded, matched, and deleted successfully.
- **Migration/rollout implication:** On first upgraded startup, legacy local-storage refresh tokens are scrubbed and moved to the OS vault before privileged routing; rollout needs recovery guidance for denied/locked vaults.
- **Residual/manual limitation:** The one disposable macOS primitive is not signed-package/session-hydration acceptance; signed macOS flows, denial/restart/offline sign-out, and all Windows Credential Manager behavior remain open. **Owner: Security release owner.**

## Completed implementation phases

### Phase 1 — Authority, routing, and data safety completed

1. Firestore membership/invitation records replaced Sheet readability as the authorization source.
2. Bootstrap became a fail-closed, exact-empty-`Roles`, short-lived claim flow.
3. Member-isolated loading, scoped stale-cache retention, typed errors, and stable Task IDs removed the high-blast-radius routing and mutation failures.
4. Task writes now reverify immutable identity plus expected Task Revision and update only mapped cells while incrementing the revision in the same batch.
5. The remaining Google Sheets race is explicit: no API precondition prevents a second writer from changing a row after the verification read and before the batch write.

### Phase 2 — Authoritative onboarding completed

1. The ordered lifecycle, ownership, reasons, next actions, blocked/resume state, idempotency keys, and revisions were implemented in the backend.
2. Team setup creates/updates invitations and member configs with explicit workbook, tab, roles, and proposed mapping.
3. Clean-device members discover invitations, record exact Picker proof, and accept shared column mappings.
4. Managers/PIs receive a retained exact-file first-run checklist.
5. Drive sharing is an explicit delegated operation separate from Picker authorization.

### Phase 3 — Concurrent setup and compatibility safety completed

1. Firestore mutations use transactions and expected revisions.
2. Per-member compatibility writes preflight IDs/revisions and batch only the affected `SheetRegistry`/`Roles` ranges.
3. Mirror failures and conflicts are visible and retryable; setup deactivation is scoped and undoable.
4. The remaining cross-service window is documented: Firestore is authoritative and may temporarily lead Google Sheets.
5. Manager dashboards retain healthy data and expose inline per-member exact-file grant, retry, and revision-fetched deactivation recovery.

### Phase 4 — Modular UI and accessibility completed

1. Access, routing, sessions, synchronization, task mutations/auditing, setup, onboarding, task forms, and Sheets services were split into focused modules.
2. Shared dialog, field/error, status, sync, segmented-control, and tab primitives provide keyboard and screen-reader semantics.
3. Gantt has a schedule-table alternative and keyboard panning; routes have landmarks and skip links.
4. Hit-area, floating-action inset, scoped rendered-JSX terminology enforcement, refresh health, portable-font, and Tauri-only distribution contracts were implemented.
5. Full assistive-technology and signed cross-platform acceptance remains a release activity, not an implementation claim.

### Phase 5 — Closeout evidence completed

1. The 56 findings are numerically ordered and machine-checked for unique IDs, required Resolution fields, category accounting, implementation-module references, and acceptance links.
2. Local frontend, backend, Firestore emulator, Rust, pilot-inventory, release-verifier, and diff checks are recorded below as local evidence only.
3. One disposable real macOS Keychain store/load/delete primitive passed through the Tauri binary; this is deliberately narrower than signed-package session acceptance.
4. External release gates remain open and retain named owners in each finding and in the backlog.

## Acceptance criteria for the reported onboarding problem

The dedicated suite is `src/features/onboarding/onboarding.acceptance.test.tsx`; each criterion below has one named test there, with narrower focused tests cited only where they exercise additional behavior.

1. **AC01 — Automated passed:** A manager must explicitly select the intended workbook and Active task tab before saving a new member. Dedicated acceptance test plus `src/components/TeamSetupPanel.test.tsx`.
2. **AC02 — Automated passed:** A new record is **Invited** and follows the exact ordered lifecycle; persistence alone is not treated as **Ready**. Dedicated acceptance test plus `backend/test/lifecycle.test.ts`.
3. **AC03 — Automated passed:** A clean-device account is identified from its backend invitation. Dedicated acceptance test plus `backend/test/app.test.ts` and `src/auth/roles.authoritative.test.ts`.
4. **AC04 — Automated passed:** Authoritative workbook data is prefilled without silently selecting a replacement first tab or first assignee. Dedicated acceptance test plus `src/features/onboarding/columnMapping.test.ts` and `src/features/tasks/taskFormFields.test.ts`.
5. **AC05 — Automated boundary passed; real Picker manual pending:** The dedicated test genuinely rejects a wrong exact Picker file and keeps column review/workspace routing gated. A real per-account Picker grant and real workbook are still unexecuted.
6. **AC06 — Automated passed:** No backend membership/invitation means unauthorized; Sheet readability cannot create access. Dedicated acceptance test plus role/routing tests.
7. **AC07 — Automated passed:** An incomplete member does not hide accessible manager data. Dedicated acceptance test plus `src/services/sheets/safety.test.ts`.
8. **AC08 — Automated passed:** A manager receives an exact Admin/task-log first-run checklist. Dedicated acceptance test plus `src/features/onboarding/ManagerFirstRun.test.tsx`.
9. **AC09 — Automated passed:** Remaining file/stale-tab issues are explicit while partial data stays usable. Dedicated acceptance test plus manager dataset tests.
10. **AC10 — Automated passed:** Task creation starts without an implicit assignee and names the selected destination. Dedicated acceptance test plus task-form tests.
11. **AC11 — Automated passed within stated scope:** The dedicated test proves member and manager preference consumers converge on the same accepted authoritative config. `src/features/onboarding/EmployeeSetupGate.test.tsx` separately proves a ready member's workbook/tab change calls `updateConfig` with the expected config revision; it does not claim a live backend or cross-device run.
12. **AC12 — Automated semantics passed; assistive-technology package acceptance manual pending:** The dedicated test exercises one-main, skip-link, and arrow-key tab semantics. VoiceOver/NVDA completion on signed packages remains unexecuted.

## Final local verification evidence

The closeout baseline below was recorded on 2026-07-15. On 2026-07-29, documentation revalidation reran the audit-structure and terminology checks, frontend typecheck/tests, backend normal tests, Markdown-link validation, and diff whitespace checks. The current frontend suite is 42 files/192 tests; the backend normal suite remains 31 passed with the emulator integration intentionally skipped.

- **Audit structure:** `npm run check:audit-structure` passed: 56 unique numeric finding IDs, one complete Resolution per finding, exact 49/5/2 status accounting, implementation-module references, and AC01–AC12 links.
- **Frontend tests:** the 2026-07-15 baseline was 40 files/186 tests; the 2026-07-29 revalidation passed 42 files/192 tests.
- **Frontend static/build:** `npm run typecheck` and `npm run frontend:build` passed, including font, scoped terminology, and token-hygiene checks.
- **Backend normal tests:** `npm --prefix backend test` — 31 tests passed and the single emulator integration test was skipped by the normal command, as designed.
- **Firestore emulator integration:** `npm run test:firestore-emulator` — 1/1 passed locally with JDK 21.
- **Backend static/build:** `npm --prefix backend run typecheck` and `npm --prefix backend run build` passed.
- **Rust:** `cargo fmt --manifest-path src-tauri/Cargo.toml --check`, `cargo check --manifest-path src-tauri/Cargo.toml`, and normal `cargo test --manifest-path src-tauri/Cargo.toml` passed; 2 tests passed. The ignored real-vault unit is opt-in and was separately exercised through the binary.
- **Real macOS vault primitive:** the Tauri binary created one uniquely labeled disposable Keychain credential, loaded and matched it, then deleted it; the verifier reported `roundTripVerified: true` and `credentialDeleted: true`.
- **Release verifier:** default `npm run verify:release` passed. A requested verifier run including the emulator completed checks through the emulator and then stopped at a vault executable path mismatch; after correcting that invocation, the vault binary was run directly and passed. This is not represented as one fully successful combined optional run.
- **Pilot inventory:** the non-mutating sample dry-run passed with `schemaVersion: pilot-migration-inventory/v1` and `mutationMode: none`; no real pilot migration occurred.
- **Package artifact:** `release/Lab Workflow Desktop_0.1.0_aarch64.dmg` is present with SHA-256 `942b6b687b9d7691bbbe2fdfd318e0f991a1dafe0f4873509a062edf193dab0f`. It is unsigned, and no notarization evidence exists.
- **Diff hygiene:** `git diff --check` and staged diff whitespace checks passed.

This closeout therefore distinguishes: code implemented; automated/local verification passed; one real macOS vault primitive passed; and release-real-account/platform acceptance pending. It does not claim Cloud Run deployment, authenticated live smoke, live Drive/Picker/Google role-matrix execution, a real pilot migration, Windows vault behavior, signed/notarized artifacts, VoiceOver/NVDA completion, or signed-platform acceptance.

## Release-validation backlog

1. **Backend deployment and smoke — Owner: Backend release owner.** Provision/review the intended GCP project, IAM, service account, Firestore indexes, OAuth audiences, CORS origins, and Cloud Run configuration; deploy only with approval and run authenticated live smoke. The local emulator is complete, but no deployment or live smoke is claimed.
2. **Real-account role matrix — Owner: Release manager.** Exercise manager, member, PI, unauthorized external, and manager-plus-member accounts, including invitation expiry/revocation and clean-device discovery.
3. **Drive and Picker matrix — Owner: Google Workspace release owner.** Test unshared, shared-but-not-Picker-authorized, Picker-authorized, view-only, revoked, shared-drive, ownership, external-domain, notification, and Workspace-policy states independently for every manager/PI account.
4. **Cross-service recovery — Owner: Backend/Sheets integration owner.** Induce a successful Firestore mutation followed by a Sheets mirror failure; confirm visible retry, revision-conflict handling, and reconciliation without treating Sheets as authority.
5. **Concurrency and identity — Owner: Sheets data-integrity owner.** Run simultaneous manager updates; specifically probe the unavoidable final Task Revision read-to-batch race; externally sort/insert/delete task rows; and test duplicate, missing, and corrupted Task IDs/Revisions and duplicate member names.
6. **Workbook compatibility — Owner: Pilot migration owner.** Cover multiple tabs, `Profile` first/last, instructions/templates/archives, custom columns, formulas, protected ranges, renamed/deleted tabs, ambiguous dates, and optional-column absence.
7. **Real pilot migration — Owner: Pilot migration owner.** Execute the approved runbook with backups, stable-ID mapping, reconciliation evidence, and rollback ownership. The sample inventory dry-run is not a real migration.
8. **Session security — Owner: Security release owner.** In signed packages, verify macOS vault hydration/migration/restart/refresh, denied/locked vault, online/offline sign-out, Google revocation, and deletion; repeat the full matrix on Windows Credential Manager.
9. **Accessibility and responsive UI — Owner: Accessibility QA owner.** Complete keyboard-only, VoiceOver, and NVDA flows for invitation, setup, task creation/editing, Gantt, dialogs, errors, and recovery; check reduced motion, zoom/scaling, and 320–720 px widths.
10. **Distribution — Owner: Release engineering owner.** Produce and verify signed/notarized macOS and signed Windows artifacts on target systems. The current DMG is unsigned and has no notarization evidence; hosted-web execution is out of scope.
