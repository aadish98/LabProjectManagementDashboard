import { randomUUID } from "node:crypto";
import {
  Firestore,
  type DocumentData,
  type DocumentReference,
  type DocumentSnapshot
} from "@google-cloud/firestore";
import { GoogleAuth } from "google-auth-library";
import type {
  Lab,
  Member,
  MemberConfig,
  OnboardingEvent,
  OnboardingState
} from "../src/domain/types.js";
import {
  AdminRosterValidationError,
  deterministicUuid,
  parseAdminRoster,
  type RosterMember
} from "../src/ops/adminRoster.js";

const SHEETS_READONLY_SCOPE =
  "https://www.googleapis.com/auth/spreadsheets.readonly";
const CLOUD_PLATFORM_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const MAX_ATOMIC_WRITES = 480;

interface Options {
  projectId: string;
  databaseId: string;
  spreadsheetId: string;
  labId: string;
  labName?: string;
  actorEmail: string;
  apply: boolean;
}

interface PlannedWrite {
  reference: DocumentReference<DocumentData>;
  data: DocumentData;
  expectedVersion: string | null;
}

interface MemberPlan {
  email: string;
  memberId: string;
  roles: Member["roles"];
  memberAction: "create" | "update" | "unchanged";
  configAction: "create" | "update" | "unchanged" | "not-required";
}

interface ImportPlan {
  labAction: "create" | "unchanged";
  lab: Lab;
  memberPlans: MemberPlan[];
  writes: PlannedWrite[];
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const auth = new GoogleAuth({
    scopes: [SHEETS_READONLY_SCOPE, CLOUD_PLATFORM_SCOPE]
  });
  const accessToken = await auth.getAccessToken();
  if (!accessToken) {
    throw new Error(
      "Google credentials did not return an access token. Run the Application Default Credentials login shown in --help."
    );
  }

  const { rolesRows, registryRows } = await readAdminWorkbook(
    options.spreadsheetId,
    accessToken
  );
  const roster = parseAdminRoster(rolesRows, registryRows, options.labId);
  const db = new Firestore({
    projectId: options.projectId,
    databaseId: options.databaseId,
    ignoreUndefinedProperties: true
  });
  const plan = await buildPlan(db, options, roster);

  printPlan(options, plan);
  if (!options.apply) {
    process.stdout.write(
      "\nPreview only. Re-run the same command with --apply to commit these Firestore documents.\n"
    );
    return;
  }

  if (plan.writes.length === 0) {
    process.stdout.write("\nFirestore is already synchronized; no writes were needed.\n");
    return;
  }
  if (plan.writes.length > MAX_ATOMIC_WRITES) {
    throw new Error(
      `The import needs ${plan.writes.length} writes, above the ${MAX_ATOMIC_WRITES}-write safety limit. Split the roster before applying.`
    );
  }

  await applyPlan(db, plan);
  process.stdout.write(
    `\nApplied ${plan.writes.length} Firestore document write${plan.writes.length === 1 ? "" : "s"} atomically.\n`
  );
}

