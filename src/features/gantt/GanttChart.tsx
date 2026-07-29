import { forwardRef, useId, useMemo } from "react";
import type { LabMemberProfile } from "../../domain/people";
import type { GanttRow } from "./windowing";
import {
  FOOTER_HEIGHT,
  HEADER_HEIGHT,
  LEFT_WIDTH,
  buildDisplayItems,
  dayDelta,
  positionDisplayItems,
  rowHeight,
  totalBodyHeight,
  type GanttDensity
} from "./chartGeometry";
import { GanttChartAxis } from "./GanttChartAxis";
import { GanttChartDefs } from "./GanttChartDefs";
import { GanttChartRows } from "./GanttChartRows";

export type { GanttDensity } from "./chartGeometry";

interface GanttChartProps {
  rows: GanttRow[];
  rangeStart: Date;
  rangeEnd: Date;
  density?: GanttDensity;
  pxPerDay?: number;
  labMemberProfiles?: Record<string, LabMemberProfile>;
}

export const GanttChart = forwardRef<SVGSVGElement, GanttChartProps>(
  function GanttChart(
    {
      rows,
      rangeStart,
      rangeEnd,
      density = "comfortable",
      pxPerDay = 14,
      labMemberProfiles = {}
    },
    ref
  ) {
    const uid = useId().replace(/[:]/g, "");
    const timelineWidth = Math.max(
      720,
      Math.round(dayDelta(rangeStart, rangeEnd) * pxPerDay)
    );
    const chartWidth = LEFT_WIDTH + timelineWidth;
    const displayItems = useMemo(() => buildDisplayItems(rows), [rows]);
    const positionedItems = useMemo(
      () => positionDisplayItems(displayItems, density),
      [density, displayItems]
    );
    const height =
      HEADER_HEIGHT +
      Math.max(rowHeight(density), totalBodyHeight(displayItems, density)) +
      FOOTER_HEIGHT;

    return (
      <svg
        ref={ref}
        className="gantt-chart"
        role="img"
        aria-label="Task Gantt chart"
        viewBox={`0 0 ${chartWidth} ${height}`}
        width={chartWidth}
        height={height}
      >
        <GanttChartDefs uid={uid} />
        <GanttChartAxis
          chartWidth={chartWidth}
          height={height}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          rowCount={rows.length}
          timelineWidth={timelineWidth}
          uid={uid}
        />
        <GanttChartRows
          chartWidth={chartWidth}
          density={density}
          items={positionedItems}
          labMemberProfiles={labMemberProfiles}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          timelineWidth={timelineWidth}
          uid={uid}
        />
      </svg>
    );
  }
);
