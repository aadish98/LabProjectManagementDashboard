import { getValuesForSheet, requestSheets, SHEETS_API_ROOT } from "../client";
import { SheetRevisionConflictError } from "../errors";
import { columnLetter, headerIndex, safeCell } from "../helpers";
import { registryRowToValues, roleRowToValues } from "./parsing";
import type {
  AdminTabResolution,
  AdminValueRange,
  MemberRoleMirrorUpdate,
  RegistryWriteRow
} from "./types";

export async function prepareRegistryUpsert(
  spreadsheetId: string,
  tab: AdminTabResolution,
  accessToken: string,
  row: RegistryWriteRow
): Promise<AdminValueRange[]> {
  const rows = await getValuesForSheet(
    spreadsheetId,
    tab.title,
    "A:Z",
    accessToken
  );
  const index = headerIndex(rows[0] ?? []);
  const memberId = row.memberId.trim();
  if (!memberId) {
    throw new Error("A stable Member ID is required for a registry update.");
  }
  const matches = rows.slice(1).flatMap((current, offset) =>
    safeCell(current, index.memberid) === memberId
      ? [{ rowNumber: offset + 2, current }]
      : []
  );
  if (matches.length > 1) {
    throw revisionConflict(
      "Duplicate SheetRegistry member IDs make this update ambiguous.",
      spreadsheetId,
      tab.title,
      memberId,
      row.expectedRevision,
      undefined,
      { duplicateRows: matches.map((match) => match.rowNumber) }
    );
  }
  const match = matches[0];
  const currentRevision = match
    ? parseSheetRevision(safeCell(match.current, index.revision))
    : 0;
  const targetRevision = row.revision ?? currentRevision + 1;
  const nextValues = registryRowToValues({ ...row, revision: targetRevision });
  if (match && rowsEqual(match.current, nextValues)) return [];
  assertSheetRevision({
    spreadsheetId,
    sheetName: tab.title,
    memberId,
    expectedRevision: row.expectedRevision,
    currentRevision,
    targetRevision,
    currentRecord: match
      ? registryRecordFromRow(match.current, index)
      : undefined
  });
  return [{
    range: sheetRowRange(
      tab.title,
      match?.rowNumber ?? rows.length + 1,
      nextValues.length
    ),
    values: [nextValues]
  }];
}

export async function prepareMemberRoleSync(
  spreadsheetId: string,
  tab: AdminTabResolution,
  accessToken: string,
  update: MemberRoleMirrorUpdate
): Promise<AdminValueRange[]> {
  const allRows = await getValuesForSheet(
    spreadsheetId,
    tab.title,
    "A:Z",
    accessToken
  );
  const index = headerIndex(allRows[0] ?? []);
  const memberId = update.memberId.trim();
  if (!memberId) {
    throw new Error("A stable Member ID is required for an Access role update.");
  }
  const existing = allRows.slice(1).flatMap((current, offset) =>
    safeCell(current, index.memberid) === memberId
      ? [{
          rowNumber: offset + 2,
          current,
          role: safeCell(current, index.role).toLowerCase()
        }]
      : []
  );
  const duplicateRoles = existing
    .map((entry) => entry.role)
    .filter((role, position, roles) => role && roles.indexOf(role) !== position);
  if (duplicateRoles.length > 0) {
    throw revisionConflict(
      "Duplicate Access role rows make this Member update ambiguous.",
      spreadsheetId,
      tab.title,
      memberId,
      update.expectedRevision,
      undefined,
      { duplicateRoles }
    );
  }
  const currentRevision = Math.max(
    0,
    ...existing.map((entry) =>
      parseSheetRevision(safeCell(entry.current, index.revision))
    )
  );
  const targetRevision = update.revision ?? currentRevision + 1;
  const desiredByRole = new Map(update.rows.map((row) => [row.role, row]));
  const data: AdminValueRange[] = [];
  let nextRowNumber = allRows.length + 1;
  for (const role of ["employee", "manager", "pi"] as const) {
    const desired = desiredByRole.get(role);
    const prior = existing.find((entry) => entry.role === role);
    if (!desired && !prior) continue;
    const source = desired ?? {
      memberId,
      email: safeCell(prior!.current, index.email),
      role,
      labMember: safeCell(prior!.current, index.labmember),
      active: false
    };
    const values = roleRowToValues({
      ...source,
      memberId,
      role,
      active: !!desired && desired.active !== false,
      revision: targetRevision
    });
    if (prior && rowsEqual(prior.current, values)) continue;
    data.push({
      range: sheetRowRange(
        tab.title,
        prior?.rowNumber ?? nextRowNumber++,
        values.length
      ),
      values: [values]
    });
  }
  if (data.length === 0) return [];
  assertSheetRevision({
    spreadsheetId,
    sheetName: tab.title,
    memberId,
    expectedRevision: update.expectedRevision,
    currentRevision,
    targetRevision,
    currentRecord: {
      memberId,
      roles: existing.map((entry) => roleRecordFromRow(entry.current, index))
    }
  });
  return data;
}

