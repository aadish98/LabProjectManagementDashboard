import type { EmployeeSheetPrefs, UserSession } from "../../../domain/app";
import { getValuesForSheet, requestSheets, SHEETS_API_ROOT } from "../client";
import {
  GoogleSheetsAuthError,
  SheetRevisionConflictError,
  SheetsError
} from "../errors";
import {
  columnLetter,
  encodeSheetRange,
  extractIdFromUrl,
  safeCell
} from "../helpers";
import { getHeaderRow } from "../metadata";
import {
  buildTaskMetadataBackfill,
  TASK_ID_HEADER,
  TASK_REVISION_HEADER,
  parseTaskRevision,
  taskIdColumnIndex,
  taskRevisionColumnIndex
} from "./rowMapping";

export interface TaskMutationIdentity {
  rowNumber?: number;
  taskId: string;
  expectedRevision?: number;
}

export async function backfillTaskIdsInSheet(
  prefs: EmployeeSheetPrefs,
  session: UserSession
): Promise<number> {
  if (!session.accessToken) throw new GoogleSheetsAuthError();
  const spreadsheetId = extractIdFromUrl(prefs.taskLogUrl);
  let { headers } = await getHeaderRow(
    spreadsheetId,
    prefs.activeSheetName,
    session.accessToken
  );
  const missingHeaders = [
    ...(taskIdColumnIndex(headers) === undefined ? [TASK_ID_HEADER] : []),
    ...(taskRevisionColumnIndex(headers) === undefined
      ? [TASK_REVISION_HEADER]
      : [])
  ];
  for (const header of missingHeaders) {
    const column = columnLetter(headers.length + 1);
    await requestSheets(
      `${SHEETS_API_ROOT}/${spreadsheetId}/values/${encodeSheetRange(
        prefs.activeSheetName,
        `${column}1`
      )}?valueInputOption=RAW`,
      session.accessToken,
      {
        method: "PUT",
        body: JSON.stringify({ values: [[header]] })
      },
      {
        operation:
          header === TASK_ID_HEADER
            ? "addTaskIdHeader"
            : "addTaskRevisionHeader",
        spreadsheetId,
        sheetName: prefs.activeSheetName
      }
    );
    headers = [...headers, header];
  }
  const endColumn = columnLetter(headers.length);
  const rows = await getValuesForSheet(
    spreadsheetId,
    prefs.activeSheetName,
    `A1:${endColumn}`,
    session.accessToken
  );
  const backfill = buildTaskMetadataBackfill(
    rows,
    undefined,
    prefs.columnMap,
    prefs.strictColumnMap
  );
  if (backfill.length === 0) return 0;
  const idColumn = columnLetter((taskIdColumnIndex(headers) ?? 0) + 1);
  const revisionColumn = columnLetter(
    (taskRevisionColumnIndex(headers) ?? 0) + 1
  );
  const escapedSheetName = prefs.activeSheetName.replace(/'/g, "''");
  await requestSheets(
    `${SHEETS_API_ROOT}/${spreadsheetId}/values:batchUpdate`,
    session.accessToken,
    {
      method: "POST",
      body: JSON.stringify({
        valueInputOption: "RAW",
        data: backfill.flatMap((entry) => [
          ...(entry.taskId
            ? [{
                range: `'${escapedSheetName}'!${idColumn}${entry.rowNumber}`,
                values: [[entry.taskId]]
              }]
            : []),
          ...(entry.taskRevision !== undefined
            ? [{
                range: `'${escapedSheetName}'!${revisionColumn}${entry.rowNumber}`,
                values: [[entry.taskRevision]]
              }]
            : [])
        ])
      })
    },
    {
      operation: "backfillTaskIds",
      spreadsheetId,
      sheetName: prefs.activeSheetName
    }
  );
  return backfill.length;
}

export async function verifyTaskRevisionBeforeMutation(
  spreadsheetId: string,
  sheetName: string,
  headers: string[],
  rowNumber: number,
  identity: TaskMutationIdentity,
  accessToken: string
): Promise<string[]> {
  const idColumn = taskIdColumnIndex(headers);
  const revisionColumn = taskRevisionColumnIndex(headers);
  const expectedRevision = parseTaskRevision(identity.expectedRevision);
  if (idColumn === undefined || revisionColumn === undefined) {
    throw new SheetsError(
      "conflict",
      "This legacy task has no Task Revision metadata. Backfill task metadata and refresh before editing it.",
      {
        status: 409,
        context: {
          operation: "verifyTaskRevisionSchema",
          spreadsheetId,
          sheetName,
          taskId: identity.taskId
        }
      }
    );
  }
  if (expectedRevision === undefined) {
    throw new SheetsError(
      "conflict",
      "This task was opened without a valid Task Revision. Refresh or backfill task metadata, then reopen it before editing.",
      {
        status: 409,
        context: {
          operation: "verifyExpectedTaskRevision",
          spreadsheetId,
          sheetName,
          taskId: identity.taskId
        }
      }
    );
  }
  const endColumn = columnLetter(Math.max(headers.length, 1));
  const rows = await getValuesForSheet(
    spreadsheetId,
    sheetName,
    `A${rowNumber}:${endColumn}${rowNumber}`,
    accessToken
  );
  const currentRow = rows[0] ?? [];
  if (safeCell(currentRow, idColumn) !== identity.taskId) {
    throw new SheetRevisionConflictError(
      "The task row moved while it was being updated. Refresh and retry.",
      {
        operation: "reverifyTaskRow",
        spreadsheetId,
        sheetName,
        taskId: identity.taskId,
        expectedRevision
      }
    );
  }
  const currentRevision = parseTaskRevision(currentRow[revisionColumn]);
  if (currentRevision === undefined) {
    throw new SheetsError(
      "conflict",
      "This legacy task has no valid Task Revision. Backfill task metadata and refresh before editing it.",
      {
        status: 409,
        context: {
          operation: "verifyCurrentTaskRevision",
          spreadsheetId,
          sheetName,
          taskId: identity.taskId,
          expectedRevision
        }
      }
    );
  }
  if (currentRevision !== expectedRevision) {
    throw new SheetRevisionConflictError(
      "This task changed since you opened it. Refresh the latest task, compare your draft, and retry.",
      {
        operation: "verifyTaskRevision",
        spreadsheetId,
        sheetName,
        taskId: identity.taskId,
        expectedRevision,
        currentRevision
      }
    );
  }
  return currentRow;
}

export async function resolveTaskRowById(
  spreadsheetId: string,
  sheetName: string,
  headers: string[],
  identity: TaskMutationIdentity,
  accessToken: string
): Promise<number> {
  const taskId = identity.taskId?.trim();
  const idColumn = taskIdColumnIndex(headers);
  if (!taskId || idColumn === undefined) {
    throw new SheetsError(
      "conflict",
      "This legacy task has no immutable Task ID. Backfill Task IDs and refresh before editing it.",
      {
        context: {
          operation: "verifyTaskIdentity",
          spreadsheetId,
          sheetName,
          taskId
        }
      }
    );
  }
  const column = columnLetter(idColumn + 1);
  const idRows = await getValuesForSheet(
    spreadsheetId,
    sheetName,
    `${column}2:${column}`,
    accessToken
  );
  const matches = idRows.flatMap((row, offset) =>
    safeCell(row, 0) === taskId ? [offset + 2] : []
  );
  if (matches.length !== 1) {
    throw new SheetsError(
      "conflict",
      matches.length === 0
        ? "The task no longer exists at a verifiable row. Refresh before retrying."
        : "Duplicate Task IDs were found. Refusing to update an ambiguous task.",
      {
        context: {
          operation: "lookupTaskById",
          spreadsheetId,
          sheetName,
          taskId
        }
      }
    );
  }
  const resolvedRow = matches[0];
  const reverified = await getValuesForSheet(
    spreadsheetId,
    sheetName,
    `${column}${resolvedRow}`,
    accessToken
  );
  if (safeCell(reverified[0], 0) !== taskId) {
    throw new SheetsError(
      "conflict",
      "The task row changed during the update. Refresh before retrying.",
      {
        context: {
          operation: "reverifyTaskIdentity",
          spreadsheetId,
          sheetName,
          taskId
        }
      }
    );
  }
  return resolvedRow;
}
