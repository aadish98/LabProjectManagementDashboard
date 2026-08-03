# Pilot Migration Runbook

Status: procedure only. It does not record a completed lab migration, production Firestore write, Drive permission change, or GCP deployment.

## Preconditions

- Name an operator, approver, rollback owner, and one small pilot lab.
- Freeze manual edits to `SheetRegistry`, `Roles`, task headers, and task ID columns for the pilot window.
- Export read-only backups of the canonical workbook and every pilot task log.
- Complete [TESTING.md](TESTING.md), including backend `deploy:check`.
- Verify the approved OAuth desktop client, Cloud Run URL/revision, Firestore database, CORS origins, and signed Tauri build.
- Use disposable/emulator resources until the explicit production change approval.

## Dry-run inventory

Do not write to Firestore, Sheets, or Drive during this phase.

Use a redacted/exported JSON fixture, never live API credentials or an OAuth token. `scripts/pilot-migration.sample.json` is the version-1 example. Each person can provide a redacted legacy key/name/email, roles and active flag; proposed member/invitation IDs; task-log spreadsheet ID, active/available tabs, headers, column map, and task ID/source metadata; and sharing, Picker, map-acceptance, or blocked-state facts. Task contents are neither required nor read by the inventory logic.

```sh
npm run pilot:inventory -- scripts/pilot-migration.sample.json --pretty
npm run pilot:inventory -- /path/to/redacted-export.json \
  --output /path/to/pilot-inventory-evidence.json --pretty
```

The command reads one local file and optionally writes one evidence file. It has no Sheets, Drive, Firestore, or network client. Output is `pilot-migration-inventory/v1` JSON with `mutationMode: "none"` and reports duplicate normalized emails/people/task-log IDs, missing stable/file IDs, missing or stale tabs, absent or incompatible maps, blank/duplicate/externally generated Task IDs, exact role-derived spreadsheet sets, and a proposed lifecycle/next action for each person. A finding-free result is still only `readyForOperatorReview`; it is not approval to migrate.

1. Enumerate each legacy person, normalized email, intended roles, active status, task-log URL/ID, active tab, and current column mapping.
2. Detect duplicate normalized emails, duplicate people, missing/duplicate task-log IDs, stale tabs, malformed URLs, and ambiguous role rows.
3. Scan task logs for a Task ID column. Record blank, duplicate, and externally generated IDs; do not backfill yet.
4. Produce a proposed stable ID map for lab, members, invitations, and task logs. IDs must never depend on row position or display name.
5. Produce a proposed shared column map per member and compare it with actual headers. Flag additions or renames for member review.
6. Calculate the exact Drive resource set for each role:
   - employee: configured task log;
   - manager/PI: configured required task logs only.
7. Confirm every proposed Picker target exactly matches the authoritative spreadsheet ID.
8. Classify each person into the onboarding lifecycle and record the next actor/action.

Dry-run acceptance requires zero unexplained duplicate identities, a verified workbook/tab for every pilot member, an approved shared map, restorable backups, and an explicit list of manual blockers.

## Pilot execution

Perform each mutating step only after approval and record IDs/revisions returned by the backend.

1. Preview the operator roster import, review the proposed lab/member/config writes, then rerun it with `--apply`.
2. Record the Firestore lab/member IDs created by the import.
3. Create any later invitation with an idempotency key, exact task-log ID/tab, roles, and proposed map.
4. Have the invited account accept the invitation.
5. Provision exact Drive files from the manager/PI account. Confirm results match the Firestore-derived resource list.
6. Have the member select the exact workbook through Picker.
7. Review and accept the shared column map.
8. Backfill stable compatibility member IDs/revisions and Task IDs only through tested targeted operations.
9. Load the manager dashboard and verify successful members, explicit partial-load issues, stale-cache labels, and profile fallbacks.
10. Exercise one create and one update on a disposable pilot task; verify Task ID re-check and changed-cell-only behavior.

Stop on a revision conflict, unexpected file ID, duplicate Task ID, broad Sheet rewrite, unmarked stale data, or authority disagreement. Do not hand-edit Firestore to skip lifecycle states.

## Verification evidence

Capture without tokens or spreadsheet contents:

- the unmodified redacted fixture hash/location and versioned inventory JSON;
- approved lab/member/invitation IDs and revisions;
- onboarding transitions and event IDs;
- exact workbook IDs/tabs and accepted map hashes or field names;
- Drive permission result file IDs;
- Picker proof timestamp/account;
- partial-load issue codes and stale-cache markers;
- targeted write/audit result and before/after revision;
- test/build command results and signed installer identity.

## Rollback

- Stop new invitations and writes.
- Revoke pending invitations or deactivate only the affected pilot members using current revisions.
- Revoke newly created Drive permissions through an approved Google Drive administrator procedure.
- Restore Sheets from the pre-pilot backups only if a verified Sheet mutation was incorrect.
- Preserve onboarding events and incident evidence; do not rewrite audit history.
- Firestore hard deletion is not a self-service application feature. If legally or operationally required, use an approved administrator procedure and verify all collections/indexed records affected.

Sheets never becomes authoritative for membership. The application writes no roster data to Google Sheets; if the Admin workbook and Firestore disagree, correct the workbook and re-run `roster:import`, or fix the member through Team setup.

## Exit criteria

Expand beyond the pilot only when:

- all pilot members reach the intended state;
- no role was inferred from file access;
- shared maps work on a second device;
- offline sign-out and vault-failure checks pass;
- partial loads preserve healthy members and label cached data;
- targeted writes show no unrelated row/cell changes;
- rollback ownership and deletion handling are accepted.
