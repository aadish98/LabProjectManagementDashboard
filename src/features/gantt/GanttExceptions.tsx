import type { ExperimentRecord } from "../../domain/experiment";
import type { LabMemberProfile } from "../../domain/people";
import { LabMemberAvatar, memberStyleVars } from "../../components/LabMemberAvatar";
import { TaskDetailGrid } from "../../components/TaskDetailGrid";
import { formatDateLabel } from "../../utils/date";
import type { GanttViewModel } from "./useGanttViewModel";

interface GanttExceptionsProps {
  model: GanttViewModel;
  labMemberProfiles: Record<string, LabMemberProfile>;
  onEditTask?: (record: ExperimentRecord) => void;
}

export function GanttExceptions({
  model,
  labMemberProfiles,
  onEditTask
}: GanttExceptionsProps) {
  if (model.exceptionRows.length === 0) return null;

  return (
    <section className="gantt-exceptions" aria-label="Unscheduled or invalid-date tasks">
      <header className="gantt-exceptions__header">
        <span className="gantt-panel__eyebrow">Repair Queue</span>
        <h3>Unscheduled or invalid dates</h3>
        <p>Fix these fields to place the tasks on the timeline.</p>
      </header>
      <div className="gantt-exception-list">
        {model.exceptionGroups.map(({ labMember, rows }) => {
          const groupProfile = labMemberProfiles[labMember];
          return (
            <section
              className="gantt-exception-group"
              style={memberStyleVars(groupProfile)}
              key={labMember}
              aria-label={`${labMember} repair tasks`}
            >
              <header className="gantt-exception-group__header">
                <span className="gantt-exception-card__identity">
                  {groupProfile ? (
                    <LabMemberAvatar
                      profile={groupProfile}
                      className="lab-member-avatar--sm"
                    />
                  ) : null}
                  <strong>{labMember}</strong>
                </span>
                <span>{rows.length} tasks</span>
              </header>
              <div className="gantt-exception-group__cards">
                {rows.map((row) => {
                  const reasons = [
                    !row.start ? "Missing start date" : "",
                    row.invalidStart ? "Invalid start date format" : "",
                    row.invalidEnd ? "Invalid projected end date format" : "",
                    !row.invalidEnd && !row.end ? "Missing projected end date" : ""
                  ].filter(Boolean);
                  const profile = labMemberProfiles[row.record.labMember];
                  const expanded = model.expandedExceptionIds.has(row.record.id);

                  return (
                    <article
                      className="gantt-exception-card"
                      style={memberStyleVars(profile)}
                      key={row.record.id}
                    >
                      <div className="gantt-exception-card__topline">
                        <span className="gantt-exception-card__identity">
                          {profile ? (
                            <LabMemberAvatar
                              profile={profile}
                              className="lab-member-avatar--sm"
                            />
                          ) : null}
                          <span>{row.record.labMember}</span>
                        </span>
                        <span className="gantt-exception-card__badge">Needs repair</span>
                      </div>
                      <strong>{row.record.experiment || "(Untitled task)"}</strong>
                      <span className="gantt-exception-card__meta">
                        {row.record.project || "(No project)"}
                      </span>
                      <ul className="gantt-exception-card__reasons">
                        {(reasons.length ? reasons : ["Not scheduled in this window"]).map(
                          (reason) => (
                            <li key={reason}>{reason}</li>
                          )
                        )}
                      </ul>
                      <span className="gantt-exception-card__dates">
                        <span>Start · {formatDateLabel(row.record.startDateRaw)}</span>
                        <span>End · {formatDateLabel(row.record.projectedEndDateRaw)}</span>
                      </span>
                      {expanded ? <TaskDetailGrid record={row.record} /> : null}
                      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                        <button
                          className="gantt-exception-card__action"
                          type="button"
                          onClick={() => model.handleToggleException(row.record.id)}
                          aria-expanded={expanded}
                        >
                          {expanded ? "Less" : "Details"}
                        </button>
                        {onEditTask ? (
                          <button
                            className="gantt-exception-card__action button--primary"
                            type="button"
                            onClick={() => onEditTask(row.record)}
                          >
                            Fix Task
                          </button>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}
