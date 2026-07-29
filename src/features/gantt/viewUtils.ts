import {
  buildRange,
  currentQuarter,
  quarterStart,
  type Quarter
} from "./windowing";

export type RangePreset =
  | { id: "thisQuarter"; label: "This Quarter" }
  | { id: "nextQuarter"; label: "Next Quarter" }
  | { id: "last90d"; label: "Last 90 Days" }
  | { id: "30d"; label: "Next 30 Days" }
  | { id: "90d"; label: "Next 90 Days" }
  | { id: "180d"; label: "Next 180 Days" }
  | { id: "fyAll"; label: "Year" }
  | { id: "custom"; label: "Custom" };

export const RANGE_PRESETS: RangePreset[] = [
  { id: "thisQuarter", label: "This Quarter" },
  { id: "nextQuarter", label: "Next Quarter" },
  { id: "last90d", label: "Last 90 Days" },
  { id: "30d", label: "Next 30 Days" },
  { id: "90d", label: "Next 90 Days" },
  { id: "180d", label: "Next 180 Days" },
  { id: "fyAll", label: "Year" },
  { id: "custom", label: "Custom" }
];

export function sanitizeFilenamePart(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "tasks";
}

export function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) =>
    left.localeCompare(right)
  );
}

export function selectionLabel(selected: string[], available: string[]): string {
  if (available.length <= 1) return selected[0] ?? "tasks";
  if (selected.length === available.length) return "all-employees";
  if (selected.length === 1) return selected[0];
  return `${selected.length}-employees`;
}

export function addDays(date: Date, count: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + count);
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function dateInputValue(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function parseDateInput(value: string, fallback: Date): Date {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return fallback;
  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return fallback;
  }
  return parsed;
}

export function rangeForPreset(
  presetId: RangePreset["id"]
): { start: Date; endInclusive: Date } | null {
  const today = startOfDay(new Date());
  const initialQuarter = currentQuarter();
  switch (presetId) {
    case "thisQuarter": {
      const range = buildRange(quarterStart(initialQuarter.year, initialQuarter.quarter));
      return { start: range.start, endInclusive: addDays(range.end, -1) };
    }
    case "nextQuarter": {
      const nextQuarterIndex = (initialQuarter.quarter % 4) + 1;
      const nextYear =
        initialQuarter.quarter === 4 ? initialQuarter.year + 1 : initialQuarter.year;
      const range = buildRange(quarterStart(nextYear, nextQuarterIndex as Quarter));
      return { start: range.start, endInclusive: addDays(range.end, -1) };
    }
    case "last90d":
      return { start: addDays(today, -89), endInclusive: today };
    case "30d":
      return { start: today, endInclusive: addDays(today, 29) };
    case "90d":
      return { start: today, endInclusive: addDays(today, 89) };
    case "180d":
      return { start: today, endInclusive: addDays(today, 179) };
    case "fyAll":
      return {
        start: new Date(today.getFullYear(), 0, 1),
        endInclusive: new Date(today.getFullYear(), 11, 31)
      };
    default:
      return null;
  }
}

export function formatHumanRange(start: Date, endInclusive: Date): string {
  const sameYear = start.getFullYear() === endInclusive.getFullYear();
  const startFmt = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" })
  }).format(start);
  const endFmt = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(endInclusive);
  return `${startFmt} → ${endFmt}`;
}

export function spanInDays(start: Date, endInclusive: Date): number {
  return Math.max(1, Math.round((endInclusive.getTime() - start.getTime()) / 86_400_000) + 1);
}

export function pixelsPerDay(days: number): number {
  return days <= 45 ? 28 : days <= 100 ? 14 : days <= 200 ? 9 : days <= 400 ? 6 : 4;
}
