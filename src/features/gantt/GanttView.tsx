import { useEffect, useMemo, useRef, useState } from "react";
import type { ExperimentRecord } from "../../domain/experiment";
import type { LabMemberProfile } from "../../domain/people";
import { formatDateLabel } from "../../utils/date";
import { LabMemberAvatar, memberStyleVars } from "../../components/LabMemberAvatar";
import { TaskDetailGrid } from "../../components/TaskDetailGrid";
import { exportSvgAsPng, printGantt } from "./exporters";
import { GanttChart } from "./GanttChart";
import {
  buildRange,
  currentQuarter,
  quarterStart,
  tasksInRange
} from "./windowing";
import "./gantt.css";

interface GanttViewProps {
  mode: "employee" | "manager";
  experiments: ExperimentRecord[];
  labMembers: string[];
  defaultSelection?: string[];
  labMemberProfiles?: Record<string, LabMemberProfile>;
  onEditTask?: (record: ExperimentRecord) => void;
}

function sanitizeFilenamePart(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "tasks";
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right));
}

function selectionLabel(selected: string[], available: string[]): string {
  if (available.length <= 1) return selected[0] ?? "tasks";
  if (selected.length === available.length) return "all-employees";
  if (selected.length === 1) return selected[0];
  return `${selected.length}-employees`;
}

function addDays(date: Date, count: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + count);
}

function dateInputValue(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function parseDateInput(value: string, fallback: Date): Date {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return fallback;
  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return fallback;
  }
  return parsed;
}

