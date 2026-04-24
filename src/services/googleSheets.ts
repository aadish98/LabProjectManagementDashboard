import type { AppConfig, EmployeeSheetPrefs, UserSession } from "../domain/app";
import type {
  DashboardDataset,
  ExperimentDraft,
  ExperimentRecord,
  FeedbackThread,
  RoleDirectoryEntry,
  RunLogEntry,
  SheetRegistryEntry
} from "../domain/experiment";
import {
  getDatasetCacheKey,
  readDatasetCache,
  writeDatasetCache
} from "./cache";

const SHEETS_API_ROOT = "https://sheets.googleapis.com/v4/spreadsheets";

export const GOOGLE_SHEETS_SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile"
].join(" ");

type SheetsValueResponse = {
  values?: string[][];
};

export class GoogleSheetsAuthError extends Error {
  constructor() {
    super("Google needs a fresh sign-in to continue.");
    this.name = "GoogleSheetsAuthError";
  }
}

export function isGoogleSheetsAuthError(error: unknown): error is GoogleSheetsAuthError {
  return error instanceof GoogleSheetsAuthError;
}

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function safeCell(row: string[] | undefined, index: number | undefined): string {
  if (!row || index === undefined) return "";
  return String(row[index] ?? "").trim();
}

function headerIndex(headers: string[]): Record<string, number> {
  return headers.reduce<Record<string, number>>((accumulator, header, index) => {
    accumulator[normalizeHeader(header)] = index;
    return accumulator;
  }, {});
}

