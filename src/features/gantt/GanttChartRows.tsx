import type { LabMemberProfile } from "../../domain/people";
import { formatDateLabel } from "../../utils/date";
import {
  HEADER_HEIGHT,
  LEFT_WIDTH,
  datePosition,
  groupHeight,
  rowHeight,
  truncate,
  type GanttDensity,
  type PositionedDisplayItem
} from "./chartGeometry";

interface GanttChartRowsProps {
  chartWidth: number;
  density: GanttDensity;
  items: PositionedDisplayItem[];
  labMemberProfiles: Record<string, LabMemberProfile>;
  rangeStart: Date;
  rangeEnd: Date;
  timelineWidth: number;
  uid: string;
}

export function GanttChartRows({
  chartWidth,
  density,
  items,
  labMemberProfiles,
  rangeStart,
  rangeEnd,
  timelineWidth,
  uid
}: GanttChartRowsProps) {
  const rowSize = rowHeight(density);
  const groupSize = groupHeight(density);
  const position = (date: Date) =>
    datePosition(date, rangeStart, rangeEnd, timelineWidth);

  if (items.length === 0) {
    return (
      <text
        x={LEFT_WIDTH + timelineWidth / 2}
        y={HEADER_HEIGHT + 36}
        textAnchor="middle"
        className="gantt-chart__task-meta"
      >
        No scheduled tasks fall within the selected range.
      </text>
    );
  }

  return (
    <>
      {items.map((item, index) => {
        if (item.kind === "group") {
          const profile = labMemberProfiles[item.labMember];
          const accent = profile?.accentColor ?? "#9db8a6";
          return (
            <g key={`group-${item.labMember}-${index}`}>
              <rect
                className="gantt-chart__group-band"
                x="0"
                y={item.y}
                width={chartWidth}
                height={groupSize}
              />
              <line
                className="gantt-chart__group-rule"
                x1={LEFT_WIDTH + 12}
                x2={chartWidth - 12}
                y1={item.y + groupSize - 1}
                y2={item.y + groupSize - 1}
              />
              <line
                className="gantt-chart__group-accent"
                x1="14"
                x2="14"
                y1={item.y + 8}
                y2={item.y + groupSize - 8}
                stroke={accent}
              />
              <text
                className="gantt-chart__group-label"
                x="28"
                y={item.y + groupSize / 2 + 4}
              >
                {item.labMember}
              </text>
              <text
                className="gantt-chart__group-count"
                x={LEFT_WIDTH - 18}
                y={item.y + groupSize / 2 + 4}
                textAnchor="end"
              >
                {item.count.toString().padStart(2, "0")} TASKS
              </text>
            </g>
          );
        }

        const { row, y } = item;
        const lane = row.lane;
        const barX = row.clampedStart ? position(row.clampedStart) : LEFT_WIDTH + 4;
        const barEndX = row.clampedEnd ? position(row.clampedEnd) : barX + 6;
        const barWidth = Math.max(10, barEndX - barX);
        const barHeight = density === "compact" ? 14 : 22;
        const barY = y + (rowSize - barHeight) / 2;
        const radius = barHeight / 2;
        const profile = labMemberProfiles[row.record.labMember];
        const accent = profile?.accentColor ?? "rgba(150, 148, 140, 0.6)";
        const titleText = truncate(
          row.record.experiment || "(Untitled task)",
          density === "compact" ? 28 : 32
        );
        const projectText = truncate(
          row.record.project || "(No project)",
          density === "compact" ? 30 : 36
        );
        const showBarLabel = density !== "compact" && barWidth > 80;
        const barLabel = truncate(
          row.record.experiment || "(Untitled task)",
          Math.max(4, Math.floor(barWidth / 7))
        );
        const tooltip = [
          row.record.experiment || "(Untitled task)",
          row.record.project || "(No project)",
          row.record.labMember,
          `${formatDateLabel(row.record.startDateRaw)} → ${formatDateLabel(
            row.record.projectedEndDateRaw
          )}`,
          row.record.status || "No status"
        ]
          .filter(Boolean)
          .join("  ·  ");

        return (
          <g key={row.record.id} className="gantt-chart__row">
            <rect
              className="gantt-chart__row-band"
              x="0"
              y={y}
              width={chartWidth}
              height={rowSize}
            />
            <line
              className="gantt-chart__row-divider"
              x1="0"
              x2={chartWidth}
              y1={y + rowSize}
              y2={y + rowSize}
            />
            <line
              x1="2"
              x2="2"
              y1={y + 8}
              y2={y + rowSize - 8}
              stroke={accent}
              strokeWidth="3"
              strokeLinecap="round"
              opacity="0.85"
            />
            <circle
              className={`gantt-chart__row-status-dot gantt-chart__row-status-dot--${lane}`}
              cx="20"
              cy={y + rowSize / 2}
              r={density === "compact" ? 3.5 : 4.5}
            />
            <text
              className="gantt-chart__task-title"
              x="34"
              y={
                density === "compact"
                  ? y + rowSize / 2 + 4
                  : y + rowSize / 2 - 3
              }
            >
              {titleText}
            </text>
            {density === "compact" ? null : (
              <text
                className="gantt-chart__task-meta"
                x="34"
                y={y + rowSize / 2 + 14}
              >
                {projectText}
              </text>
            )}
            <rect
              className="gantt-chart__bar-track"
              x={LEFT_WIDTH + 4}
              y={barY + barHeight / 2 - 1}
              width={timelineWidth - 8}
              height="2"
              rx="1"
            />
            <g>
              <rect
                className={`gantt-bar gantt-bar--${lane}`}
                x={barX}
                y={barY}
                width={barWidth}
                height={barHeight}
                rx={radius}
                ry={radius}
                fill={`url(#gantt-grad-${lane}-${uid})`}
              >
                <title>{tooltip}</title>
              </rect>
              {row.openEnded ? (
                <rect
                  x={barX}
                  y={barY}
                  width={barWidth}
                  height={barHeight}
                  rx={radius}
                  ry={radius}
                  fill={`url(#gantt-open-pattern-${uid})`}
                />
              ) : null}
              <rect
                className="gantt-bar__highlight"
                x={barX + 1}
                y={barY + 1}
                width={Math.max(1, barWidth - 2)}
                height={Math.max(1, barHeight / 2 - 1)}
                rx={Math.max(0, radius - 1)}
                ry={Math.max(0, radius - 1)}
              />
            </g>
            {row.startsBeforeRange ? (
              <polygon
                points={`${barX - 6},${y + rowSize / 2} ${barX + 1},${
                  barY + 1
                } ${barX + 1},${barY + barHeight - 1}`}
                fill={`url(#gantt-grad-${lane}-${uid})`}
              />
            ) : null}
            {row.endsAfterRange ? (
              <polygon
                points={`${barX + barWidth + 6},${y + rowSize / 2} ${
                  barX + barWidth - 1
                },${barY + 1} ${barX + barWidth - 1},${
                  barY + barHeight - 1
                }`}
                fill={`url(#gantt-grad-${lane}-${uid})`}
              />
            ) : null}
            {showBarLabel ? (
              <text
                className="gantt-chart__bar-label"
                x={barX + 10}
                y={barY + barHeight / 2 + 3.5}
              >
                {barLabel}
              </text>
            ) : null}
          </g>
        );
      })}
    </>
  );
}
