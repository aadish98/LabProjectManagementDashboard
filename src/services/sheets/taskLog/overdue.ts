import type { EmployeeSheetPrefs, UserSession } from "../../../domain/app";
import { formatLocalIsoDate } from "../../../utils/date";
import { requestSheets, SHEETS_API_ROOT } from "../client";
import { GoogleSheetsAuthError, SheetsError } from "../errors";
import { resolveTaskFieldIndices } from "../helpers";
import { fetchSpreadsheetMetadata, getHeaderRow } from "../metadata";
import {
  resolveTaskRowById,
  verifyTaskRevisionBeforeMutation
} from "./identity";
import { taskRevisionColumnIndex } from "./rowMapping";

export interface OverdueResolution {
  rowNumber?: number;
  taskId: string;
  expectedRevision?: number;
  newProjectedEndDate: string;
  newTimeEstimate: string;
  delayComment: string;
}

interface RichTextRun {
  startIndex: number;
  format: { strikethrough: boolean };
}

interface RichTextCell {
  text: string;
  runs: RichTextRun[];
}

export function buildAppendedStruckCell(
  existing: string,
  addition: string
): RichTextCell {
  const trimmedAddition = addition.trim();
  const trimmedExisting = existing.trim();
  if (!trimmedExisting) {
    return {
      text: trimmedAddition,
      runs: [{ startIndex: 0, format: { strikethrough: false } }]
    };
  }
  return {
    text: `${existing}\n${trimmedAddition}`,
    runs: [
      { startIndex: 0, format: { strikethrough: true } },
      {
        startIndex: existing.length + 1,
        format: { strikethrough: false }
      }
    ]
  };
}

export async function resolveOverdueTaskInSheet(
  prefs: EmployeeSheetPrefs,
  session: UserSession,
  resolution: OverdueResolution
): Promise<void> {
  if (!session.accessToken) throw new GoogleSheetsAuthError();
  const accessToken = session.accessToken;
  const metadata = await fetchSpreadsheetMetadata(prefs.taskLogUrl, accessToken);
  const spreadsheetId = metadata.spreadsheetId;
  const targetSheet = metadata.sheets.find(
    (sheet) =>
      sheet.title.trim().toLowerCase() ===
      prefs.activeSheetName.trim().toLowerCase()
  );
  if (!targetSheet) {
    throw new SheetsError(
      "notFound",
      `Tab "${prefs.activeSheetName}" no longer exists in the spreadsheet.`,
      {
        context: {
          operation: "resolveOverdueTask",
          spreadsheetId,
          sheetName: prefs.activeSheetName,
          taskId: resolution.taskId
        }
      }
    );
  }
  const { headers } = await getHeaderRow(
    spreadsheetId,
    targetSheet.title,
    accessToken
  );
  const fieldIndex = resolveTaskFieldIndices(headers, prefs.columnMap, {
    fallbackToAliases: !prefs.strictColumnMap
  });
  const rowNumber = await resolveTaskRowById(
    spreadsheetId,
    targetSheet.title,
    headers,
    resolution,
    accessToken
  );
  const projectedEndCol = fieldIndex.projectedEndDate;
  const timeEstimateCol = fieldIndex.timeEstimate;
  const commentsCol = fieldIndex.comments;
  if (projectedEndCol === undefined || timeEstimateCol === undefined) {
    throw new SheetsError(
      "schema",
      "Could not locate the projected end date or time estimate column in this sheet.",
      {
        context: {
          operation: "resolveOverdueColumns",
          spreadsheetId,
          sheetName: targetSheet.title,
          taskId: resolution.taskId
        }
      }
    );
  }
  const currentRow = await verifyTaskRevisionBeforeMutation(
    spreadsheetId,
    targetSheet.title,
    headers,
    rowNumber,
    resolution,
    accessToken
  );
  const projectedEndCell = buildAppendedStruckCell(
    String(currentRow[projectedEndCol] ?? ""),
    resolution.newProjectedEndDate
  );
  const timeEstimateCell = buildAppendedStruckCell(
    String(currentRow[timeEstimateCol] ?? ""),
    resolution.newTimeEstimate
  );
  const currentComments =
    commentsCol !== undefined ? String(currentRow[commentsCol] ?? "") : "";
  const commentLine = `[${formatLocalIsoDate(
    new Date()
  )}] ${resolution.delayComment.trim()}`;
  const newComments = currentComments.trim()
    ? `${currentComments}\n${commentLine}`
    : commentLine;
  const requests: unknown[] = [
    buildRichTextCellRequest(
      targetSheet.sheetId,
      rowNumber,
      projectedEndCol,
      projectedEndCell
    ),
    buildRichTextCellRequest(
      targetSheet.sheetId,
      rowNumber,
      timeEstimateCol,
      timeEstimateCell
    )
  ];
  if (commentsCol !== undefined) {
    requests.push({
      updateCells: {
        range: {
          sheetId: targetSheet.sheetId,
          startRowIndex: rowNumber - 1,
          endRowIndex: rowNumber,
          startColumnIndex: commentsCol,
          endColumnIndex: commentsCol + 1
        },
        rows: [{
          values: [{
            userEnteredValue: { stringValue: newComments },
            userEnteredFormat: { wrapStrategy: "WRAP" }
          }]
        }],
        fields: "userEnteredValue,userEnteredFormat.wrapStrategy"
      }
    });
  }
  const revisionColumn = taskRevisionColumnIndex(headers);
  if (revisionColumn === undefined || resolution.expectedRevision === undefined) {
    throw new SheetsError(
      "conflict",
      "Task Revision metadata is required before resolving this overdue task.",
      {
        status: 409,
        context: {
          operation: "incrementTaskRevision",
          spreadsheetId,
          sheetName: targetSheet.title,
          taskId: resolution.taskId
        }
      }
    );
  }
  requests.push({
    updateCells: {
      range: {
        sheetId: targetSheet.sheetId,
        startRowIndex: rowNumber - 1,
        endRowIndex: rowNumber,
        startColumnIndex: revisionColumn,
        endColumnIndex: revisionColumn + 1
      },
      rows: [{
        values: [{
          userEnteredValue: {
            numberValue: resolution.expectedRevision + 1
          }
        }]
      }],
      fields: "userEnteredValue"
    }
  });
  await requestSheets(
    `${SHEETS_API_ROOT}/${spreadsheetId}:batchUpdate`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({ requests })
    }
  );
}

function buildRichTextCellRequest(
  sheetId: number,
  rowNumber: number,
  column: number,
  cell: RichTextCell
): unknown {
  return {
    updateCells: {
      range: {
        sheetId,
        startRowIndex: rowNumber - 1,
        endRowIndex: rowNumber,
        startColumnIndex: column,
        endColumnIndex: column + 1
      },
      rows: [{
        values: [{
          userEnteredValue: { stringValue: cell.text },
          userEnteredFormat: { wrapStrategy: "WRAP" },
          textFormatRuns: cell.runs
        }]
      }],
      fields: "userEnteredValue,userEnteredFormat.wrapStrategy,textFormatRuns"
    }
  };
}