function encodeSheetRange(sheetName: string, range: string): string {
  const escapedSheetName = sheetName.replace(/'/g, "''");
  return encodeURIComponent(`'${escapedSheetName}'!${range}`);
}

export function extractIdFromUrl(urlOrId: string): string {
  const match = urlOrId.match(/\/d\/([a-zA-Z0-9-_]+)/);
  return match?.[1] ?? urlOrId.trim();
}

function columnLetter(columnNumber: number): string {
  let current = columnNumber;
  let output = "";

  while (current > 0) {
    const remainder = (current - 1) % 26;
    output = String.fromCharCode(65 + remainder) + output;
    current = Math.floor((current - remainder) / 26);
  }

  return output;
}

async function requestSheets<T>(
  url: string,
  accessToken: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    const body = await response.text();
    if (
      response.status === 401 ||
      body.includes('"status": "UNAUTHENTICATED"') ||
      body.toLowerCase().includes("invalid authentication credentials")
    ) {
      throw new GoogleSheetsAuthError();
    }
    throw new Error(body || `Sheets request failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return (await response.json()) as T;
}

async function getValuesForSheet(
  spreadsheetId: string,
  sheetName: string,
  range: string,
  accessToken: string
): Promise<string[][]> {
  const response = await requestSheets<SheetsValueResponse>(
    `${SHEETS_API_ROOT}/${spreadsheetId}/values/${encodeSheetRange(sheetName, range)}`,
    accessToken
  );
  return response.values ?? [];
}

async function getOptionalValuesForSheet(
  spreadsheetId: string,
  sheetName: string,
  range: string,
  accessToken: string
): Promise<string[][]> {
  try {
    return await getValuesForSheet(spreadsheetId, sheetName, range, accessToken);
  } catch (error) {
    if (isGoogleSheetsAuthError(error)) throw error;
    return [];
  }
}

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
    throw new Error("That doesn't look like a valid Google Sheets URL or ID.");
  }

  const response = await requestSheets<{
    spreadsheetId: string;
    properties?: { title?: string };
    sheets?: Array<{ properties?: { sheetId?: number; title?: string } }>;
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
    throw new Error("Both the task log URL and the active sheet/tab name are required.");
  }

  const metadata = await fetchSpreadsheetMetadata(prefs.taskLogUrl, accessToken);
  const target = metadata.sheets.find(
    (sheet) =>
      sheet.title.trim().toLowerCase() === prefs.activeSheetName.trim().toLowerCase()
  );

  if (!target) {
    const available = metadata.sheets.map((sheet) => sheet.title).join(", ") || "(none)";
    throw new Error(
      `The tab "${prefs.activeSheetName}" was not found in this spreadsheet. Available tabs: ${available}.`
    );
  }

  return {
    spreadsheetId: metadata.spreadsheetId,
    sheetId: target.sheetId,
    sheetTitle: target.title,
    spreadsheetTitle: metadata.spreadsheetTitle
  };
}

function parseRegistry(rows: string[][]): SheetRegistryEntry[] {
  const headers = rows[0] ?? [];
  const index = headerIndex(headers);

  return rows.slice(1)
    .map((row) => ({
      labMember: safeCell(row, index.labmember),
      taskLogUrl: safeCell(row, index.tasklogurl),
      activeSheetName: safeCell(row, index.activesheet),
      active: ["true", "yes", "y", "1"].includes(safeCell(row, index.active).toLowerCase()),
      profilePictureUrl:
        safeCell(row, index.profilepictureurl) ||
        safeCell(row, index.photourl) ||
        safeCell(row, index.pictureurl) ||
        safeCell(row, index.profileurl) ||
        undefined
    }))
    .filter((entry) => entry.labMember && entry.taskLogUrl && entry.activeSheetName);
}

function parseRunLog(rows: string[][]): RunLogEntry[] {
  const headers = rows[0] ?? [];
  const index = headerIndex(headers);

  return rows.slice(1)
    .map((row) => ({
      timestamp: safeCell(row, index.timestamp),
      labMember: safeCell(row, index.labmember),
      taskLogUrl: safeCell(row, index.tasklogurl),
      status: safeCell(row, index.status),
      note: safeCell(row, index.note)
    }))
    .filter((row) => row.timestamp || row.labMember || row.note);
}

function parseFeedback(rows: string[][]): FeedbackThread[] {
  const headers = rows[0] ?? [];

  return rows.slice(1)
    .map((row) => {
      const labMember = String(row[0] ?? "").trim();
      const entries = headers
        .slice(1)
        .map((header, index) => ({
          runAt: String(header ?? "").trim(),
          message: String(row[index + 1] ?? "").trim()
        }))
        .filter((entry) => entry.runAt && entry.message);

      return {
        labMember,
        entries
      };
    })
    .filter((thread) => thread.labMember);
}

function parseRoles(rows: string[][]): RoleDirectoryEntry[] {
  const headers = rows[0] ?? [];
  const index = headerIndex(headers);

  return rows.slice(1)
    .map((row) => {
      const role = safeCell(row, index.role).toLowerCase();
      if (role !== "manager" && role !== "employee") return null;

      return {
        email: safeCell(row, index.email).toLowerCase(),
        role,
        labMember: safeCell(row, index.labmember) || undefined
      } as RoleDirectoryEntry;
    })
    .filter((entry): entry is RoleDirectoryEntry => !!entry && !!entry.email);
}

function parseExperimentRows(
  entry: SheetRegistryEntry,
  rows: string[][]
): ExperimentRecord[] {
  const headers = rows[0] ?? [];
  const index = headerIndex(headers);

  const fieldIndex = {
    project: index.project,
    experiment: index.experiment,
    timeEstimate: index.timeestimate,
    startDateRaw: index.startdate,
    projectedEndDateRaw: index.projectedenddate ?? index.enddate,
    status: index.status,
    schematic: index.schematic ?? index.analysispipelineschema,
    result: index.result,
    dataLink: index.linktodata,
    comments: index.commentsimprovements,
    notebookLocation: index.notebooklocation
  };

  const parsedRecords: Array<ExperimentRecord | null> = rows.slice(1).map((row, rowOffset) => {
    const cells = Object.values(fieldIndex).map((columnIndex) => safeCell(row, columnIndex));
    const isBlank = cells.every((cell) => !cell);
    if (isBlank) return null;

    const rowNumber = rowOffset + 2;
    const record: ExperimentRecord = {
      id: `${entry.labMember}-${entry.activeSheetName}-${rowNumber}`,
      rowNumber,
      labMember: entry.labMember,
      taskLogUrl: entry.taskLogUrl,
      activeSheetName: entry.activeSheetName,
      project: safeCell(row, fieldIndex.project),
      experiment: safeCell(row, fieldIndex.experiment),
      schematic: safeCell(row, fieldIndex.schematic),
      timeEstimate: safeCell(row, fieldIndex.timeEstimate),
      startDateRaw: safeCell(row, fieldIndex.startDateRaw),
      projectedEndDateRaw: safeCell(row, fieldIndex.projectedEndDateRaw),
      status: safeCell(row, fieldIndex.status),
      result: safeCell(row, fieldIndex.result),
      dataLink: safeCell(row, fieldIndex.dataLink),
      notebookLocation: safeCell(row, fieldIndex.notebookLocation),
      comments: safeCell(row, fieldIndex.comments)
    };

    return record;
  });

  return parsedRecords.filter((record): record is ExperimentRecord => record !== null);
}

function buildRowValues(headers: string[], draft: ExperimentDraft): string[] {
  const valuesByHeader: Record<string, string> = {
    project: draft.project,
    experiment: draft.experiment,
    timeestimate: draft.timeEstimate,
    startdate: draft.startDateRaw,
    projectedenddate: draft.projectedEndDateRaw,
    enddate: draft.projectedEndDateRaw,
    status: draft.status,
    schematic: draft.schematic,
    analysispipelineschema: draft.schematic,
    result: draft.result,
    linktodata: draft.dataLink,
    commentsimprovements: draft.comments,
    notebooklocation: draft.notebookLocation
  };

  return headers.map((header) => valuesByHeader[normalizeHeader(header)] ?? "");
}

async function getHeaderRow(
  spreadsheetId: string,
  sheetName: string,
  accessToken: string
): Promise<{ headers: string[]; index: Record<string, number> }> {
  const headerRows = await getValuesForSheet(spreadsheetId, sheetName, "1:1", accessToken);
  const headers = headerRows[0] ?? [];
  if (headers.length === 0) {
    throw new Error("The active sheet does not contain a header row.");
  }
  return { headers, index: headerIndex(headers) };
}

export async function loadGoogleSheetsDataset(
  config: AppConfig,
  session: UserSession
): Promise<DashboardDataset> {
  const adminSpreadsheetId = extractIdFromUrl(config.adminSpreadsheetId);
  if (!adminSpreadsheetId) {
    throw new Error("Add an admin spreadsheet ID or URL in Setup.");
  }
  if (!session.accessToken) {
    throw new GoogleSheetsAuthError();
  }

  const cacheKey = getDatasetCacheKey(adminSpreadsheetId);

  try {
    const [registryRows, runLogRows, feedbackRows, rolesRows] = await Promise.all([
      getValuesForSheet(adminSpreadsheetId, config.sheetRegistryName, "A:Z", session.accessToken),
      getOptionalValuesForSheet(adminSpreadsheetId, config.runLogSheetName, "A:Z", session.accessToken),
      getOptionalValuesForSheet(adminSpreadsheetId, config.feedbackSheetName, "A:Z", session.accessToken),
      getOptionalValuesForSheet(adminSpreadsheetId, config.rolesSheetName, "A:Z", session.accessToken)
    ]);

    const registryEntries = parseRegistry(registryRows).filter((entry) => entry.active);
    const experiments = (
      await Promise.all(
        registryEntries.map(async (entry) => {
          const spreadsheetId = extractIdFromUrl(entry.taskLogUrl);
          const rows = await getValuesForSheet(
            spreadsheetId,
            entry.activeSheetName,
            "A:Z",
            session.accessToken as string
          );
          return parseExperimentRows(entry, rows);
        })
      )
    ).flat();

    const dataset: DashboardDataset = {
      source: "googleSheets",
      registry: registryEntries,
      experiments,
      runLog: parseRunLog(runLogRows),
      feedbackThreads: parseFeedback(feedbackRows),
      roleDirectory: parseRoles(rolesRows),
      lastSyncedAt: new Date().toISOString()
    };

    writeDatasetCache(cacheKey, dataset);
    return dataset;
  } catch (error) {
    if (isGoogleSheetsAuthError(error)) throw error;

    const cached = readDatasetCache(cacheKey);
    if (cached) {
      return {
        ...cached,
        syncNote: `Showing cached data because live sync failed: ${
          error instanceof Error ? error.message : "unknown error"
        }`
      };
    }

    throw error;
  }
}

export async function loadEmployeeDataset(
  prefs: EmployeeSheetPrefs,
  labMember: string,
  session: UserSession
): Promise<DashboardDataset> {
  if (!session.accessToken) {
    throw new GoogleSheetsAuthError();
  }

  const validated = await validateEmployeeSheet(prefs, session.accessToken);
  const rows = await getValuesForSheet(
    validated.spreadsheetId,
    validated.sheetTitle,
    "A:Z",
    session.accessToken
  );

  const entry: SheetRegistryEntry = {
    labMember: labMember || session.name || session.email,
    taskLogUrl: prefs.taskLogUrl,
    activeSheetName: validated.sheetTitle,
    active: true
  };

  return {
    source: "googleSheets",
    registry: [entry],
    experiments: parseExperimentRows(entry, rows),
    runLog: [],
    feedbackThreads: [],
    roleDirectory: [],
    lastSyncedAt: new Date().toISOString()
  };
}

export async function createTaskInSheet(
  prefs: EmployeeSheetPrefs,
  session: UserSession,
  draft: ExperimentDraft
): Promise<void> {
  if (!session.accessToken) {
    throw new GoogleSheetsAuthError();
  }

  const spreadsheetId = extractIdFromUrl(prefs.taskLogUrl);
  const { headers } = await getHeaderRow(spreadsheetId, prefs.activeSheetName, session.accessToken);
  const rowValues = buildRowValues(headers, draft);

  await requestSheets(
    `${SHEETS_API_ROOT}/${spreadsheetId}/values/${encodeSheetRange(
      prefs.activeSheetName,
      "A:Z"
    )}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    session.accessToken,
    {
      method: "POST",
      body: JSON.stringify({ values: [rowValues] })
    }
  );
}

export async function updateTaskInSheet(
  prefs: EmployeeSheetPrefs,
  session: UserSession,
  rowNumber: number,
  draft: ExperimentDraft
): Promise<void> {
  if (!session.accessToken) {
    throw new GoogleSheetsAuthError();
  }

  const spreadsheetId = extractIdFromUrl(prefs.taskLogUrl);
  const { headers } = await getHeaderRow(spreadsheetId, prefs.activeSheetName, session.accessToken);
  const rowValues = buildRowValues(headers, draft);
  const endColumn = columnLetter(headers.length);

  await requestSheets(
    `${SHEETS_API_ROOT}/${spreadsheetId}/values/${encodeSheetRange(
      prefs.activeSheetName,
      `A${rowNumber}:${endColumn}${rowNumber}`
    )}?valueInputOption=USER_ENTERED`,
    session.accessToken,
    {
      method: "PUT",
      body: JSON.stringify({ values: [rowValues] })
    }
  );
}

export interface CompletionPayload {
  rowNumber: number;
  result: string;
  dataLink: string;
  schematic: string;
}

export async function completeTaskInSheet(
  prefs: EmployeeSheetPrefs,
  session: UserSession,
  payload: CompletionPayload
): Promise<void> {
  if (!session.accessToken) {
    throw new GoogleSheetsAuthError();
  }

  const spreadsheetId = extractIdFromUrl(prefs.taskLogUrl);
  const accessToken = session.accessToken;
  const { index } = await getHeaderRow(spreadsheetId, prefs.activeSheetName, accessToken);

  const updates: Array<{ column: number; value: string }> = [];
  if (index.status !== undefined) updates.push({ column: index.status, value: "Complete" });
  if (index.result !== undefined) updates.push({ column: index.result, value: payload.result });
  if (index.linktodata !== undefined)
    updates.push({ column: index.linktodata, value: payload.dataLink });
  const schematicCol = index.schematic ?? index.analysispipelineschema;
  if (schematicCol !== undefined)
    updates.push({ column: schematicCol, value: payload.schematic });

  if (updates.length === 0) return;

  const data = updates.map((update) => ({
    range: `'${prefs.activeSheetName.replace(/'/g, "''")}'!${columnLetter(update.column + 1)}${
      payload.rowNumber
    }`,
    values: [[update.value]]
  }));

  await requestSheets(
    `${SHEETS_API_ROOT}/${spreadsheetId}/values:batchUpdate`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({ valueInputOption: "USER_ENTERED", data })
    }
  );
}

