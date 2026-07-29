import type {
  EmployeeSheetPrefs,
  TaskFieldKey,
  UserSession
} from "../../../domain/app";
import { TASK_FIELDS } from "../../../domain/app";
import type { ExperimentDraft } from "../../../domain/experiment";
import { requestSheets, SHEETS_API_ROOT } from "../client";
import { GoogleSheetsAuthError, SheetsError } from "../errors";
import {
  columnLetter,
  createImmutableId,
  encodeSheetRange,
  extractIdFromUrl,
  resolveTaskFieldIndices
} from "../helpers";
import { getHeaderRow } from "../metadata";
import {
  backfillTaskIdsInSheet,
  resolveTaskRowById,
  verifyTaskRevisionBeforeMutation,
  type TaskMutationIdentity
} from "./identity";
import {
  buildChangedTaskCellUpdates,
  draftValueForField,
  taskIdColumnIndex,
  taskRevisionColumnIndex
} from "./rowMapping";

export async function createTaskInSheet(
  prefs: EmployeeSheetPrefs,
  session: UserSession,
  draft: ExperimentDraft
): Promise<string> {
  if (!session.accessToken) throw new GoogleSheetsAuthError();
  const spreadsheetId = extractIdFromUrl(prefs.taskLogUrl);
  await backfillTaskIdsInSheet(prefs, session);
  const { headers } = await getHeaderRow(
    spreadsheetId,
    prefs.activeSheetName,
    session.accessToken
  );
  const taskId = createImmutableId("task");
  const idColumnIndex = taskIdColumnIndex(headers);
  const revisionColumnIndex = taskRevisionColumnIndex(headers);
  if (idColumnIndex === undefined || revisionColumnIndex === undefined) {
    throw new SheetsError(
      "schema",
      "The Task ID and Task Revision columns could not be created. Refresh the workbook before retrying.",
      {
        context: {
          operation: "reserveTaskRow",
          spreadsheetId,
          sheetName: prefs.activeSheetName
        }
      }
    );
  }
  const idColumn = columnLetter(idColumnIndex + 1);
  const reservation = await requestSheets<{
    updates?: { updatedRange?: string };
  }>(
    `${SHEETS_API_ROOT}/${spreadsheetId}/values/${encodeSheetRange(
      prefs.activeSheetName,
      `${idColumn}:${idColumn}`
    )}:append?valueInputOption=RAW&insertDataOption=OVERWRITE&includeValuesInResponse=true`,
    session.accessToken,
    {
      method: "POST",
      body: JSON.stringify({ values: [[taskId]] })
    },
    {
      operation: "reserveTaskRow",
      spreadsheetId,
      sheetName: prefs.activeSheetName,
      taskId
    }
  );
  if (!reservation.updates?.updatedRange) {
    throw new SheetsError(
      "conflict",
      "Google Sheets did not confirm the reserved task row. Refresh before retrying.",
      {
        context: {
          operation: "reserveTaskRow",
          spreadsheetId,
          sheetName: prefs.activeSheetName,
          taskId
        }
      }
    );
  }

  // The append atomically allocates the row. Resolve it again by immutable ID
  // so a sort between allocation and population cannot redirect task data.
  const rowNumber = await resolveTaskRowById(
    spreadsheetId,
    prefs.activeSheetName,
    headers,
    { taskId },
    session.accessToken
  );
  const fieldIndex = resolveTaskFieldIndices(headers, prefs.columnMap, {
    fallbackToAliases: !prefs.strictColumnMap
  });
  const writableFields = new Map<number, TaskFieldKey>();
  for (const field of TASK_FIELDS) {
    const column = fieldIndex[field.key];
    if (column !== undefined && !writableFields.has(column)) {
      writableFields.set(column, field.key);
    }
  }
  const escapedSheetName = prefs.activeSheetName.replace(/'/g, "''");
  const data: Array<{ range: string; values: Array<Array<string | number>> }> =
    Array.from(writableFields.entries())
      .sort(([left], [right]) => left - right)
      .map(([column, field]) => ({
        range: `'${escapedSheetName}'!${columnLetter(column + 1)}${rowNumber}`,
        values: [[draftValueForField(field, draft)]]
      }));
  data.push({
    range: `'${escapedSheetName}'!${columnLetter(
      revisionColumnIndex + 1
    )}${rowNumber}`,
    values: [[1]]
  });
  await requestSheets(
    `${SHEETS_API_ROOT}/${spreadsheetId}/values:batchUpdate`,
    session.accessToken,
    {
      method: "POST",
      body: JSON.stringify({ valueInputOption: "USER_ENTERED", data })
    },
    {
      operation: "populateReservedTaskRow",
      spreadsheetId,
      sheetName: prefs.activeSheetName,
      taskId
    }
  );
  return taskId;
}

export async function updateTaskInSheet(
  prefs: EmployeeSheetPrefs,
  session: UserSession,
  identity: TaskMutationIdentity,
  draft: ExperimentDraft
): Promise<void> {
  if (!session.accessToken) throw new GoogleSheetsAuthError();
  const spreadsheetId = extractIdFromUrl(prefs.taskLogUrl);
  const { headers } = await getHeaderRow(
    spreadsheetId,
    prefs.activeSheetName,
    session.accessToken
  );
  const rowNumber = await resolveTaskRowById(
    spreadsheetId,
    prefs.activeSheetName,
    headers,
    identity,
    session.accessToken
  );
  const currentRow = await verifyTaskRevisionBeforeMutation(
    spreadsheetId,
    prefs.activeSheetName,
    headers,
    rowNumber,
    identity,
    session.accessToken
  );
  const updates = buildChangedTaskCellUpdates(
    headers,
    currentRow,
    { ...draft, taskId: identity.taskId },
    prefs.columnMap,
    prefs.strictColumnMap
  );
  if (updates.length === 0) return;
  const revisionColumn = taskRevisionColumnIndex(headers);
  if (revisionColumn === undefined || identity.expectedRevision === undefined) {
    throw new SheetsError(
      "conflict",
      "Task Revision metadata is required before updating this task.",
      {
        status: 409,
        context: {
          operation: "incrementTaskRevision",
          spreadsheetId,
          sheetName: prefs.activeSheetName,
          taskId: identity.taskId
        }
      }
    );
  }
  const escapedSheetName = prefs.activeSheetName.replace(/'/g, "''");
  const data: Array<{ range: string; values: Array<Array<string | number>> }> =
    updates.map((update) => ({
      range: `'${escapedSheetName}'!${columnLetter(update.column + 1)}${rowNumber}`,
      values: [[update.value]]
    }));
  data.push({
    range: `'${escapedSheetName}'!${columnLetter(revisionColumn + 1)}${rowNumber}`,
    values: [[identity.expectedRevision + 1]]
  });
  await requestSheets(
    `${SHEETS_API_ROOT}/${spreadsheetId}/values:batchUpdate`,
    session.accessToken,
    {
      method: "POST",
      body: JSON.stringify({ valueInputOption: "USER_ENTERED", data })
    },
    {
      operation: "updateTaskCells",
      spreadsheetId,
      sheetName: prefs.activeSheetName,
      taskId: identity.taskId
    }
  );
}

export interface CompletionPayload {
  rowNumber?: number;
  taskId: string;
  expectedRevision?: number;
  result: string;
  dataLink: string;
  schematic: string;
}

export async function completeTaskInSheet(
  prefs: EmployeeSheetPrefs,
  session: UserSession,
  payload: CompletionPayload
): Promise<void> {
  if (!session.accessToken) throw new GoogleSheetsAuthError();
  const spreadsheetId = extractIdFromUrl(prefs.taskLogUrl);
  const accessToken = session.accessToken;
  const { headers } = await getHeaderRow(
    spreadsheetId,
    prefs.activeSheetName,
    accessToken
  );
  const fieldIndex = resolveTaskFieldIndices(headers, prefs.columnMap, {
    fallbackToAliases: !prefs.strictColumnMap
  });
  const rowNumber = await resolveTaskRowById(
    spreadsheetId,
    prefs.activeSheetName,
    headers,
    payload,
    accessToken
  );
  await verifyTaskRevisionBeforeMutation(
    spreadsheetId,
    prefs.activeSheetName,
    headers,
    rowNumber,
    payload,
    accessToken
  );
  const updates: Array<{ column: number; value: string }> = [];
  if (fieldIndex.status !== undefined) {
    updates.push({ column: fieldIndex.status, value: "Complete" });
  }
  if (fieldIndex.result !== undefined) {
    updates.push({ column: fieldIndex.result, value: payload.result });
  }
  if (fieldIndex.dataLink !== undefined) {
    updates.push({ column: fieldIndex.dataLink, value: payload.dataLink });
  }
  if (fieldIndex.schematic !== undefined) {
    updates.push({ column: fieldIndex.schematic, value: payload.schematic });
  }
  if (updates.length === 0) return;
  const revisionColumn = taskRevisionColumnIndex(headers);
  if (revisionColumn === undefined || payload.expectedRevision === undefined) {
    throw new SheetsError(
      "conflict",
      "Task Revision metadata is required before completing this task.",
      {
        status: 409,
        context: {
          operation: "incrementTaskRevision",
          spreadsheetId,
          sheetName: prefs.activeSheetName,
          taskId: payload.taskId
        }
      }
    );
  }
  const escapedSheetName = prefs.activeSheetName.replace(/'/g, "''");
  const data: Array<{ range: string; values: Array<Array<string | number>> }> =
    updates.map((update) => ({
      range: `'${escapedSheetName}'!${columnLetter(update.column + 1)}${rowNumber}`,
      values: [[update.value]]
    }));
  data.push({
    range: `'${escapedSheetName}'!${columnLetter(revisionColumn + 1)}${rowNumber}`,
    values: [[payload.expectedRevision + 1]]
  });
  await requestSheets(
    `${SHEETS_API_ROOT}/${spreadsheetId}/values:batchUpdate`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({ valueInputOption: "USER_ENTERED", data })
    }
  );
}
