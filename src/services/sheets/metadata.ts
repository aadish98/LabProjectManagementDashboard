import type {
  EmployeeSheetColumnMap,
  EmployeeSheetPrefs,
  TaskFieldKey
} from "../../domain/app";
import { TASK_FIELDS } from "../../domain/app";
import {
  getValuesForSheet,
  requestSheets,
  SHEETS_API_ROOT
} from "./client";
import { SheetsError } from "./errors";
import {
  columnLetter,
  encodeSheetRange,
  extractIdFromUrl,
  headerIndex,
  normalizeHeader,
  resolveTaskFieldIndices
} from "./helpers";

export interface SheetMetadata {
  spreadsheetId: string;
  spreadsheetTitle: string;
  sheets: Array<{ sheetId: number; title: string }>;
}

export async function fetchSpreadsheetMetadata(
  spreadsheetIdOrUrl: string,
  accessToken: string
): Promise<SheetMetadata> {
  const spreadsheetId = extractIdFromUrl(spreadsheetIdOrUrl);
  if (!spreadsheetId) {
    throw new SheetsError(
      "schema",
      "That doesn't look like a valid Google Sheets URL or ID.",
      { context: { operation: "parseSpreadsheetId" } }
    );
  }

  const response = await requestSheets<{
    spreadsheetId: string;
    properties?: { title?: string };
    sheets?: Array<{
      properties?: { sheetId?: number; title?: string };
    }>;
  }>(
    `${SHEETS_API_ROOT}/${spreadsheetId}?fields=spreadsheetId,properties.title,sheets.properties(sheetId,title)`,
    accessToken
  );

  const sheets =
    response.sheets
      ?.map((sheet) => ({
        sheetId: sheet.properties?.sheetId ?? 0,
        title: sheet.properties?.title ?? ""
      }))
      .filter((sheet) => sheet.title) ?? [];

  return {
    spreadsheetId: response.spreadsheetId,
    spreadsheetTitle: response.properties?.title ?? "",
    sheets
  };
}

export interface ValidatedSheet {
  spreadsheetId: string;
  sheetId: number;
  sheetTitle: string;
  spreadsheetTitle: string;
}

export async function validateEmployeeSheet(
  prefs: EmployeeSheetPrefs,
  accessToken: string
): Promise<ValidatedSheet> {
  if (!prefs.taskLogUrl.trim() || !prefs.activeSheetName.trim()) {
    throw new Error(
      "Both the Task-log workbook URL and the Active task tab are required."
    );
  }

  const metadata = await fetchSpreadsheetMetadata(
    prefs.taskLogUrl,
    accessToken
  );
  const target = metadata.sheets.find(
    (sheet) =>
      sheet.title.trim().toLowerCase() ===
      prefs.activeSheetName.trim().toLowerCase()
  );

  if (!target) {
    const available =
      metadata.sheets.map((sheet) => sheet.title).join(", ") || "(none)";
    throw new SheetsError(
      "notFound",
      `The tab "${prefs.activeSheetName}" was not found in this spreadsheet. Available tabs: ${available}.`,
      {
        context: {
          operation: "validateEmployeeSheet",
          spreadsheetId: metadata.spreadsheetId,
          sheetName: prefs.activeSheetName
        }
      }
    );
  }

  return {
    spreadsheetId: metadata.spreadsheetId,
    sheetId: target.sheetId,
    sheetTitle: target.title,
    spreadsheetTitle: metadata.spreadsheetTitle
  };
}

export async function getHeaderRow(
  spreadsheetId: string,
  sheetName: string,
  accessToken: string
): Promise<{
  headers: string[];
  index: Record<string, number>;
  resolveField: (
    columnMap?: EmployeeSheetColumnMap
  ) => Partial<Record<TaskFieldKey, number>>;
}> {
  const headerRows = await getValuesForSheet(
    spreadsheetId,
    sheetName,
    "1:1",
    accessToken
  );
  const headers = headerRows[0] ?? [];
  if (headers.length === 0) {
    throw new SheetsError("schema", "The Active task tab does not contain a header row.", {
      context: {
        operation: "readTaskHeaders",
        spreadsheetId,
        sheetName
      }
    });
  }
  return {
    headers,
    index: headerIndex(headers),
    resolveField: (columnMap) =>
      resolveTaskFieldIndices(headers, columnMap)
  };
}

export interface SheetHeaderAnalysis {
  spreadsheetId: string;
  sheetId: number;
  sheetTitle: string;
  spreadsheetTitle: string;
  headers: string[];
  inferredMap: EmployeeSheetColumnMap;
  unmappedFields: TaskFieldKey[];
}

