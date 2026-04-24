const SHORT_MD_PATTERN = /^(\d{1,2})[./](\d{1,2})$/;
const FULL_MDY_PATTERN = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/;

function normalizeDate(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function parseSingleValue(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return normalizeDate(value);
  }

  if (typeof value === "number") {
    const parsed = new Date(Math.round((value - 25569) * 86400 * 1000));
    return Number.isNaN(parsed.getTime()) ? null : normalizeDate(parsed);
  }

  const text = String(value).trim();
  if (!text) return null;

  const shortMatch = text.match(SHORT_MD_PATTERN);
  if (shortMatch) {
    const month = Number.parseInt(shortMatch[1], 10);
    const day = Number.parseInt(shortMatch[2], 10);
    const year = new Date().getFullYear();
    const parsed = new Date(year, month - 1, day);
    if (
      parsed.getFullYear() === year &&
      parsed.getMonth() === month - 1 &&
      parsed.getDate() === day
    ) {
      return normalizeDate(parsed);
    }
  }

  const fullMatch = text.match(FULL_MDY_PATTERN);
  if (fullMatch) {
    const month = Number.parseInt(fullMatch[1], 10);
    const day = Number.parseInt(fullMatch[2], 10);
    let year = Number.parseInt(fullMatch[3], 10);
    if (year < 100) year += 2000;

    const parsed = new Date(year, month - 1, day);
    if (
      parsed.getFullYear() === year &&
      parsed.getMonth() === month - 1 &&
      parsed.getDate() === day
    ) {
      return normalizeDate(parsed);
    }
  }

  const fallback = new Date(text);
  return Number.isNaN(fallback.getTime()) ? null : normalizeDate(fallback);
}

export function parsePossibleDate(value: unknown): Date | null {
  return parseSingleValue(value);
}

export function parseTimelineDate(
  value: unknown,
  strategy: "first" | "last" = "first"
): Date | null {
  const text = String(value ?? "").trim();
  if (!text) return parseSingleValue(value);

  const tokens = text
    .split(/\r?\n/)
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length <= 1) return parseSingleValue(value);

  const parsed = tokens
    .map((token) => parseSingleValue(token))
    .filter((token): token is Date => token instanceof Date);

  if (parsed.length === 0) return parseSingleValue(value);
  return strategy === "first" ? parsed[0] : parsed[parsed.length - 1];
}

export function formatDateLabel(value: string | Date | null | undefined): string {
  if (!value) return "Unscheduled";
  const parsed = value instanceof Date ? value : parseSingleValue(value);
  if (!parsed) return String(value);
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(parsed);
}

export function formatDateInputValue(value: string | Date | null | undefined): string {
  if (!value) return "";
  const parsed = value instanceof Date ? value : parseTimelineDate(value);
  if (!parsed) return "";
  return parsed.toISOString().slice(0, 10);
}

export function startOfToday(): Date {
  return normalizeDate(new Date());
}

export function differenceInDays(start: Date, end: Date): number {
  const millisecondsPerDay = 1000 * 60 * 60 * 24;
  return Math.max(1, Math.round((normalizeDate(end).getTime() - normalizeDate(start).getTime()) / millisecondsPerDay));
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function addMonths(date: Date, count: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + count, 1);
}

export function monthLabel(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    year: "numeric"
  }).format(date);
}

export function toIsoTimestamp(value: string | Date | null | undefined): string {
  if (!value) return "";
  const parsed = value instanceof Date ? value : parseTimelineDate(value, "last");
  return parsed ? parsed.toISOString() : String(value);
}
