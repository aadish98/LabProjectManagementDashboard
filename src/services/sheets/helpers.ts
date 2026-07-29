import type {
  EmployeeSheetColumnMap,
  TaskFieldKey
} from "../../domain/app";
import { TASK_FIELDS } from "../../domain/app";

export function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function safeCell(
  row: string[] | undefined,
  index: number | undefined
): string {
  if (!row || index === undefined) return "";
  return String(row[index] ?? "").trim();
}

export function createImmutableId(prefix: "member" | "task"): string {
  const uuid =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${uuid}`;
}

export function normalizeImmutableId(value: string | undefined): string {
  return String(value ?? "").trim();
}

export function headerIndex(headers: string[]): Record<string, number> {
  return headers.reduce<Record<string, number>>(
    (accumulator, header, index) => {
      accumulator[normalizeHeader(header)] = index;
      return accumulator;
    },
    {}
  );
}

export function findHeaderIndexByText(
  headers: string[],
  header: string
): number | undefined {
  if (!header) return undefined;
  const target = normalizeHeader(header);
  if (!target) return undefined;
  for (let index = 0; index < headers.length; index++) {
    if (normalizeHeader(headers[index] ?? "") === target) return index;
  }
  return undefined;
}

export function resolveTaskFieldIndices(
  headers: string[],
  columnMap?: EmployeeSheetColumnMap,
  options: { fallbackToAliases?: boolean } = {}
): Partial<Record<TaskFieldKey, number>> {
  const normalized = headerIndex(headers);
  const result: Partial<Record<TaskFieldKey, number>> = {};
  const fallbackToAliases = options.fallbackToAliases ?? true;

  for (const field of TASK_FIELDS) {
    const explicit = columnMap?.[field.key];
    if (explicit) {
      const found = findHeaderIndexByText(headers, explicit.header);
      if (found !== undefined) {
        result[field.key] = found;
        continue;
      }
    }
    if (!fallbackToAliases) continue;
    for (const token of field.aliasTokens) {
      const candidate = normalized[token];
      if (candidate !== undefined) {
        result[field.key] = candidate;
        break;
      }
    }
  }

  return result;
}

export function encodeSheetRange(sheetName: string, range: string): string {
  const escapedSheetName = sheetName.replace(/'/g, "''");
  return encodeURIComponent(`'${escapedSheetName}'!${range}`);
}

export function extractIdFromUrl(urlOrId: string): string {
  const match = urlOrId.match(/\/d\/([a-zA-Z0-9-_]+)/);
  return match?.[1] ?? urlOrId.trim();
}

export function extractSpreadsheetIdFromApiUrl(url: string): string {
  const match = url.match(/\/spreadsheets\/([^/:?]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : "";
}

export function columnLetter(columnNumber: number): string {
  let current = columnNumber;
  let output = "";

  while (current > 0) {
    const remainder = (current - 1) % 26;
    output = String.fromCharCode(65 + remainder) + output;
    current = Math.floor((current - remainder) / 26);
  }

  return output;
}
