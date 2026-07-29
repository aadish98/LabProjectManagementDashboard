import {
  TASK_FIELDS,
  type EmployeeSheetColumnMap,
  type TaskFieldKey
} from "../../domain/app";
import type {
  InsertHeaderRequest,
  SheetHeaderAnalysis
} from "../../services/sheets/metadata";

export type FieldChoice =
  | { kind: "existing"; header: string }
  | { kind: "add"; afterHeader: string | null }
  | { kind: "unmapped" };

export type ColumnSelections = Partial<Record<TaskFieldKey, FieldChoice>>;

export interface SelectionValidation {
  missingFields: TaskFieldKey[];
  duplicates: Map<string, TaskFieldKey[]>;
}

export const ADD_OPTION = "__add__";

export function normalizeColumnHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function deriveDefaultSelections(
  analysis: SheetHeaderAnalysis,
  storedMap?: EmployeeSheetColumnMap
): ColumnSelections {
  const headerSet = new Set(analysis.headers.map(normalizeColumnHeader));
  const next: ColumnSelections = {};

  for (const field of TASK_FIELDS) {
    const stored = storedMap?.[field.key];
    if (stored?.mode === "add") {
      next[field.key] = { kind: "add", afterHeader: null };
      continue;
    }
    if (stored && headerSet.has(normalizeColumnHeader(stored.header))) {
      next[field.key] = { kind: "existing", header: stored.header };
      continue;
    }
    const inferred = analysis.inferredMap[field.key];
    if (inferred) next[field.key] = { kind: "existing", header: inferred.header };
    else if (!field.required) next[field.key] = { kind: "unmapped" };
  }

  return next;
}

export function buildProposedColumnMap(
  analysis: SheetHeaderAnalysis
): EmployeeSheetColumnMap {
  const proposed: EmployeeSheetColumnMap = { ...analysis.inferredMap };
  for (const field of TASK_FIELDS) {
    if (proposed[field.key] || !field.required) continue;
    proposed[field.key] = {
      mode: "add",
      header: field.defaultHeader
    };
  }
  return proposed;
}

export function validateSelections(selections: ColumnSelections): SelectionValidation {
  const missingFields: TaskFieldKey[] = [];
  const usedExistingHeaders = new Map<string, TaskFieldKey[]>();

  for (const field of TASK_FIELDS) {
    const choice = selections[field.key];
    if (!choice || choice.kind === "unmapped") {
      if (!field.required) continue;
      missingFields.push(field.key);
      continue;
    }
    if (choice.kind === "existing") {
      const key = normalizeColumnHeader(choice.header);
      const owners = usedExistingHeaders.get(key) ?? [];
      owners.push(field.key);
      usedExistingHeaders.set(key, owners);
    }
  }

  const duplicates = new Map<string, TaskFieldKey[]>();
  for (const [key, owners] of usedExistingHeaders.entries()) {
    if (owners.length > 1) duplicates.set(key, owners);
  }
  return { missingFields, duplicates };
}

export function promoteAddedSelections(
  selections: ColumnSelections,
  headers: string[]
): ColumnSelections {
  const next = { ...selections };
  for (const field of TASK_FIELDS) {
    const choice = next[field.key];
    if (!choice || choice.kind !== "add") continue;
    const existing = headers.find(
      (header) => normalizeColumnHeader(header) === normalizeColumnHeader(field.defaultHeader)
    );
    if (existing) next[field.key] = { kind: "existing", header: existing };
  }
  return next;
}

export function buildHeaderInsertions(selections: ColumnSelections): InsertHeaderRequest[] {
  const insertions: InsertHeaderRequest[] = [];
  for (const field of TASK_FIELDS) {
    const choice = selections[field.key];
    if (choice?.kind !== "add") continue;
    insertions.push({
      field: field.key,
      header: field.defaultHeader,
      position:
        choice.afterHeader && choice.afterHeader.trim()
          ? { mode: "after", afterHeader: choice.afterHeader }
          : { mode: "end" }
    });
  }
  return insertions;
}

export function buildColumnMap(
  selections: ColumnSelections,
  appendedHeaders: Array<{ field: TaskFieldKey; header: string }>
): EmployeeSheetColumnMap {
  const columnMap: EmployeeSheetColumnMap = {};
  for (const field of TASK_FIELDS) {
    const choice = selections[field.key];
    if (!choice || choice.kind === "unmapped") continue;
    if (choice.kind === "existing") {
      columnMap[field.key] = { mode: "existing", header: choice.header };
    } else {
      const written = appendedHeaders.find((entry) => entry.field === field.key);
      columnMap[field.key] = {
        mode: "add",
        header: written?.header ?? field.defaultHeader
      };
    }
  }
  return columnMap;
}

export function keepExplicitTabSelection(
  current: string,
  sheets: Array<{ title: string }>
): string {
  return sheets.some(
    (sheet) => sheet.title.trim().toLowerCase() === current.trim().toLowerCase()
  )
    ? current
    : "";
}