export function GanttView({
  mode,
  experiments,
  labMembers,
  defaultSelection,
  labMemberProfiles = {},
  onEditTask
}: GanttViewProps) {
  const initialQuarter = currentQuarter();
  const initialRange = buildRange(quarterStart(initialQuarter.year, initialQuarter.quarter));
  const [rangeStart, setRangeStart] = useState(initialRange.start);
  const [rangeEndInclusive, setRangeEndInclusive] = useState(() => addDays(initialRange.end, -1));
  const availableLabMembers = useMemo(
    () => uniqueSorted(labMembers.length ? labMembers : experiments.map((record) => record.labMember)),
    [experiments, labMembers]
  );
  const [selectedLabMembers, setSelectedLabMembers] = useState<string[]>(() =>
    uniqueSorted(defaultSelection?.length ? defaultSelection : availableLabMembers)
  );
  const [expandedExceptionIds, setExpandedExceptionIds] = useState<Set<string>>(() => new Set());
  const [exportError, setExportError] = useState("");
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    setSelectedLabMembers((previous) => {
      const allowed = new Set(availableLabMembers);
      const next = previous.filter((member) => allowed.has(member));
      if (next.length > 0) return next;
      return uniqueSorted(defaultSelection?.length ? defaultSelection : availableLabMembers);
    });
  }, [availableLabMembers, defaultSelection]);

  const rangeEnd = useMemo(() => addDays(rangeEndInclusive, 1), [rangeEndInclusive]);
  const selectedSet = useMemo(() => new Set(selectedLabMembers), [selectedLabMembers]);
  const scopedExperiments = useMemo(
    () =>
      mode === "manager"
        ? experiments.filter((record) => selectedSet.has(record.labMember))
        : experiments,
    [experiments, mode, selectedSet]
  );
  const rows = useMemo(
    () => tasksInRange(scopedExperiments, rangeStart, rangeEnd),
    [scopedExperiments, rangeStart, rangeEnd]
  );
  const scheduledRows = rows.filter((row) => row.isScheduled);
  const exceptionRows = rows.filter((row) => !row.isScheduled);
  const exceptionGroups = useMemo(() => {
    const memberOrder = new Map(availableLabMembers.map((member, index) => [member, index]));
    const grouped = new Map<string, typeof exceptionRows>();
    for (const row of exceptionRows) {
      const key = row.record.labMember || "Unassigned";
      grouped.set(key, [...(grouped.get(key) ?? []), row]);
    }
    return Array.from(grouped.entries())
      .sort(([left], [right]) => {
        const leftOrder = memberOrder.get(left) ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = memberOrder.get(right) ?? Number.MAX_SAFE_INTEGER;
        return leftOrder === rightOrder ? left.localeCompare(right) : leftOrder - rightOrder;
      })
      .map(([labMember, groupRows]) => ({ labMember, rows: groupRows }));
  }, [availableLabMembers, exceptionRows]);
  const rangeText = `${formatDateLabel(rangeStart)} - ${formatDateLabel(rangeEndInclusive)}`;
  const selectedScopeText = selectionLabel(selectedLabMembers, availableLabMembers).replace(/-/g, " ");

  const handleSelection = (member: string, checked: boolean) => {
    setSelectedLabMembers((previous) => {
      const next = new Set(previous);
      if (checked) next.add(member);
      else next.delete(member);
      return uniqueSorted(Array.from(next));
    });
  };

  const handleToggleException = (recordId: string) => {
    setExpandedExceptionIds((previous) => {
      const next = new Set(previous);
      if (next.has(recordId)) next.delete(recordId);
      else next.add(recordId);
      return next;
    });
  };

  const handleExportPng = async () => {
    if (!svgRef.current) return;
    setExportError("");
    const filename = `gantt_${sanitizeFilenamePart(
      selectionLabel(selectedLabMembers, availableLabMembers)
    )}_${dateInputValue(rangeStart)}_to_${dateInputValue(rangeEndInclusive)}.png`;
    try {
      await exportSvgAsPng(svgRef.current, filename);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Unable to export the chart.");
    }
  };

  return (
    <section className="gantt-panel" aria-label="Gantt chart">
      <header className="gantt-panel__header">
        <div className="gantt-panel__title-block">
          <span className="gantt-panel__eyebrow">Timeline report</span>
          <h2>Gantt chart</h2>
          <p>{rangeText}</p>
        </div>
        <div className="gantt-toolbar">
          <button className="button button--secondary" type="button" onClick={handleExportPng}>
            Download PNG
          </button>
          <button className="button button--secondary" type="button" onClick={printGantt}>
            Print / Save as PDF
          </button>
        </div>
      </header>

      <div className="gantt-summary-strip" aria-label="Gantt summary">
        <div className="gantt-summary-card">
          <span>Scheduled</span>
          <strong>{scheduledRows.length}</strong>
        </div>
        <div className="gantt-summary-card">
          <span>Needs repair</span>
          <strong>{exceptionRows.length}</strong>
        </div>
        <div className="gantt-summary-card">
          <span>Tasks in scope</span>
          <strong>{scopedExperiments.length}</strong>
        </div>
        {mode === "manager" ? (
          <div className="gantt-summary-card">
            <span>Employees</span>
            <strong>
              {selectedLabMembers.length}/{availableLabMembers.length}
            </strong>
          </div>
        ) : null}
      </div>

      <section className="gantt-filter-card" aria-label="Date range">
        <div>
          <strong>Date range</strong>
          <p className="muted-row">The end date is included in the timeline.</p>
        </div>
        <div className="gantt-controls">
          <label className="field gantt-control-field">
            <span>Start date</span>
            <input
              type="date"
              value={dateInputValue(rangeStart)}
              onChange={(event) => {
                const next = parseDateInput(event.target.value, rangeStart);
                setRangeStart(next);
                if (next > rangeEndInclusive) setRangeEndInclusive(next);
              }}
            />
          </label>
          <label className="field gantt-control-field">
            <span>End date</span>
            <input
              type="date"
              value={dateInputValue(rangeEndInclusive)}
              onChange={(event) => {
                const next = parseDateInput(event.target.value, rangeEndInclusive);
                setRangeEndInclusive(next);
                if (next < rangeStart) setRangeStart(next);
              }}
            />
          </label>
        </div>
      </section>

      {mode === "manager" ? (
        <section className="gantt-selector" aria-label="Employee selection">
          <header>
            <div>
              <strong>Employees in chart</strong>
              <p className="muted-row">
                {selectedLabMembers.length} of {availableLabMembers.length} selected
              </p>
            </div>
            <div className="gantt-selector__toolbar">
              <button
                className="button button--ghost"
                type="button"
                onClick={() => setSelectedLabMembers(availableLabMembers)}
              >
                All
              </button>
              <button className="button button--ghost" type="button" onClick={() => setSelectedLabMembers([])}>
                None
              </button>
            </div>
          </header>
          <div className="gantt-selector__grid">
            {availableLabMembers.map((member) => {
              const profile = labMemberProfiles[member];
              return (
                <label
                  className="gantt-selector__option"
                  style={memberStyleVars(profile)}
                  key={member}
                >
                  <input
                    type="checkbox"
                    checked={selectedSet.has(member)}
                    onChange={(event) => handleSelection(member, event.target.checked)}
                  />
                  {profile ? <LabMemberAvatar profile={profile} /> : null}
                  <span>{member}</span>
                </label>
              );
            })}
          </div>
        </section>
      ) : null}

      {exportError ? <p className="error-text">{exportError}</p> : null}

      <div className="gantt-print-region" data-print-region="gantt">
        <div className="gantt-print-heading">
          <strong>{rangeText}</strong>
          <span>{selectedScopeText}</span>
        </div>

        {scopedExperiments.length === 0 ? (
          <div className="gantt-empty-state">
            <strong>No selected tasks</strong>
            <p>Select at least one employee or adjust the task-log scope to render a chart.</p>
          </div>
        ) : null}
        {scopedExperiments.length > 0 && scheduledRows.length === 0 ? (
          <div className="gantt-empty-state">
            <strong>No scheduled bars in this range</strong>
            <p>Adjust the start or end date, or fix the unscheduled tasks listed below.</p>
          </div>
        ) : null}

        <div className="gantt-scroll">
          <GanttChart ref={svgRef} rows={scheduledRows} rangeStart={rangeStart} rangeEnd={rangeEnd} />
        </div>

        {exceptionRows.length > 0 ? (
          <section className="gantt-exceptions" aria-label="Unscheduled or invalid-date tasks">
            <header className="gantt-exceptions__header">
              <span className="gantt-panel__eyebrow">Repair queue</span>
              <h3>Unscheduled or invalid-date tasks</h3>
              <p className="muted-row">Fix these fields to place the tasks on the timeline.</p>
            </header>
            <div className="gantt-exception-list">
              {exceptionGroups.map(({ labMember, rows: groupRows }) => {
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
                        {groupProfile ? <LabMemberAvatar profile={groupProfile} /> : null}
                        <strong>{labMember}</strong>
                      </span>
                      <span>{groupRows.length} tasks</span>
                    </header>
                    <div className="gantt-exception-group__cards">
                      {groupRows.map((row) => {
                        const reasons = [
                          !row.start ? "Missing start date" : "",
                          row.invalidStart ? "Invalid start date format" : "",
                          row.invalidEnd ? "Invalid projected end date format" : "",
                          !row.invalidEnd && !row.end ? "Missing projected end date" : ""
                        ].filter(Boolean);
                        const profile = labMemberProfiles[row.record.labMember];
                        const expanded = expandedExceptionIds.has(row.record.id);

                        return (
                          <article
                            className="gantt-exception-card"
                            style={memberStyleVars(profile)}
                            key={row.record.id}
                          >
                            <div className="gantt-exception-card__topline">
                              <span className="gantt-exception-card__identity">
                                {profile ? <LabMemberAvatar profile={profile} /> : null}
                                <span>{row.record.labMember}</span>
                              </span>
                              <span className="gantt-exception-card__badge">Needs repair</span>
                            </div>
                            <strong>{row.record.experiment || "(Untitled task)"}</strong>
                            <span className="gantt-exception-card__meta">
                              {row.record.project || "(No project)"}
                            </span>
                            <ul className="gantt-exception-card__reasons">
                              {(reasons.length ? reasons : ["Not scheduled in this window"]).map((reason) => (
                                <li key={reason}>{reason}</li>
                              ))}
                            </ul>
                            <span className="gantt-exception-card__dates">
                              Start {formatDateLabel(row.record.startDateRaw)} · End{" "}
                              {formatDateLabel(row.record.projectedEndDateRaw)}
                            </span>
                            {expanded ? <TaskDetailGrid record={row.record} /> : null}
                            <button
                              className="button button--ghost gantt-exception-card__action"
                              type="button"
                              onClick={() => handleToggleException(row.record.id)}
                              aria-expanded={expanded}
                            >
                              {expanded ? "See less" : "See more"}
                            </button>
                            {onEditTask ? (
                              <button
                                className="button button--primary gantt-exception-card__action"
                                type="button"
                                onClick={() => onEditTask(row.record)}
                              >
                                Fix task
                              </button>
                            ) : null}
                          </article>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>
    </section>
  );
}
