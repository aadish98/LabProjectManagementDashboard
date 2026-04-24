const SHORT_MD_PATTERN = /^(\d{1,2})[./](\d{1,2})$/;
const FULL_MDY_PATTERN = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;

function normalizeDate(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function localDateFrom(year: number, month: number, day: number): Date | null {
  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day
  ) {
    return normalizeDate(parsed);
  }
  return null;
}

function parseSingleValue(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return normalizeDate(value);
  }

  if (typeof value === "number") {
    // Spreadsheet serial dates count days since 1899-12-30 in the source's
    // local calendar. Read out the UTC components and rebuild as a local date
    // so the calendar day survives a timezone shift west of UTC.
    const epochMs = Math.round((value - 25569) * 86400 * 1000);
    const utcDate = new Date(epochMs);
    if (Number.isNaN(utcDate.getTime())) return null;
    const local = localDateFrom(
      utcDate.getUTCFullYear(),
      utcDate.getUTCMonth() + 1,
      utcDate.getUTCDate()
    );
    if (local) return local;
  }

  const text = String(value).trim();
  if (!text) return null;

  // YYYY-MM-DD comes from <input type="date"> and from Google Sheets cells
  // formatted as plain text. The native Date parser treats this format as UTC
  // midnight, which slips into the previous day west of UTC. Treat it as a
  // calendar day in the user's local time instead.
  const isoMatch = text.match(ISO_DATE_PATTERN);
  if (isoMatch) {
    const local = localDateFrom(
      Number.parseInt(isoMatch[1], 10),
      Number.parseInt(isoMatch[2], 10),
      Number.parseInt(isoMatch[3], 10)
    );
    if (local) return local;
  }

  const shortMatch = text.match(SHORT_MD_PATTERN);
  if (shortMatch) {
    const local = localDateFrom(
      new Date().getFullYear(),
      Number.parseInt(shortMatch[1], 10),
      Number.parseInt(shortMatch[2], 10)
    );
    if (local) return local;
  }

  const fullMatch = text.match(FULL_MDY_PATTERN);
  if (fullMatch) {
    let year = Number.parseInt(fullMatch[3], 10);
    if (year < 100) year += 2000;
    const local = localDateFrom(
      year,
      Number.parseInt(fullMatch[1], 10),
      Number.parseInt(fullMatch[2], 10)
    );
    if (local) return local;
  }

  // Fallback for ISO timestamps with explicit time/zone info ("2026-04-24T12:00Z",
  // "Apr 24, 2026", etc.). These already encode a moment in time, so the engine's
  // built-in parsing is the right tool.
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

export function formatLocalIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDateInputValue(
  value: string | Date | null | undefined,
  strategy: "first" | "last" = "first"
): string {
  if (!value) return "";
  const parsed = value instanceof Date ? value : parseTimelineDate(value, strategy);
  if (!parsed) return "";
  // toISOString uses UTC, which would shift the calendar day east of UTC.
  // Use local components so the date input always reflects the same day the
  // user (and the rest of the UI) sees.
  return formatLocalIsoDate(parsed);
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
