import {
  FOOTER_HEIGHT,
  HEADER_HEIGHT,
  LEFT_WIDTH,
  datePosition,
  isoWeekNumber,
  maxDate,
  minDate,
  monthStartsBetween,
  weekendBands,
  weekStartsBetween
} from "./chartGeometry";

interface GanttChartAxisProps {
  chartWidth: number;
  height: number;
  rangeStart: Date;
  rangeEnd: Date;
  rowCount: number;
  timelineWidth: number;
  uid: string;
}

export function GanttChartAxis({
  chartWidth,
  height,
  rangeStart,
  rangeEnd,
  rowCount,
  timelineWidth,
  uid
}: GanttChartAxisProps) {
  const monthStarts = monthStartsBetween(rangeStart, rangeEnd);
  const weekStarts = weekStartsBetween(rangeStart, rangeEnd);
  const weekendList = weekendBands(rangeStart, rangeEnd);
  const position = (date: Date) =>
    datePosition(date, rangeStart, rangeEnd, timelineWidth);
  const monthFmt = new Intl.DateTimeFormat(undefined, { month: "long" });
  const monthShortFmt = new Intl.DateTimeFormat(undefined, { month: "short" });
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const showToday = today >= rangeStart && today < rangeEnd;

  return (
    <>
      <rect className="gantt-chart__surface" x="0" y="0" width={chartWidth} height={height} />

      {weekendList.map((band, index) => {
        const x = position(band.start);
        return (
          <rect
            key={`weekend-${index}`}
            className="gantt-chart__weekend-band"
            x={x}
            y={HEADER_HEIGHT}
            width={Math.max(1, position(band.end) - x)}
            height={height - HEADER_HEIGHT}
          />
        );
      })}

      {weekStarts.map((week) => {
        const x = position(week);
        if (x <= LEFT_WIDTH + 0.5) return null;
        return (
          <line
            key={`week-${week.toISOString()}`}
            className="gantt-chart__week-line"
            x1={x}
            x2={x}
            y1={HEADER_HEIGHT}
            y2={height - FOOTER_HEIGHT}
          />
        );
      })}

      {monthStarts.map((month) => {
        const x = position(month);
        if (x <= LEFT_WIDTH + 0.5) return null;
        return (
          <line
            key={`month-${month.toISOString()}`}
            className="gantt-chart__month-line"
            x1={x}
            x2={x}
            y1={HEADER_HEIGHT}
            y2={height - FOOTER_HEIGHT}
          />
        );
      })}

      <rect
        className="gantt-chart__header-bg"
        x="0"
        y="0"
        width={chartWidth}
        height={HEADER_HEIGHT}
      />
      <text className="gantt-chart__axis-eyebrow" x="20" y="22">
        Task / Owner
      </text>
      <text
        className="gantt-chart__axis-eyebrow"
        x="20"
        y="46"
        style={{ fill: "var(--gantt-ink-700)" }}
      >
        {Math.max(0, Math.round(rowCount))} rows
      </text>

      {monthStarts.map((month) => {
        const nextMonth = new Date(month.getFullYear(), month.getMonth() + 1, 1);
        const bandStart = maxDate(month, rangeStart);
        const bandEnd = minDate(nextMonth, rangeEnd);
        const x = position(bandStart);
        const width = Math.max(1, position(bandEnd) - x);
        const label =
          width >= 90 ? monthFmt.format(month) : monthShortFmt.format(month);
        return (
          <g key={`month-label-${month.toISOString()}`}>
            <text className="gantt-chart__month-label" x={x + 10} y={26}>
              {label}
            </text>
            <text className="gantt-chart__year-tag" x={x + 10} y={42}>
              {month.getFullYear()}
            </text>
          </g>
        );
      })}

      {weekStarts.map((week) => {
        const x = position(week);
        if (x < LEFT_WIDTH + 12 || x > chartWidth - 18) return null;
        return (
          <text
            key={`weeklabel-${week.toISOString()}`}
            className="gantt-chart__week-label"
            x={x + 4}
            y={HEADER_HEIGHT - 8}
          >
            W{isoWeekNumber(week)}
          </text>
        );
      })}

      <line
        className="gantt-chart__header-divider"
        x1="0"
        x2={chartWidth}
        y1={HEADER_HEIGHT}
        y2={HEADER_HEIGHT}
      />
      <line
        className="gantt-chart__pane-divider"
        x1={LEFT_WIDTH}
        x2={LEFT_WIDTH}
        y1="0"
        y2={height}
      />
      <rect
        x={LEFT_WIDTH}
        y={HEADER_HEIGHT}
        width="14"
        height={height - HEADER_HEIGHT}
        fill={`url(#gantt-pane-shadow-${uid})`}
      />

      {showToday ? (
        <g>
          <line
            className="gantt-chart__today-line"
            x1={position(today)}
            x2={position(today)}
            y1={HEADER_HEIGHT}
            y2={height - FOOTER_HEIGHT}
          />
          <g transform={`translate(${position(today)}, 0)`}>
            <polygon
              className="gantt-chart__today-flag"
              points="-22,4 22,4 22,18 4,18 0,24 -4,18 -22,18"
            />
            <text className="gantt-chart__today-text" x="0" y="14" textAnchor="middle">
              TODAY
            </text>
          </g>
        </g>
      ) : null}
    </>
  );
}
