import type { EmployeeSheetColumnMap } from "../../../domain/app";
import type {
  ExperimentRecord,
  FeedbackThread,
  RunLogEntry,
  SheetRegistryEntry
} from "../../../domain/experiment";
import {
  headerIndex,
  resolveTaskFieldIndices,
  safeCell
} from "../helpers";
import {
  parseTaskRevision,
  taskIdColumnIndex,
  taskRevisionColumnIndex
} from "./rowMapping";

export function parseRunLog(rows: string[][]): RunLogEntry[] {
  const index = headerIndex(rows[0] ?? []);
  return rows
    .slice(1)
    .map((row) => {
      const changedFieldsRaw = safeCell(row, index.changedfields);
      let changedFields: string[] | undefined;
      try {
        const parsed = changedFieldsRaw ? JSON.parse(changedFieldsRaw) : undefined;
        if (Array.isArray(parsed)) {
          changedFields = parsed.filter(
            (value): value is string => typeof value === "string"
          );
        }
      } catch {
        changedFields = changedFieldsRaw
          ? changedFieldsRaw
              .split(",")
              .map((field) => field.trim())
              .filter(Boolean)
          : undefined;
      }
      return {
        timestamp: safeCell(row, index.timestamp),
        labMember: safeCell(row, index.labmember),
        taskLogUrl: safeCell(row, index.tasklogurl),
        status: safeCell(row, index.status),
        note: safeCell(row, index.note),
        actorEmail: safeCell(row, index.actoremail) || undefined,
        memberId: safeCell(row, index.memberid) || undefined,
        taskId: safeCell(row, index.taskid) || undefined,
        workbook: safeCell(row, index.workbook) || undefined,
        action: safeCell(row, index.action) || undefined,
        changedFields
      };
    })
    .filter((row) => row.timestamp || row.labMember || row.note);
}

export function parseFeedback(rows: string[][]): FeedbackThread[] {
  const headers = rows[0] ?? [];
  return rows
    .slice(1)
    .map((row) => {
      const labMember = String(row[0] ?? "").trim();
      const entries = headers
        .slice(1)
        .map((header, index) => ({
          runAt: String(header ?? "").trim(),
          message: String(row[index + 1] ?? "").trim()
        }))
        .filter((entry) => entry.runAt && entry.message);
      return { labMember, entries };
    })
    .filter((thread) => thread.labMember);
}

export function parseExperimentRows(
  entry: SheetRegistryEntry,
  rows: string[][],
  columnMap?: EmployeeSheetColumnMap,
  strictColumnMap = false
): ExperimentRecord[] {
  const headers = rows[0] ?? [];
  const fieldIndex = resolveTaskFieldIndices(headers, columnMap, {
    fallbackToAliases: !strictColumnMap
  });
  const parsedRecords: Array<ExperimentRecord | null> = rows
    .slice(1)
    .map((row, rowOffset) => {
      const cells = Object.values(fieldIndex).map((columnIndex) =>
        safeCell(row, columnIndex)
      );
      if (cells.every((cell) => !cell)) return null;
      const rowNumber = rowOffset + 2;
      const taskId = safeCell(row, taskIdColumnIndex(headers)) || undefined;
      const taskRevision = parseTaskRevision(
        row[taskRevisionColumnIndex(headers) ?? -1]
      );
      return {
        id:
          taskId ??
          `legacy:${entry.memberId ?? entry.labMember}:${entry.activeSheetName}:${rowNumber}`,
        taskId,
        taskRevision,
        memberId: entry.memberId,
        rowNumber,
        labMember: entry.labMember,
        taskLogUrl: entry.taskLogUrl,
        activeSheetName: entry.activeSheetName,
        project: safeCell(row, fieldIndex.project),
        experiment: safeCell(row, fieldIndex.experiment),
        schematic: safeCell(row, fieldIndex.schematic),
        timeEstimate: safeCell(row, fieldIndex.timeEstimate),
        startDateRaw: safeCell(row, fieldIndex.startDate),
        projectedEndDateRaw: safeCell(row, fieldIndex.projectedEndDate),
        status: safeCell(row, fieldIndex.status),
        result: safeCell(row, fieldIndex.result),
        dataLink: safeCell(row, fieldIndex.dataLink),
        notebookLocation: safeCell(row, fieldIndex.notebookLocation),
        comments: safeCell(row, fieldIndex.comments)
      };
    });
  return parsedRecords.filter(
    (record): record is ExperimentRecord => record !== null
  );
}