export async function analyzeEmployeeSheetHeaders(
  prefs: EmployeeSheetPrefs,
  accessToken: string
): Promise<SheetHeaderAnalysis> {
  const validated = await validateEmployeeSheet(prefs, accessToken);
  const { headers } = await getHeaderRow(
    validated.spreadsheetId,
    validated.sheetTitle,
    accessToken
  );

  const indices = resolveTaskFieldIndices(headers);
  const inferredMap: EmployeeSheetColumnMap = {};
  const unmappedFields: TaskFieldKey[] = [];
  for (const field of TASK_FIELDS) {
    const index = indices[field.key];
    if (index === undefined) {
      unmappedFields.push(field.key);
      continue;
    }
    inferredMap[field.key] = {
      mode: "existing",
      header: String(headers[index] ?? "").trim() || field.defaultHeader
    };
  }

  return {
    spreadsheetId: validated.spreadsheetId,
    sheetId: validated.sheetId,
    sheetTitle: validated.sheetTitle,
    spreadsheetTitle: validated.spreadsheetTitle,
    headers,
    inferredMap,
    unmappedFields
  };
}

export interface AppendedHeader {
  field: TaskFieldKey;
  header: string;
  columnIndex: number;
}

export interface InsertHeaderRequest {
  field: TaskFieldKey;
  header: string;
  position: { mode: "end" } | { mode: "after"; afterHeader: string };
}

export async function insertHeadersInSheet(
  spreadsheetId: string,
  sheetId: number,
  sheetName: string,
  accessToken: string,
  insertions: InsertHeaderRequest[]
): Promise<{ headers: string[]; appended: AppendedHeader[] }> {
  if (insertions.length === 0) {
    const { headers } = await getHeaderRow(
      spreadsheetId,
      sheetName,
      accessToken
    );
    return { headers, appended: [] };
  }

  const headerRows = await getValuesForSheet(
    spreadsheetId,
    sheetName,
    "1:1",
    accessToken
  );
  const headers = [...(headerRows[0] ?? [])];
  const appended: AppendedHeader[] = [];
  const pending: InsertHeaderRequest[] = [];

  for (const insertion of insertions) {
    const targetNormalized = normalizeHeader(insertion.header);
    const existingIndex = targetNormalized
      ? headers.findIndex(
          (header) => normalizeHeader(header ?? "") === targetNormalized
        )
      : -1;
    if (existingIndex >= 0) {
      appended.push({
        field: insertion.field,
        header:
          String(headers[existingIndex] ?? insertion.header).trim() ||
          insertion.header,
        columnIndex: existingIndex
      });
      continue;
    }
    pending.push(insertion);
  }

  for (const insertion of pending) {
    let insertAt: number;
    if (insertion.position.mode === "end") {
      insertAt = headers.length;
    } else {
      const target = normalizeHeader(insertion.position.afterHeader);
      const matched = headers.findIndex(
        (header) => normalizeHeader(header ?? "") === target
      );
      insertAt = matched >= 0 ? matched + 1 : headers.length;
    }

    if (insertAt >= headers.length) {
      const targetIndex = headers.length;
      const range = `${columnLetter(targetIndex + 1)}1`;
      await requestSheets(
        `${SHEETS_API_ROOT}/${spreadsheetId}/values/${encodeSheetRange(
          sheetName,
          range
        )}?valueInputOption=USER_ENTERED`,
        accessToken,
        {
          method: "PUT",
          body: JSON.stringify({ values: [[insertion.header]] })
        }
      );
      headers.push(insertion.header);
      appended.push({
        field: insertion.field,
        header: insertion.header,
        columnIndex: targetIndex
      });
      continue;
    }

    await requestSheets(
      `${SHEETS_API_ROOT}/${spreadsheetId}:batchUpdate`,
      accessToken,
      {
        method: "POST",
        body: JSON.stringify({
          requests: [
            {
              insertDimension: {
                range: {
                  sheetId,
                  dimension: "COLUMNS",
                  startIndex: insertAt,
                  endIndex: insertAt + 1
                },
                inheritFromBefore: insertAt > 0
              }
            }
          ]
        })
      }
    );

    const range = `${columnLetter(insertAt + 1)}1`;
    await requestSheets(
      `${SHEETS_API_ROOT}/${spreadsheetId}/values/${encodeSheetRange(
        sheetName,
        range
      )}?valueInputOption=USER_ENTERED`,
      accessToken,
      {
        method: "PUT",
        body: JSON.stringify({ values: [[insertion.header]] })
      }
    );
    headers.splice(insertAt, 0, insertion.header);

    for (const previous of appended) {
      if (previous.columnIndex >= insertAt) previous.columnIndex += 1;
    }
    appended.push({
      field: insertion.field,
      header: insertion.header,
      columnIndex: insertAt
    });
  }

  return { headers, appended };
}
