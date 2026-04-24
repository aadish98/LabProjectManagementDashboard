import { forwardRef, useMemo } from "react";
import { formatDateLabel } from "../../utils/date";
import type { GanttRow } from "./windowing";
import { positionForDate } from "./windowing";

interface GanttChartProps {
  rows: GanttRow[];
  rangeStart: Date;
  rangeEnd: Date;
}

type DisplayItem =
  | { kind: "group"; labMember: string }
  | { kind: "row"; row: GanttRow };

const LEFT_WIDTH = 280;
const TIMELINE_WIDTH = 920;
const HEADER_HEIGHT = 72;
const ROW_HEIGHT = 46;
const GROUP_HEIGHT = 28;
const FOOTER_HEIGHT = 28;
const CHART_WIDTH = LEFT_WIDTH + TIMELINE_WIDTH;

function buildDisplayItems(rows: GanttRow[]): DisplayItem[] {
  const uniqueMembers = Array.from(new Set(rows.map((row) => row.record.labMember))).filter(Boolean);
  const shouldGroup = uniqueMembers.length > 1;

  if (!shouldGroup) return rows.map((row) => ({ kind: "row", row }));

  const grouped = new Map<string, GanttRow[]>();
  for (const row of rows) {
    const key = row.record.labMember || "Unassigned";
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }

  return Array.from(grouped.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([labMember, memberRows]) => [
      { kind: "group", labMember } satisfies DisplayItem,
      ...memberRows.map((row) => ({ kind: "row", row }) satisfies DisplayItem)
    ]);
}

function monthName(date: Date): string {
  return new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric" }).format(date);
}