async function readAdminWorkbook(
  spreadsheetId: string,
  accessToken: string
): Promise<{ rolesRows: string[][]; registryRows: string[][] }> {
  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchGet`
  );
  url.searchParams.append("ranges", "'Roles'!A:Z");
  url.searchParams.append("ranges", "'SheetRegistry'!A:Z");
  url.searchParams.set("majorDimension", "ROWS");
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(30_000)
  });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: { message?: string };
    valueRanges?: Array<{ values?: unknown[][] }>;
  };
  if (!response.ok) {
    throw new Error(
      `Google Sheets returned HTTP ${response.status}: ${payload.error?.message ?? "unknown error"}`
    );
  }
  const ranges = payload.valueRanges ?? [];
  return {
    rolesRows: stringRows(ranges[0]?.values),
    registryRows: stringRows(ranges[1]?.values)
  };
}

async function buildPlan(
  db: Firestore,
  options: Options,
  roster: RosterMember[]
): Promise<ImportPlan> {
  const labRef = db.collection("labs").doc(options.labId);
  const [labSnapshot, membersSnapshot] = await Promise.all([
    labRef.get(),
    labRef.collection("members").get()
  ]);
  const existingLab = labSnapshot.exists ? (labSnapshot.data() as Lab) : null;
  if (!existingLab && !options.labName) {
    throw new Error(
      `Lab ${options.labId} does not exist. Supply --lab-name for the first import.`
    );
  }
  if (
    existingLab &&
    existingLab.adminSpreadsheetId.trim() !== options.spreadsheetId.trim()
  ) {
    throw new Error(
      `Lab ${options.labId} belongs to a different Admin workbook. No documents were changed.`
    );
  }

  const existingMembers = membersSnapshot.docs.map((doc) => doc.data() as Member);
  const memberById = new Map(existingMembers.map((member) => [member.id, member]));
  const memberByEmail = new Map<string, Member>();
  for (const member of existingMembers) {
    const prior = memberByEmail.get(member.normalizedEmail);
    if (prior && prior.id !== member.id) {
      throw new Error(
        `Firestore already has duplicate members for ${member.normalizedEmail}; resolve that conflict before importing.`
      );
    }
    memberByEmail.set(member.normalizedEmail, member);
  }

  const now = new Date().toISOString();
  const lab: Lab =
    existingLab ?? {
      id: options.labId,
      name: options.labName?.trim() ?? "",
      adminSpreadsheetId: options.spreadsheetId,
      revision: 1,
      createdAt: now,
      createdBy: options.actorEmail,
      updatedAt: now
    };
  const writes: PlannedWrite[] = [];
  if (!existingLab) {
    writes.push(writeFor(labRef, lab, labSnapshot));
  }

  const resolvedIds = new Map<string, string>();
  const memberPlans: MemberPlan[] = [];
  for (const source of roster) {
    const byEmail = memberByEmail.get(source.email);
    const byId = memberById.get(source.memberId);
    if (byEmail && byId && byEmail.id !== byId.id) {
      throw new Error(
        `Roster identity conflict for ${source.email}: its email and Member ID point to different Firestore documents.`
      );
    }
    if (byId && byId.normalizedEmail !== source.email && !byEmail) {
      throw new Error(
        `Roster Member ID ${source.memberId} already belongs to ${byId.normalizedEmail}, not ${source.email}.`
      );
    }

    const existing = byEmail ?? byId;
    const memberId = existing?.id ?? source.memberId;
    const priorEmail = resolvedIds.get(memberId);
    if (priorEmail && priorEmail !== source.email) {
      throw new Error(
        `Roster members ${priorEmail} and ${source.email} resolve to the same Firestore Member ID.`
      );
    }
    resolvedIds.set(memberId, source.email);

    const memberRef = labRef.collection("members").doc(memberId);
    const memberSnapshot =
      existing && membersSnapshot.docs.find((doc) => doc.id === existing.id);
    const configRef = labRef.collection("configs").doc(memberId);
    const configSnapshot = await configRef.get();
    const existingConfig = configSnapshot.exists
      ? (configSnapshot.data() as MemberConfig)
      : null;
    const configChanged = source.config
      ? !existingConfig ||
        existingConfig.spreadsheetId !== source.config.spreadsheetId ||
        existingConfig.taskLogUrl !== source.config.taskLogUrl ||
        existingConfig.activeSheetName !== source.config.activeSheetName
      : false;
    const identityChanged =
      !existing ||
      existing.email !== source.email ||
      existing.normalizedEmail !== source.email ||
      existing.displayName !== source.displayName ||
      !sameRoles(existing.roles, source.roles) ||
      !existing.active;
    const resetOnboarding = !existing || configChanged || identityChanged;
    const onboarding = resetOnboarding
      ? importedOnboarding(source, now)
      : existing.onboarding;
    const memberChanged =
      !existing ||
      identityChanged ||
      !sameOnboarding(existing.onboarding, onboarding);

    const member: Member = existing
      ? {
          ...existing,
          email: source.email,
          normalizedEmail: source.email,
          displayName: source.displayName,
          roles: [...source.roles],
          active: true,
          onboarding,
          revision: memberChanged ? existing.revision + 1 : existing.revision,
          updatedAt: memberChanged ? now : existing.updatedAt
        }
      : {
          id: memberId,
          labId: options.labId,
          email: source.email,
          normalizedEmail: source.email,
          displayName: source.displayName,
          roles: [...source.roles],
          active: true,
          revision: 1,
          onboarding,
          createdAt: now,
          createdBy: options.actorEmail,
          updatedAt: now
        };
    if (memberChanged) {
      writes.push(writeFor(memberRef, member, memberSnapshot));
    }

    let configAction: MemberPlan["configAction"] = "not-required";
    if (source.config) {
      configAction = existingConfig
        ? configChanged
          ? "update"
          : "unchanged"
        : "create";
      if (configChanged) {
        const sameWorkbook =
          existingConfig?.spreadsheetId === source.config.spreadsheetId &&
          existingConfig.activeSheetName === source.config.activeSheetName;
        const config: MemberConfig = {
          ...(sameWorkbook && existingConfig ? existingConfig : {}),
          memberId,
          labId: options.labId,
          spreadsheetId: source.config.spreadsheetId,
          taskLogUrl: source.config.taskLogUrl,
          activeSheetName: source.config.activeSheetName,
          proposedColumnMap:
            sameWorkbook && existingConfig ? existingConfig.proposedColumnMap : {},
          revision: existingConfig ? existingConfig.revision + 1 : 1,
          updatedAt: now,
          updatedBy: options.actorEmail
        };
        writes.push(writeFor(configRef, config, configSnapshot));
      }
    }

    if (memberChanged || configChanged) {
      const eventId = randomUUID();
      const event: OnboardingEvent = {
        id: eventId,
        labId: options.labId,
        memberId,
        actorSubject: "admin-roster-import",
        actorEmail: options.actorEmail,
        type: existing ? "adminRoster.memberUpdated" : "adminRoster.memberCreated",
        ...(existing ? { fromStatus: existing.onboarding.status } : {}),
        toStatus: onboarding.status,
        revision: member.revision,
        occurredAt: now,
        metadata: {
          source: "Admin workbook",
          configImported: Boolean(source.config)
        }
      };
      const eventRef = labRef.collection("events").doc(eventId);
      writes.push({ reference: eventRef, data: event, expectedVersion: null });
    }

    memberPlans.push({
      email: source.email,
      memberId,
      roles: source.roles,
      memberAction: existing ? (memberChanged ? "update" : "unchanged") : "create",
      configAction
    });
  }

  return {
    labAction: existingLab ? "unchanged" : "create",
    lab,
    memberPlans,
    writes
  };
}

async function applyPlan(db: Firestore, plan: ImportPlan): Promise<void> {
  await db.runTransaction(async (transaction) => {
    const snapshots = await transaction.getAll(
      ...plan.writes.map((write) => write.reference)
    );
    snapshots.forEach((snapshot, index) => {
      const planned = plan.writes[index];
      if (!planned) throw new Error("Import plan and Firestore preflight are out of sync.");
      const actualVersion = snapshotVersion(snapshot);
      if (actualVersion !== planned.expectedVersion) {
        throw new Error(
          `Firestore document ${planned.reference.path} changed after the preview was built. Nothing was written; rerun the import.`
        );
      }
    });
    for (const write of plan.writes) {
      transaction.set(write.reference, write.data);
    }
  });
}

function importedOnboarding(source: RosterMember, now: string): OnboardingState {
  if (source.roles.includes("manager") || source.roles.includes("pi")) {
    return {
      status: "needsPicker",
      owner: "member",
      reason: "Admin roster access is active; exact-file Picker proof is still required.",
      nextAction: "Select the exact Admin and required Task-log workbooks.",
      updatedAt: now
    };
  }
  return {
    status: "needsSharing",
    owner: "manager",
    reason: "Admin roster access is active; required Drive sharing is not confirmed.",
    nextAction: "A manager or PI must grant the required Google Drive permissions.",
    updatedAt: now
  };
}

function writeFor(
  reference: DocumentReference<DocumentData>,
  data: DocumentData,
  snapshot: DocumentSnapshot<DocumentData> | undefined
): PlannedWrite {
  return {
    reference,
    data,
    expectedVersion: snapshotVersion(snapshot)
  };
}

function snapshotVersion(
  snapshot: DocumentSnapshot<DocumentData> | undefined
): string | null {
  if (!snapshot?.exists) return null;
  return snapshot.updateTime?.toDate().toISOString() ?? "exists";
}

function sameRoles(left: Member["roles"], right: Member["roles"]): boolean {
  return [...left].sort().join(",") === [...right].sort().join(",");
}

function sameOnboarding(left: OnboardingState, right: OnboardingState): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function stringRows(values: unknown[][] | undefined): string[][] {
  return (values ?? []).map((row) => row.map((value) => String(value ?? "")));
}

function printPlan(options: Options, plan: ImportPlan): void {
  const summary = {
    mode: options.apply ? "apply" : "preview",
    projectId: options.projectId,
    databaseId: options.databaseId,
    source: "configured Admin workbook",
    lab: {
      id: plan.lab.id,
      name: plan.lab.name,
      action: plan.labAction
    },
    members: plan.memberPlans,
    writeCount: plan.writes.length,
    missingRosterPolicy: "preserve existing Firestore members"
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

function parseOptions(args: string[]): Options {
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--apply") continue;
    if (!arg?.startsWith("--")) throw new Error(`Unknown argument: ${arg ?? ""}`);
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${arg}.`);
    }
    values.set(arg, value);
    index += 1;
  }

  const projectId =
    values.get("--project") ?? process.env.GOOGLE_CLOUD_PROJECT?.trim() ?? "";
  const databaseId =
    values.get("--database") ??
    process.env.FIRESTORE_DATABASE_ID?.trim() ??
    "(default)";
  const spreadsheetId =
    values.get("--spreadsheet-id") ??
    process.env.ADMIN_SPREADSHEET_ID?.trim() ??
    "";
  const labName = values.get("--lab-name")?.trim();
  const actorEmail =
    values.get("--actor-email") ??
    process.env.ROSTER_ACTOR_EMAIL?.trim().toLowerCase() ??
    "";
  if (!projectId) throw new Error("--project or GOOGLE_CLOUD_PROJECT is required.");
  if (!spreadsheetId) {
    throw new Error("--spreadsheet-id or ADMIN_SPREADSHEET_ID is required.");
  }
  if (!actorEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(actorEmail)) {
    throw new Error("--actor-email or ROSTER_ACTOR_EMAIL must be a valid email.");
  }
  const labId =
    values.get("--lab-id") ??
    deterministicUuid(`${projectId}:lab:${spreadsheetId}`);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      labId
    )
  ) {
    throw new Error("--lab-id must be a UUID.");
  }
  return {
    projectId,
    databaseId,
    spreadsheetId,
    labId: labId.toLowerCase(),
    ...(labName ? { labName } : {}),
    actorEmail: actorEmail.toLowerCase(),
    apply: args.includes("--apply")
  };
}

