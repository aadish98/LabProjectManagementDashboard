import {
  TASK_FIELDS,
  type EmployeeSheetColumnMap,
  type TaskFieldKey
} from "./app";

export type ColumnChoice =
  | { kind: "existing"; header: string }
  | { kind: "add"; afterHeader: string | null }
  | { kind: "unmapped" };

export type ColumnSelections = Partial<Record<TaskFieldKey, ColumnChoice>>;

export interface ColumnMapValidation {
  missingRequired: TaskFieldKey[];
  duplicates: Map<string, TaskFieldKey[]>;
}

export function normalizeColumnHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function validateColumnSelections(selections: ColumnSelections): ColumnMapValidation {
  const missingRequired: TaskFieldKey[] = [];
  const usedHeaders = new Map<string, TaskFieldKey[]>();

  for (const field of TASK_FIELDS) {
    const choice = selections[field.key];
    if (!choice || choice.kind === "unmapped") {
      if (field.required) missingRequired.push(field.key);
      continue;
    }
    if (choice.kind === "existing") {
      const key = normalizeColumnHeader(choice.header);
      usedHeaders.set(key, [...(usedHeaders.get(key) ?? []), field.key]);
    }
  }

  const duplicates = new Map<string, TaskFieldKey[]>();
  for (const [header, fields] of usedHeaders) {
    if (fields.length > 1) duplicates.set(header, fields);
  }
  return { missingRequired, duplicates };
}

export function toAcceptedColumnMap(
  selections: ColumnSelections,
  appended: Array<{ field: TaskFieldKey; header: string }> = []
): EmployeeSheetColumnMap {
  const result: EmployeeSheetColumnMap = {};
  for (const field of TASK_FIELDS) {
    const choice = selections[field.key];
    if (!choice || choice.kind === "unmapped") continue;
    if (choice.kind === "existing") {
      result[field.key] = { mode: "existing", header: choice.header };
    } else {
      result[field.key] = {
        mode: "add",
        header:
          appended.find((entry) => entry.field === field.key)?.header ?? field.defaultHeader
      };
    }
  }
  return result;
}

export function fieldsNeedingReview(
  headers: string[],
  proposed: EmployeeSheetColumnMap
): TaskFieldKey[] {
  const normalizedCounts = new Map<string, number>();
  for (const header of headers) {
    const key = normalizeColumnHeader(header);
    normalizedCounts.set(key, (normalizedCounts.get(key) ?? 0) + 1);
  }
  return TASK_FIELDS.filter((field) => {
    const mapping = proposed[field.key];
    if (!mapping) return field.required;
    return (normalizedCounts.get(normalizeColumnHeader(mapping.header)) ?? 0) !== 1;
  }).map((field) => field.key);
}
