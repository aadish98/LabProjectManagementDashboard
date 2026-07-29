import type { LabMemberProfile } from "../../domain/people";
import { formatDateLabel } from "../../utils/date";
import { GanttChart } from "./GanttChart";
import type { GanttViewModel } from "./useGanttViewModel";

interface GanttTimelineProps {
  model: GanttViewModel;
  labMemberProfiles: Record<string, LabMemberProfile>;
}

export function GanttTimeline({
  model,
  labMemberProfiles
}: GanttTimelineProps) {
  return (
    <>
      {model.scopedExperiments.length === 0 ? (
        <div className="gantt-empty-state">
          <strong>No tasks in scope</strong>
          <p>
            Select at least one member or expand the Task-log workbook scope to render a
            chart.
          </p>
        </div>
      ) : null}

      {model.scopedExperiments.length > 0 && model.scheduledRows.length === 0 ? (
        <div className="gantt-empty-state">
          <strong>Nothing scheduled in this range</strong>
          <p>Adjust the start or end date, or fix the unscheduled tasks listed below.</p>
        </div>
      ) : null}

      <div className="gantt-chart-card">
        <div className="gantt-chart-card__legend" aria-label="Legend">
          <ul className="gantt-legend-list">
            <li className="gantt-legend-item">
              <span className="gantt-legend-swatch gantt-legend-swatch--inProgress" />
              In progress
            </li>
            <li className="gantt-legend-item">
              <span className="gantt-legend-swatch gantt-legend-swatch--planned" />
              Planned
            </li>
            <li className="gantt-legend-item">
              <span className="gantt-legend-swatch gantt-legend-swatch--completed" />
              Completed
            </li>
            <li className="gantt-legend-item">
              <span className="gantt-legend-swatch gantt-legend-swatch--overdue" />
              Overdue
            </li>
          </ul>
          <span className="gantt-chart-card__caption">
            <strong>{model.scheduledRows.length}</strong>
            {model.scheduledRows.length === 1 ? "scheduled bar" : "scheduled bars"}
          </span>
        </div>
        {model.scheduledRows.length === 0 ? (
          <div className="gantt-chart-empty">
            <strong>No bars to plot</strong>
            <p>
              Bars appear when tasks have a valid start and projected end inside the selected
              window.
            </p>
          </div>
        ) : (
          <>
            <p id={model.panInstructionsId} className="gantt-pan-instructions">
              Timeline scroll area. Use Left and Right Arrow to pan; hold Shift for a larger
              step. Home and End move to either edge.
            </p>
            <div
              ref={model.timelineScrollRef}
              className="gantt-scroll"
              tabIndex={0}
              role="region"
              aria-label="Focusable task timeline"
              aria-describedby={model.panInstructionsId}
              onKeyDown={model.handleTimelineKeyDown}
            >
              <GanttChart
                ref={model.svgRef}
                rows={model.scheduledRows}
                rangeStart={model.rangeStart}
                rangeEnd={model.rangeEnd}
                density={model.density}
                pxPerDay={model.pxPerDay}
                labMemberProfiles={labMemberProfiles}
              />
            </div>
          </>
        )}
      </div>

      <details className="gantt-schedule-table" open>
        <summary>Accessible schedule table</summary>
        <div
          className="table-scroll"
          role="region"
          aria-label="Task schedule table"
          tabIndex={0}
        >
          <table>
            <caption>
              Scheduled tasks for {model.humanRange}. This table is the data alternative to
              the visual timeline.
            </caption>
            <thead>
              <tr>
                <th scope="col">Member</th>
                <th scope="col">Task</th>
                <th scope="col">Start</th>
                <th scope="col">End</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {model.scheduledRows.map((row) => (
                <tr key={row.record.id}>
                  <td>{row.record.labMember || "Unassigned"}</td>
                  <th scope="row">{row.record.experiment || "(Untitled task)"}</th>
                  <td>{formatDateLabel(row.record.startDateRaw)}</td>
                  <td>{formatDateLabel(row.record.projectedEndDateRaw)}</td>
                  <td>{row.record.status || "No status"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
