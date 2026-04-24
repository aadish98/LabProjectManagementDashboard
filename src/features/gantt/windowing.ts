import { evaluateCompliance } from "../../domain/compliance";
import type { ExperimentRecord } from "../../domain/experiment";
import {
  addMonths,
  parseTimelineDate,
  startOfMonth,
  startOfToday
} from "../../utils/date";

export type Quarter = 1 | 2 | 3 | 4;

export interface DateQuality {
  raw: string;
  parsed: Date | null;
  missing: boolean;
  invalid: boolean;
}

export interface GanttRow {
  record: ExperimentRecord;
  start: Date | null;
  end: Date | null;
  clampedStart: Date | null;
  clampedEnd: Date | null;
  startsBeforeRange: boolean;
  endsAfterRange: boolean;
  openEnded: boolean;
  invalidStart: boolean;
  invalidEnd: boolean;
  isScheduled: boolean;
  lane: ReturnType<typeof evaluateCompliance>["lane"];
}

export function quarterStart(year: number, quarter: Quarter): Date {
  return new Date(year, (quarter - 1) * 3, 1);
}

export function currentQuarter(today: Date = startOfToday()): { year: number; quarter: Quarter } {
  return {
    year: today.getFullYear(),
    quarter: (Math.floor(today.getMonth() / 3) + 1) as Quarter
  };
}

export function buildRange(startMonth: Date): { start: Date; end: Date } {
  const start = startOfMonth(startMonth);
  return { start, end: addMonths(start, 3) };
}

export function dateQuality(
  value: string | Date | null | undefined,
  strategy: "first" | "last" = "first"
): DateQuality {
  const raw = value instanceof Date ? value.toISOString() : String(value ?? "").trim();
  const parsed = parseTimelineDate(value, strategy);
  return {
    raw,
    parsed,
    missing: !raw,
    invalid: !!raw && !parsed
  };
}

function minDate(left: Date, right: Date): Date {
  return left.getTime() <= right.getTime() ? left : right;
}

function maxDate(left: Date, right: Date): Date {
  return left.getTime() >= right.getTime() ? left : right;
}

function overlapsRange(start: Date, end: Date, rangeStart: Date, rangeEnd: Date): boolean {
  return start.getTime() < rangeEnd.getTime() && end.getTime() >= rangeStart.getTime();
}

export function tasksInRange(
  records: ExperimentRecord[],
  rangeStart: Date,
  rangeEnd: Date
): GanttRow[] {
  const today = startOfToday();

  return records
    .map((record) => {
      const startQuality = dateQuality(record.startDateRaw, "first");
      const endQuality = dateQuality(record.projectedEndDateRaw, "last");
      const compliance = evaluateCompliance(record);
      const openEnded = !!startQuality.parsed && !endQuality.parsed && !endQuality.invalid;
      const effectiveEnd =
        endQuality.parsed ?? (startQuality.parsed ? minDate(today, rangeEnd) : null);
      const isScheduled =
        !!startQuality.parsed &&
        !!effectiveEnd &&
        !startQuality.invalid &&
        !endQuality.invalid &&
        overlapsRange(startQuality.parsed, effectiveEnd, rangeStart, rangeEnd);

      return {
        record,
        start: startQuality.parsed,
        end: endQuality.parsed,
        clampedStart: isScheduled ? maxDate(startQuality.parsed as Date, rangeStart) : null,
        clampedEnd: isScheduled ? minDate(effectiveEnd as Date, rangeEnd) : null,
        startsBeforeRange: !!startQuality.parsed && startQuality.parsed < rangeStart,
        endsAfterRange: !!effectiveEnd && effectiveEnd >= rangeEnd,
        openEnded,
        invalidStart: startQuality.invalid,
        invalidEnd: endQuality.invalid,
        isScheduled,
        lane: compliance.lane
      } satisfies GanttRow;
    })
    .filter((row) => row.isScheduled || row.invalidStart || row.invalidEnd || !row.start)
    .sort((left, right) => {
      const leftTime = left.start?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const rightTime = right.start?.getTime() ?? Number.MAX_SAFE_INTEGER;
      if (leftTime !== rightTime) return leftTime - rightTime;
      return (left.record.experiment || left.record.project).localeCompare(
        right.record.experiment || right.record.project
      );
    });
}

export function positionForDate(date: Date, rangeStart: Date, rangeEnd: Date): number {
  const totalMs = Math.max(1, rangeEnd.getTime() - rangeStart.getTime());
  const offsetMs = Math.max(
    0,
    Math.min(totalMs, date.getTime() - rangeStart.getTime())
  );
  return (offsetMs / totalMs) * 100;
}