function printHelp(): void {
  process.stdout.write(`Import the Admin workbook roster into authoritative Firestore documents.

The command reads Roles and SheetRegistry. It is preview-only unless --apply is present.
Existing Firestore members not listed in the sheet are preserved.

First authenticate the admin/operator account:
  gcloud auth application-default login \\
    --scopes=https://www.googleapis.com/auth/cloud-platform,https://www.googleapis.com/auth/spreadsheets.readonly

Preview:
  npm run roster:import -- \\
    --project PROJECT_ID \\
    --spreadsheet-id ADMIN_SPREADSHEET_ID \\
    --lab-name "Lab name" \\
    --actor-email admin@example.com

Apply:
  Add --apply to the exact reviewed preview command.

Options:
  --project ID           Google Cloud project (or GOOGLE_CLOUD_PROJECT)
  --database ID          Firestore database; defaults to (default)
  --spreadsheet-id ID    Admin workbook ID (or ADMIN_SPREADSHEET_ID)
  --lab-id UUID          Optional; deterministically derived from project + sheet
  --lab-name NAME        Required only when creating the lab
  --actor-email EMAIL    Audit identity (or ROSTER_ACTOR_EMAIL)
  --apply                Commit the displayed plan atomically
`);
}

main().catch((error: unknown) => {
  const message =
    error instanceof AdminRosterValidationError || error instanceof Error
      ? error.message
      : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
