import type { GanttRow } from "./windowing";
import { positionForDate } from "./windowing";

export const LEFT_WIDTH = 320;
export const HEADER_HEIGHT = 64;
export const FOOTER_HEIGHT = 24;

const ROW_HEIGHT_COMFORTABLE = 52;
const ROW_HEIGHT_COMPACT = 36;
const GROUP_HEIGHT_COMFORTABLE = 34;
const GROUP_HEIGHT_COMPACT = 26;
const MS_PER_DAY = 86_400_000;

export type GanttDensity = "comfortable" | "compact";

export type DisplayItem =
  | { kind: "group"; labMember: string; count: number }
  | { kind: "row"; row: GanttRow };

export type PositionedDisplayItem = DisplayItem & { y: number };

export function rowHeight(density: GanttDensity): number {
  return density === "compact" ? ROW_HEIGHT_COMPACT : ROW_HEIGHT_COMFORTABLE;
}

export function groupHeight(density: GanttDensity): number {
  return density === "compact" ? GROUP_HEIGHT_COMPACT : GROUP_HEIGHT_COMFORTABLE;
}

export function dayDelta(rangeStart: Date, rangeEnd: Date): number {
  return Math.max(
    1,
    Math.round((rangeEnd.getTime() - rangeStart.getTime()) / MS_PER_DAY)
  );
}

export function buildDisplayItems(rows: GanttRow[]): DisplayItem[] {
  const uniqueMembers = Array.from(
    new Set(rows.map((row) => row.record.labMember || "Unassigned"))
  );
  if (uniqueMembers.length <= 1) {
    return rows.map((row) => ({ kind: "row", row }));
  }

  const grouped = new Map<string, GanttRow[]>();
  for (const row of rows) {
    const key = row.record.labMember || "Unassigned";
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }

  return Array.from(grouped.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([labMember, memberRows]) => [
      { kind: "group", labMember, count: memberRows.length } satisfies DisplayItem,
      ...memberRows.map((row) => ({ kind: "row", row }) satisfies DisplayItem)
    ]);
}

export function positionDisplayItems(
  items: DisplayItem[],
  density: GanttDensity
): PositionedDisplayItem[] {
  const row = rowHeight(density);
  const group = groupHeight(density);
  let y = HEADER_HEIGHT;
  return items.map((item) => {
    const positioned = { ...item, y } as PositionedDisplayItem;
    y += item.kind === "group" ? group : row;
    return positioned;
  });
}

export function totalBodyHeight(
  items: DisplayItem[],
  density: GanttDensity
): number {
  const row = rowHeight(density);
  const group = groupHeight(density);
  return items.reduce(
    (total, item) => total + (item.kind === "group" ? group : row),
    0
  );
}

export function datePosition(
  date: Date,
  rangeStart: Date,
  rangeEnd: Date,
  timelineWidth: number
): number {
  return (
    LEFT_WIDTH +
    (positionForDate(date, rangeStart, rangeEnd) / 100) * timelineWidth
  );
}

export function monthStartsBetween(rangeStart: Date, rangeEnd: Date): Date[] {
  const months: Date[] = [];
  let cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
  while (cursor < rangeEnd) {
    months.push(cursor);
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  return months;
}

export function weekStartsBetween(rangeStart: Date, rangeEnd: Date): Date[] {
  const weeks: Date[] = [];
  const cursor = new Date(rangeStart);
  cursor.setHours(0, 0, 0, 0);
  cursor.setDate(cursor.getDate() + ((8 - cursor.getDay()) % 7));
  while (cursor < rangeEnd) {
    weeks.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 7);
  }
  return weeks;
}

export function weekendBands(
  rangeStart: Date,
  rangeEnd: Date
): { start: Date; end: Date }[] {
  const bands: { start: Date; end: Date }[] = [];
  const cursor = new Date(rangeStart);
  cursor.setHours(0, 0, 0, 0);
  while (cursor < rangeEnd) {
    if (cursor.getDay() === 0 || cursor.getDay() === 6) {
      const start = new Date(cursor);
      const end = new Date(cursor);
      end.setDate(end.getDate() + 1);
      while (end < rangeEnd && (end.getDay() === 0 || end.getDay() === 6)) {
        end.setDate(end.getDate() + 1);
      }
      bands.push({ start, end: end > rangeEnd ? new Date(rangeEnd) : end });
      cursor.setTime(end.getTime());
    } else {
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  return bands;
}

export function isoWeekNumber(date: Date): number {
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  target.setDate(target.getDate() + 4 - (target.getDay() || 7));
  const yearStart = new Date(target.getFullYear(), 0, 1);
  return Math.ceil(
    ((target.getTime() - yearStart.getTime()) / MS_PER_DAY + 1) / 7
  );
}

export function minDate(left: Date, right: Date): Date {
  return left.getTime() <= right.getTime() ? left : right;
}

export function maxDate(left: Date, right: Date): Date {
  return left.getTime() >= right.getTime() ? left : right;
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}
