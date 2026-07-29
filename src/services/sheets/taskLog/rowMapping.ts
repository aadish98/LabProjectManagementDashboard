import type {
  EmployeeSheetColumnMap,
  TaskFieldKey
} from "../../../domain/app";
import { TASK_FIELDS } from "../../../domain/app";
import type { ExperimentDraft } from "../../../domain/experiment";
import {
  createImmutableId,
  headerIndex,
  resolveTaskFieldIndices,
  safeCell
} from "../helpers";

export const TASK_ID_HEADER = "Task ID";
export const TASK_REVISION_HEADER = "Task Revision";

export function taskIdColumnIndex(headers: string[]): number | undefined {
  return headerIndex(headers).taskid;
}

export function taskRevisionColumnIndex(headers: string[]): number | undefined {
  return headerIndex(headers).taskrevision;
}

export function parseTaskRevision(value: unknown): number | undefined {
  const revision = Number(String(value ?? "").trim());
  return Number.isSafeInteger(revision) && revision >= 1 ? revision : undefined;
}

export function draftValueForField(
  field: TaskFieldKey,
  draft: ExperimentDraft
): string {
  switch (field) {
    case "project": return draft.project;
    case "experiment": return draft.experiment;
    case "timeEstimate": return draft.timeEstimate;
    case "startDate": return draft.startDateRaw;
    case "projectedEndDate": return draft.projectedEndDateRaw;
    case "status": return draft.status;
    case "schematic": return draft.schematic;
    case "result": return draft.result;
    case "dataLink": return draft.dataLink;
    case "comments": return draft.comments;
    case "notebookLocation": return draft.notebookLocation;
  }
}

export function buildRowValues(
  headers: string[],
  draft: ExperimentDraft,
  columnMap?: EmployeeSheetColumnMap,
  taskId = draft.taskId,
  strictColumnMap = false
): string[] {
  const indexByField = resolveTaskFieldIndices(headers, columnMap, {
    fallbackToAliases: !strictColumnMap
  });
  const fieldByIndex = new Map<number, TaskFieldKey>();
  for (const field of TASK_FIELDS) {
    const index = indexByField[field.key];
    if (index !== undefined && !fieldByIndex.has(index)) {
      fieldByIndex.set(index, field.key);
    }
  }
  const aliasOverrides = new Map<number, TaskFieldKey>();
  for (let index = 0; !strictColumnMap && index < headers.length; index++) {
    if (fieldByIndex.has(index)) continue;
    const normalized = headers[index]?.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!normalized) continue;
    const field = TASK_FIELDS.find((candidate) =>
      candidate.aliasTokens.includes(normalized)
    );
    if (field) aliasOverrides.set(index, field.key);
  }
  const taskIdIndex = taskIdColumnIndex(headers);
  return headers.map((_header, index) => {
    if (index === taskIdIndex) return taskId ?? "";
    const mapped = fieldByIndex.get(index) ?? aliasOverrides.get(index);
    return mapped ? draftValueForField(mapped, draft) : "";
  });
}

export interface ChangedTaskCell {
  column: number;
  value: string;
}

export function buildChangedTaskCellUpdates(
  headers: string[],
  currentRow: string[],
  draft: ExperimentDraft,
  columnMap?: EmployeeSheetColumnMap,
  strictColumnMap = false
): ChangedTaskCell[] {
  const nextRow = buildRowValues(
    headers,
    draft,
    columnMap,
    draft.taskId,
    strictColumnMap
  );
  const mapped = resolveTaskFieldIndices(headers, columnMap, {
    fallbackToAliases: !strictColumnMap
  });
  const writable = new Set<number>(
    Object.values(mapped).filter((index): index is number => index !== undefined)
  );
  for (let index = 0; !strictColumnMap && index < headers.length; index++) {
    if (writable.has(index) || index === taskIdColumnIndex(headers)) continue;
    const normalized = headers[index]?.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (
      normalized &&
      TASK_FIELDS.some((field) => field.aliasTokens.includes(normalized))
    ) {
      writable.add(index);
    }
  }
  return Array.from(writable)
    .sort((left, right) => left - right)
    .filter((column) => String(currentRow[column] ?? "") !== nextRow[column])
    .map((column) => ({ column, value: nextRow[column] ?? "" }));
}

export function buildTaskIdBackfill(
  rows: string[][],
  idFactory: () => string = () => createImmutableId("task"),
  columnMap?: EmployeeSheetColumnMap,
  strictColumnMap = false
): Array<{ rowNumber: number; taskId: string }> {
  const headers = rows[0] ?? [];
  const idColumn = taskIdColumnIndex(headers);
  if (idColumn === undefined) return [];
  const fieldIndices = resolveTaskFieldIndices(headers, columnMap, {
    fallbackToAliases: !strictColumnMap
  });
  const contentColumns = Object.values(fieldIndices).filter(
    (index): index is number => index !== undefined
  );
  return rows.slice(1).flatMap((row, offset) => {
    if (safeCell(row, idColumn)) return [];
    if (contentColumns.every((column) => !safeCell(row, column))) return [];
    return [{ rowNumber: offset + 2, taskId: idFactory() }];
  });
}

export interface TaskMetadataBackfill {
  rowNumber: number;
  taskId?: string;
  taskRevision?: number;
}

export function buildTaskMetadataBackfill(
  rows: string[][],
  idFactory: () => string = () => createImmutableId("task"),
  columnMap?: EmployeeSheetColumnMap,
  strictColumnMap = false
): TaskMetadataBackfill[] {
  const headers = rows[0] ?? [];
  const idColumn = taskIdColumnIndex(headers);
  const revisionColumn = taskRevisionColumnIndex(headers);
  if (idColumn === undefined || revisionColumn === undefined) return [];
  const fieldIndices = resolveTaskFieldIndices(headers, columnMap, {
    fallbackToAliases: !strictColumnMap
  });
  const contentColumns = Object.values(fieldIndices).filter(
    (index): index is number => index !== undefined
  );
  return rows.slice(1).flatMap((row, offset) => {
    if (contentColumns.every((column) => !safeCell(row, column))) return [];
    const taskId = safeCell(row, idColumn);
    const taskRevision = parseTaskRevision(row[revisionColumn]);
    if (taskId && taskRevision !== undefined) return [];
    return [{
      rowNumber: offset + 2,
      ...(!taskId ? { taskId: idFactory() } : {}),
      ...(taskRevision === undefined ? { taskRevision: 1 } : {})
    }];
  });
}