type HeaderLookup = ReturnType<typeof headerIndex>;

function parseSheetRevision(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function rowsEqual(current: string[], expected: string[]): boolean {
  return expected.every((value, index) => safeCell(current, index) === value);
}

function registryRecordFromRow(
  row: string[],
  index: HeaderLookup
): Record<string, unknown> {
  return {
    memberId: safeCell(row, index.memberid),
    labMember: safeCell(row, index.labmember),
    taskLogUrl: safeCell(row, index.tasklogurl),
    activeSheetName: safeCell(row, index.activesheet),
    active: safeCell(row, index.active),
    revision: parseSheetRevision(safeCell(row, index.revision))
  };
}

function roleRecordFromRow(
  row: string[],
  index: HeaderLookup
): Record<string, unknown> {
  return {
    memberId: safeCell(row, index.memberid),
    email: safeCell(row, index.email),
    role: safeCell(row, index.role),
    labMember: safeCell(row, index.labmember),
    active: safeCell(row, index.active),
    revision: parseSheetRevision(safeCell(row, index.revision))
  };
}

function assertSheetRevision(input: {
  spreadsheetId: string;
  sheetName: string;
  memberId: string;
  expectedRevision?: number;
  currentRevision: number;
  targetRevision: number;
  currentRecord?: Record<string, unknown>;
}): void {
  const expectedMismatch =
    input.expectedRevision !== undefined &&
    input.currentRevision !== input.expectedRevision;
  const targetIsStale = input.currentRevision > input.targetRevision;
  const targetCollides =
    input.currentRevision === input.targetRevision && input.currentRevision !== 0;
  if (!expectedMismatch && !targetIsStale && !targetCollides) return;
  throw revisionConflict(
    "The compatibility Sheet row changed after it was loaded.",
    input.spreadsheetId,
    input.sheetName,
    input.memberId,
    input.expectedRevision ?? input.targetRevision - 1,
    input.currentRevision,
    input.currentRecord
  );
}

function revisionConflict(
  message: string,
  spreadsheetId: string,
  sheetName: string,
  memberId: string,
  expectedRevision: number | undefined,
  currentRevision: number | undefined,
  currentRecord?: Record<string, unknown>
): SheetRevisionConflictError {
  return new SheetRevisionConflictError(message, {
    operation: "optimisticSheetUpsert",
    spreadsheetId,
    sheetName,
    memberId,
    expectedRevision,
    currentRevision,
    currentRecord: currentRecord ?? { memberId }
  });
}

function sheetRowRange(
  tabTitle: string,
  rowNumber: number,
  columnCount: number
): string {
  const escaped = tabTitle.replace(/'/g, "''");
  return `'${escaped}'!A${rowNumber}:${columnLetter(columnCount)}${rowNumber}`;
}

export async function writeAdminValueRanges(
  spreadsheetId: string,
  accessToken: string,
  data: AdminValueRange[],
  operation: string,
  sheetName: string,
  memberId: string
): Promise<void> {
  await requestSheets(
    `${SHEETS_API_ROOT}/${spreadsheetId}/values:batchUpdate`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({ valueInputOption: "USER_ENTERED", data })
    },
    { operation, spreadsheetId, sheetName, memberId }
  );
}
