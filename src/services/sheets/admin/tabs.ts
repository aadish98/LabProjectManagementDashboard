import type { AppConfig, UserSession } from "../../../domain/app";
import { ADMIN_TAB_NAMES } from "../../../domain/app";
import { getValuesForSheet, requestSheets, SHEETS_API_ROOT } from "../client";
import { GoogleSheetsAuthError, SheetsError } from "../errors";
import {
  columnLetter,
  encodeSheetRange,
  extractIdFromUrl,
  normalizeHeader
} from "../helpers";
import {
  fetchSpreadsheetMetadata,
  type SheetMetadata
} from "../metadata";
import {
  ADMIN_REGISTRY_HEADERS,
  ADMIN_ROLES_HEADERS,
  RUN_LOG_HEADERS,
  type AdminTabResolution
} from "./types";

export async function resolveAdminTab(
  spreadsheetId: string,
  tabName: string,
  accessToken: string,
  options: { createIfMissing?: boolean } = {}
): Promise<AdminTabResolution> {
  const metadata = await fetchSpreadsheetMetadata(spreadsheetId, accessToken);
  const exact = findAdminTab(metadata, tabName);
  if (exact) return exact;
  if (!options.createIfMissing) {
    throw new SheetsError(
      "schema",
      "The Admin workbook needs repair. Open Team setup to fix missing setup tabs.",
      {
        context: {
          operation: "resolveAdminTab",
          spreadsheetId,
          sheetName: tabName
        }
      }
    );
  }

  const response = await requestSheets<{
    replies?: Array<{
      addSheet?: { properties?: { sheetId?: number; title?: string } };
    }>;
  }>(`${SHEETS_API_ROOT}/${spreadsheetId}:batchUpdate`, accessToken, {
    method: "POST",
    body: JSON.stringify({
      requests: [{ addSheet: { properties: { title: tabName } } }]
    })
  });
  const created = response.replies?.[0]?.addSheet?.properties;
  if (!created || created.sheetId === undefined || !created.title) {
    throw new Error(`Could not repair backend setup data for "${tabName}".`);
  }
  return { sheetId: created.sheetId, title: created.title };
}

export function ensureHeaderRowMatches(
  existingHeaders: string[],
  requiredHeaders: ReadonlyArray<string>
): boolean {
  const existing = existingHeaders.map((header) => normalizeHeader(header));
  for (let index = 0; index < requiredHeaders.length; index++) {
    if (existing[index] !== normalizeHeader(requiredHeaders[index] ?? "")) {
      return false;
    }
  }
  return true;
}

export function findAdminTab(
  metadata: SheetMetadata,
  tabName: string
): AdminTabResolution | null {
  const tab = metadata.sheets.find(
    (sheet) => sheet.title.trim().toLowerCase() === tabName.toLowerCase()
  );
  return tab ? { sheetId: tab.sheetId, title: tab.title } : null;
}

export function describeAdminTabRepair(
  tabName: string,
  tab: AdminTabResolution | null,
  rows: string[][],
  requiredHeaders: ReadonlyArray<string>
): string | null {
  if (!tab) return `Missing "${tabName}" tab.`;
  if (!ensureHeaderRowMatches(rows[0] ?? [], requiredHeaders)) {
    return `"${tabName}" tab headers need repair.`;
  }
  return null;
}

export async function ensureCanonicalHeaders(
  spreadsheetId: string,
  tab: AdminTabResolution,
  requiredHeaders: ReadonlyArray<string>,
  accessToken: string
): Promise<void> {
  const existing = await getValuesForSheet(
    spreadsheetId,
    tab.title,
    "1:1",
    accessToken
  );
  const existingHeaders = existing[0] ?? [];
  if (
    existingHeaders.length >= requiredHeaders.length &&
    ensureHeaderRowMatches(existingHeaders, requiredHeaders)
  ) {
    return;
  }

  const endColumn = columnLetter(
    Math.max(requiredHeaders.length, existingHeaders.length, 1)
  );
  await requestSheets(
    `${SHEETS_API_ROOT}/${spreadsheetId}/values/${encodeSheetRange(
      tab.title,
      `A1:${endColumn}1`
    )}?valueInputOption=USER_ENTERED`,
    accessToken,
    {
      method: "PUT",
      body: JSON.stringify({ values: [Array.from(requiredHeaders)] })
    }
  );
}

export async function ensureAdminWorkbookSkeleton(
  config: AppConfig,
  session: UserSession
): Promise<void> {
  const spreadsheetId = extractIdFromUrl(config.adminSpreadsheetId);
  if (!spreadsheetId) {
    throw new Error(
      "Choose the Admin workbook in Team setup before fixing setup tabs."
    );
  }
  if (!session.accessToken) throw new GoogleSheetsAuthError();
  const accessToken = session.accessToken;
  const registry = await resolveAdminTab(
    spreadsheetId,
    ADMIN_TAB_NAMES.registry,
    accessToken,
    { createIfMissing: true }
  );
  await ensureCanonicalHeaders(
    spreadsheetId,
    registry,
    ADMIN_REGISTRY_HEADERS,
    accessToken
  );
  const roles = await resolveAdminTab(
    spreadsheetId,
    ADMIN_TAB_NAMES.roles,
    accessToken,
    { createIfMissing: true }
  );
  await ensureCanonicalHeaders(
    spreadsheetId,
    roles,
    ADMIN_ROLES_HEADERS,
    accessToken
  );
  const runLog = await resolveAdminTab(
    spreadsheetId,
    ADMIN_TAB_NAMES.runLog,
    accessToken,
    { createIfMissing: true }
  );
  await ensureCanonicalHeaders(
    spreadsheetId,
    runLog,
    RUN_LOG_HEADERS,
    accessToken
  );
}
