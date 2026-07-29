import type { AppConfig, UserSession } from "../../../domain/app";
import { ADMIN_TAB_NAMES } from "../../../domain/app";
import { GoogleSheetsAuthError } from "../errors";
import { extractIdFromUrl } from "../helpers";
import {
  prepareMemberRoleSync,
  prepareRegistryUpsert,
  writeAdminValueRanges
} from "./concurrency";
import { ensureCanonicalHeaders, resolveAdminTab } from "./tabs";
import {
  ADMIN_REGISTRY_HEADERS,
  ADMIN_ROLES_HEADERS,
  type MemberCompatibilityMirrorUpdate,
  type MemberRoleMirrorUpdate,
  type RegistryWriteRow,
  type RoleWriteRow
} from "./types";

export async function writeRegistryRows(
  config: AppConfig,
  session: UserSession,
  rows: RegistryWriteRow[]
): Promise<void> {
  for (const row of rows) await upsertRegistryRow(config, session, row);
}

export async function upsertRegistryRow(
  config: AppConfig,
  session: UserSession,
  row: RegistryWriteRow
): Promise<void> {
  const spreadsheetId = extractIdFromUrl(config.adminSpreadsheetId);
  if (!spreadsheetId) {
    throw new Error(
      "Choose the Admin workbook in Team setup before saving Members."
    );
  }
  if (!session.accessToken) throw new GoogleSheetsAuthError();
  const accessToken = session.accessToken;
  const tab = await resolveAdminTab(
    spreadsheetId,
    ADMIN_TAB_NAMES.registry,
    accessToken,
    { createIfMissing: true }
  );
  await ensureCanonicalHeaders(
    spreadsheetId,
    tab,
    ADMIN_REGISTRY_HEADERS,
    accessToken
  );
  const data = await prepareRegistryUpsert(
    spreadsheetId,
    tab,
    accessToken,
    row
  );
  if (data.length === 0) return;
  await writeAdminValueRanges(
    spreadsheetId,
    accessToken,
    data,
    "upsertRegistryMember",
    tab.title,
    row.memberId
  );
}

export async function writeRolesRows(
  config: AppConfig,
  session: UserSession,
  rows: RoleWriteRow[]
): Promise<void> {
  const rowsByMember = new Map<string, RoleWriteRow[]>();
  for (const row of rows) {
    const memberId = row.memberId.trim();
    if (!memberId) {
      throw new Error(
        "A stable Member ID is required for an Access role update."
      );
    }
    rowsByMember.set(memberId, [...(rowsByMember.get(memberId) ?? []), row]);
  }
  for (const memberRows of rowsByMember.values()) {
    await syncMemberRoleRows(config, session, {
      memberId: memberRows[0]!.memberId,
      expectedRevision: memberRows[0]!.expectedRevision,
      revision: memberRows[0]!.revision,
      rows: memberRows
    });
  }
}

/**
 * Mirrors one authoritative backend member without ever replacing either
 * compatibility tab. Both tabs are preflighted by immutable ID/revision, then
 * committed through one values.batchUpdate request. A retry with the same
 * backend revision is idempotent.
 */
export async function mirrorMemberCompatibilityRows(
  config: AppConfig,
  session: UserSession,
  update: MemberCompatibilityMirrorUpdate
): Promise<void> {
  const spreadsheetId = extractIdFromUrl(config.adminSpreadsheetId);
  if (!spreadsheetId) {
    throw new Error(
      "Choose the Admin workbook in Team setup before mirroring onboarding."
    );
  }
  if (!session.accessToken) throw new GoogleSheetsAuthError();
  const accessToken = session.accessToken;
  const [registryTab, rolesTab] = await Promise.all([
    update.registry
      ? resolveAdminTab(
          spreadsheetId,
          ADMIN_TAB_NAMES.registry,
          accessToken,
          { createIfMissing: true }
        )
      : Promise.resolve(null),
    resolveAdminTab(spreadsheetId, ADMIN_TAB_NAMES.roles, accessToken, {
      createIfMissing: true
    })
  ]);
  await Promise.all([
    registryTab
      ? ensureCanonicalHeaders(
          spreadsheetId,
          registryTab,
          ADMIN_REGISTRY_HEADERS,
          accessToken
        )
      : Promise.resolve(),
    ensureCanonicalHeaders(
      spreadsheetId,
      rolesTab,
      ADMIN_ROLES_HEADERS,
      accessToken
    )
  ]);
  const revisionFields = {
    revision: update.revision,
    ...(update.expectedRevision !== undefined
      ? { expectedRevision: update.expectedRevision }
      : {})
  };
  const roleUpdate: MemberRoleMirrorUpdate = {
    memberId: update.memberId,
    ...revisionFields,
    rows: update.roles.map((role) => ({
      ...role,
      memberId: update.memberId,
      ...revisionFields
    }))
  };
  const [registryData, rolesData] = await Promise.all([
    registryTab && update.registry
      ? prepareRegistryUpsert(
          spreadsheetId,
          registryTab,
          accessToken,
          {
            ...update.registry,
            memberId: update.memberId,
            ...revisionFields
          }
        )
      : Promise.resolve([]),
    prepareMemberRoleSync(spreadsheetId, rolesTab, accessToken, roleUpdate)
  ]);
  const data = [...registryData, ...rolesData];
  if (data.length === 0) return;
  await writeAdminValueRanges(
    spreadsheetId,
    accessToken,
    data,
    "mirrorOnboardingMember",
    `${registryTab?.title ?? ""},${rolesTab.title}`,
    update.memberId
  );
}

export async function syncMemberRoleRows(
  config: AppConfig,
  session: UserSession,
  update: MemberRoleMirrorUpdate
): Promise<void> {
  const spreadsheetId = extractIdFromUrl(config.adminSpreadsheetId);
  if (!spreadsheetId) {
    throw new Error(
      "Choose the Admin workbook in Team setup before saving Access roles."
    );
  }
  if (!session.accessToken) throw new GoogleSheetsAuthError();
  const accessToken = session.accessToken;
  const tab = await resolveAdminTab(
    spreadsheetId,
    ADMIN_TAB_NAMES.roles,
    accessToken,
    { createIfMissing: true }
  );
  await ensureCanonicalHeaders(
    spreadsheetId,
    tab,
    ADMIN_ROLES_HEADERS,
    accessToken
  );
  const data = await prepareMemberRoleSync(
    spreadsheetId,
    tab,
    accessToken,
    update
  );
  if (data.length === 0) return;
  await writeAdminValueRanges(
    spreadsheetId,
    accessToken,
    data,
    "syncMemberRoles",
    tab.title,
    update.memberId
  );
}
