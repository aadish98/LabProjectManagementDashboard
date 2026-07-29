import type { AppConfig, UserSession } from "../../../domain/app";
import { ADMIN_TAB_NAMES } from "../../../domain/app";
import { requestSheets, SHEETS_API_ROOT } from "../client";
import { GoogleSheetsAuthError } from "../errors";
import {
  columnLetter,
  encodeSheetRange,
  extractIdFromUrl
} from "../helpers";
import { ensureCanonicalHeaders, resolveAdminTab } from "./tabs";
import { RUN_LOG_HEADERS, type RunLogAuditWrite } from "./types";

export async function appendRunLogEntry(
  config: AppConfig,
  session: UserSession,
  entry: RunLogAuditWrite
): Promise<void> {
  const spreadsheetId = extractIdFromUrl(config.adminSpreadsheetId);
  if (!spreadsheetId) {
    throw new Error("Choose the Admin workbook before writing the audit log.");
  }
  if (!session.accessToken) throw new GoogleSheetsAuthError();
  const tab = await resolveAdminTab(
    spreadsheetId,
    ADMIN_TAB_NAMES.runLog,
    session.accessToken,
    { createIfMissing: true }
  );
  await ensureCanonicalHeaders(
    spreadsheetId,
    tab,
    RUN_LOG_HEADERS,
    session.accessToken
  );
  await requestSheets(
    `${SHEETS_API_ROOT}/${spreadsheetId}/values/${encodeSheetRange(
      tab.title,
      `A:${columnLetter(RUN_LOG_HEADERS.length)}`
    )}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    session.accessToken,
    {
      method: "POST",
      body: JSON.stringify({
        values: [[
          entry.timestamp,
          entry.actorEmail.trim().toLowerCase(),
          entry.memberId?.trim() ?? "",
          entry.taskId.trim(),
          entry.workbook.trim(),
          entry.action,
          JSON.stringify(entry.changedFields),
          entry.labMember.trim(),
          entry.taskLogUrl.trim(),
          entry.status.trim(),
          entry.note?.trim() ?? ""
        ]]
      })
    },
    {
      operation: "appendRunLog",
      spreadsheetId,
      sheetName: tab.title,
      memberId: entry.memberId,
      taskId: entry.taskId
    }
  );
}