export interface OverdueResolution {
  rowNumber: number;
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

function buildAppendedStruckCell(existing: string, addition: string): RichTextCell {
  const trimmedAddition = addition.trim();
  const trimmedExisting = existing.trim();
  if (!trimmedExisting) {
    return {
      text: trimmedAddition,
      runs: [{ startIndex: 0, format: { strikethrough: false } }]
    };
  }
  const text = `${existing}\n${trimmedAddition}`;
  return {
    text,
    runs: [
      { startIndex: 0, format: { strikethrough: true } },
      { startIndex: existing.length + 1, format: { strikethrough: false } }
    ]
  };
}

export async function resolveOverdueTaskInSheet(
  prefs: EmployeeSheetPrefs,
  session: UserSession,
  resolution: OverdueResolution
): Promise<void> {
  if (!session.accessToken) {
    throw new GoogleSheetsAuthError();
  }

  const accessToken = session.accessToken;
  const metadata = await fetchSpreadsheetMetadata(prefs.taskLogUrl, accessToken);
  const spreadsheetId = metadata.spreadsheetId;

  const targetSheet = metadata.sheets.find(
    (sheet) =>
      sheet.title.trim().toLowerCase() === prefs.activeSheetName.trim().toLowerCase()
  );
  if (!targetSheet) {
    throw new Error(`Tab "${prefs.activeSheetName}" no longer exists in the spreadsheet.`);
  }

  const { headers, index } = await getHeaderRow(
    spreadsheetId,
    targetSheet.title,
    accessToken
  );

  const projectedEndCol = index.projectedenddate ?? index.enddate;
  const timeEstimateCol = index.timeestimate;
  const commentsCol = index.commentsimprovements;

  if (projectedEndCol === undefined || timeEstimateCol === undefined) {
    throw new Error(
      "Could not locate the projected end date or time estimate column in this sheet."
    );
  }

  const endColumn = columnLetter(headers.length);
  const rowRange = `A${resolution.rowNumber}:${endColumn}${resolution.rowNumber}`;
  const rowValues = await getValuesForSheet(
    spreadsheetId,
    targetSheet.title,
    rowRange,
    accessToken
  );
  const currentRow = rowValues[0] ?? [];
  const currentProjectedEnd = String(currentRow[projectedEndCol] ?? "");
  const currentTimeEstimate = String(currentRow[timeEstimateCol] ?? "");
  const currentComments =
    commentsCol !== undefined ? String(currentRow[commentsCol] ?? "") : "";

  const projectedEndCell = buildAppendedStruckCell(
    currentProjectedEnd,
    resolution.newProjectedEndDate
  );
  const timeEstimateCell = buildAppendedStruckCell(
    currentTimeEstimate,
    resolution.newTimeEstimate
  );

  const stamp = new Date().toISOString().slice(0, 10);
  const commentLine = `[${stamp}] ${resolution.delayComment.trim()}`;
  const newComments = currentComments.trim()
    ? `${currentComments}\n${commentLine}`
    : commentLine;

  const requests: unknown[] = [
    {
      updateCells: {
        range: {
          sheetId: targetSheet.sheetId,
          startRowIndex: resolution.rowNumber - 1,
          endRowIndex: resolution.rowNumber,
          startColumnIndex: projectedEndCol,
          endColumnIndex: projectedEndCol + 1
        },
        rows: [
          {
            values: [
              {
                userEnteredValue: { stringValue: projectedEndCell.text },
                userEnteredFormat: { wrapStrategy: "WRAP" },
                textFormatRuns: projectedEndCell.runs
              }
            ]
          }
        ],
        fields:
          "userEnteredValue,userEnteredFormat.wrapStrategy,textFormatRuns"
      }
    },
    {
      updateCells: {
        range: {
          sheetId: targetSheet.sheetId,
          startRowIndex: resolution.rowNumber - 1,
          endRowIndex: resolution.rowNumber,
          startColumnIndex: timeEstimateCol,
          endColumnIndex: timeEstimateCol + 1
        },
        rows: [
          {
            values: [
              {
                userEnteredValue: { stringValue: timeEstimateCell.text },
                userEnteredFormat: { wrapStrategy: "WRAP" },
                textFormatRuns: timeEstimateCell.runs
              }
            ]
          }
        ],
        fields:
          "userEnteredValue,userEnteredFormat.wrapStrategy,textFormatRuns"
      }
    }
  ];

  if (commentsCol !== undefined) {
    requests.push({
      updateCells: {
        range: {
          sheetId: targetSheet.sheetId,
          startRowIndex: resolution.rowNumber - 1,
          endRowIndex: resolution.rowNumber,
          startColumnIndex: commentsCol,
          endColumnIndex: commentsCol + 1
        },
        rows: [
          {
            values: [
              {
                userEnteredValue: { stringValue: newComments },
                userEnteredFormat: { wrapStrategy: "WRAP" }
              }
            ]
          }
        ],
        fields: "userEnteredValue,userEnteredFormat.wrapStrategy"
      }
    });
  }

  await requestSheets(
    `${SHEETS_API_ROOT}/${spreadsheetId}:batchUpdate`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({ requests })
    }
  );
}