function monthStartsBetween(rangeStart: Date, rangeEnd: Date): Date[] {
  const months: Date[] = [];
  let cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
  while (cursor < rangeEnd) {
    months.push(cursor);
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  return months;
}

function minDate(left: Date, right: Date): Date {
  return left.getTime() <= right.getTime() ? left : right;
}

function maxDate(left: Date, right: Date): Date {
  return left.getTime() >= right.getTime() ? left : right;
}

function datePosition(date: Date, rangeStart: Date, rangeEnd: Date): number {
  return LEFT_WIDTH + (positionForDate(date, rangeStart, rangeEnd) / 100) * TIMELINE_WIDTH;
}

export const GanttChart = forwardRef<SVGSVGElement, GanttChartProps>(
  function GanttChart({ rows, rangeStart, rangeEnd }, ref) {
    const displayItems = useMemo(() => buildDisplayItems(rows), [rows]);
    const height =
      HEADER_HEIGHT +
      displayItems.reduce(
        (total, item) => total + (item.kind === "group" ? GROUP_HEIGHT : ROW_HEIGHT),
        0
      ) +
      FOOTER_HEIGHT;
    const monthStarts = monthStartsBetween(rangeStart, rangeEnd);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const showToday = today >= rangeStart && today < rangeEnd;

    let cursorY = HEADER_HEIGHT;

    return (
      <svg
        ref={ref}
        className="gantt-chart"
        role="img"
        aria-label="Task Gantt chart"
        viewBox={`0 0 ${CHART_WIDTH} ${height}`}
        width={CHART_WIDTH}
        height={height}
      >
        <rect className="gantt-chart__surface" x="0" y="0" width={CHART_WIDTH} height={height} />
        <line
          className="gantt-chart__divider"
          x1={LEFT_WIDTH}
          x2={LEFT_WIDTH}
          y1="0"
          y2={height}
        />

        {monthStarts.map((month) => {
          const nextMonth = new Date(month.getFullYear(), month.getMonth() + 1, 1);
          const bandStart = maxDate(month, rangeStart);
          const bandEnd = minDate(nextMonth, rangeEnd);
          const x = datePosition(bandStart, rangeStart, rangeEnd);
          const width = Math.max(1, datePosition(bandEnd, rangeStart, rangeEnd) - x);
          return (
            <g key={month.toISOString()}>
              <rect
                className="gantt-chart__month-band"
                x={x}
                y="0"
                width={width}
                height={height}
              />
              <text className="gantt-chart__month-label" x={x + 10} y="34">
                {monthName(month)}
              </text>
              <line className="gantt-chart__grid-line" x1={x} x2={x} y1="0" y2={height} />
            </g>
          );
        })}
        <line
          className="gantt-chart__grid-line"
          x1={CHART_WIDTH}
          x2={CHART_WIDTH}
          y1="0"
          y2={height}
        />
        <text className="gantt-chart__axis-label" x="18" y="34">
          Task
        </text>

        {showToday ? (
          <g>
            <line
              className="gantt-chart__today-line"
              x1={datePosition(today, rangeStart, rangeEnd)}
              x2={datePosition(today, rangeStart, rangeEnd)}
              y1="44"
              y2={height}
            />
            <text
              className="gantt-chart__today-label"
              x={datePosition(today, rangeStart, rangeEnd) + 6}
              y="58"
            >
              Today
            </text>
          </g>
        ) : null}

        {displayItems.map((item, index) => {
          if (item.kind === "group") {
            const y = cursorY;
            cursorY += GROUP_HEIGHT;
            return (
              <g key={`group-${item.labMember}-${index}`}>
                <rect
                  className="gantt-chart__group"
                  x="0"
                  y={y}
                  width={CHART_WIDTH}
                  height={GROUP_HEIGHT}
                />
                <text className="gantt-chart__group-label" x="18" y={y + 19}>
                  {item.labMember}
                </text>
              </g>
            );
          }

          const { row } = item;
          const y = cursorY;
          cursorY += ROW_HEIGHT;
          const barX = row.clampedStart
            ? datePosition(row.clampedStart, rangeStart, rangeEnd)
            : LEFT_WIDTH;
          const barEndX = row.clampedEnd
            ? datePosition(row.clampedEnd, rangeStart, rangeEnd)
            : barX + 4;
          const barWidth = Math.max(8, barEndX - barX);
          const title = [
            row.record.project || "(No project)",
            row.record.experiment || "(Untitled task)",
            row.record.labMember,
            `${formatDateLabel(row.record.startDateRaw)} - ${formatDateLabel(
              row.record.projectedEndDateRaw
            )}`,
            row.record.status || "No status"
          ]
            .filter(Boolean)
            .join(" · ");

          return (
            <g key={row.record.id} className={`gantt-chart__row gantt-chart__row--${row.lane}`}>
              <rect
                className="gantt-chart__row-band"
                x="0"
                y={y}
                width={CHART_WIDTH}
                height={ROW_HEIGHT}
              />
              <text className="gantt-chart__task-title" x="18" y={y + 20}>
                {row.record.experiment || "(Untitled task)"}
              </text>
              <text className="gantt-chart__task-meta" x="18" y={y + 36}>
                {row.record.project || "(No project)"}
              </text>
              <line
                className={`gantt-chart__row-accent gantt-chart__row-accent--${row.lane}`}
                x1="0"
                x2="0"
                y1={y + 8}
                y2={y + ROW_HEIGHT - 8}
              />
              <rect
                className={`gantt-bar gantt-bar--${row.lane}${row.openEnded ? " gantt-bar--open" : ""}`}
                x={barX}
                y={y + 13}
                width={barWidth}
                height="18"
                rx="9"
              >
                <title>{title}</title>
              </rect>
              {row.startsBeforeRange ? (
                <polygon
                  className={`gantt-bar gantt-bar--${row.lane}`}
                  points={`${barX},${y + 22} ${barX + 9},${y + 13} ${barX + 9},${y + 31}`}
                />
              ) : null}
              {row.endsAfterRange ? (
                <polygon
                  className={`gantt-bar gantt-bar--${row.lane}`}
                  points={`${barX + barWidth},${y + 22} ${barX + barWidth - 9},${y + 13} ${
                    barX + barWidth - 9
                  },${y + 31}`}
                />
              ) : null}
            </g>
          );
        })}
      </svg>
    );
  }
);
