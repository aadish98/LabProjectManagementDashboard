import type { LabMemberProfile } from "../../domain/people";
import { LabMemberAvatar, memberStyleVars } from "../../components/LabMemberAvatar";
import { printGantt } from "./exporters";
import type { GanttViewModel } from "./useGanttViewModel";
import { dateInputValue, parseDateInput, RANGE_PRESETS } from "./viewUtils";

interface GanttControlsProps {
  mode: "employee" | "manager";
  model: GanttViewModel;
  labMemberProfiles: Record<string, LabMemberProfile>;
}

export function GanttHeader({ model }: Pick<GanttControlsProps, "model">) {
  return (
    <header className="gantt-panel__header">
      <div className="gantt-panel__title-block">
        <span className="gantt-panel__eyebrow">Timeline · Live</span>
        <h2>
          Gantt <em>chart</em>
        </h2>
        <p>
          {model.humanRange} · {model.days} day{model.days === 1 ? "" : "s"} ·{" "}
          {model.selectedScopeText}
        </p>
      </div>
      <div className="gantt-toolbar" role="toolbar" aria-label="Gantt actions">
        <button type="button" className="button" onClick={model.handleExportPng}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 4v12" />
            <path d="m6 10 6 6 6-6" />
            <path d="M5 20h14" />
          </svg>
          PNG
        </button>
        <button type="button" className="button" onClick={printGantt}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 9V3h12v6" />
            <rect x="6" y="13" width="12" height="8" rx="1.5" />
            <path d="M4 9h16v6H4z" />
          </svg>
          Print
        </button>
        <span
          aria-hidden="true"
          style={{
            width: 1,
            height: 22,
            background: "var(--gantt-line)",
            margin: "0 0.15rem"
          }}
        />
        <div className="gantt-density" role="group" aria-label="Row density">
          <button
            type="button"
            aria-pressed={model.density === "comfortable"}
            onClick={() => model.setDensity("comfortable")}
          >
            Comfort
          </button>
          <button
            type="button"
            aria-pressed={model.density === "compact"}
            onClick={() => model.setDensity("compact")}
          >
            Compact
          </button>
        </div>
      </div>
    </header>
  );
}

export function GanttSummary({ mode, model }: Omit<GanttControlsProps, "labMemberProfiles">) {
  return (
    <div className="gantt-summary-strip" aria-label="Gantt summary">
      <div className="gantt-summary-card gantt-summary-card--accent">
        <span className="gantt-summary-card__label">Scheduled</span>
        <span className="gantt-summary-card__value">
          {model.scheduledRows.length}
          <span className="gantt-summary-card__suffix">in window</span>
        </span>
      </div>
      <div
        className={`gantt-summary-card${
          model.exceptionRows.length ? " gantt-summary-card--warn" : ""
        }`}
      >
        <span className="gantt-summary-card__label">Repair Queue</span>
        <span className="gantt-summary-card__value">
          {model.exceptionRows.length}
          <span className="gantt-summary-card__suffix">need fixes</span>
        </span>
      </div>
      <div className="gantt-summary-card">
        <span className="gantt-summary-card__label">In Scope</span>
        <span className="gantt-summary-card__value">
          {model.scopedExperiments.length}
          <span className="gantt-summary-card__suffix">tasks</span>
        </span>
      </div>
      <div className="gantt-summary-card">
        <span className="gantt-summary-card__label">
          {mode === "manager" ? "Members" : "Span"}
        </span>
        <span className="gantt-summary-card__value">
          {mode === "manager" ? model.selectedLabMembers.length : model.days}
          <span className="gantt-summary-card__suffix">
            {mode === "manager"
              ? `/ ${model.availableLabMembers.length}`
              : "days"}
          </span>
        </span>
      </div>
    </div>
  );
}

export function GanttRangeControls({ model }: Pick<GanttControlsProps, "model">) {
  return (
    <section className="gantt-filter-card" aria-label="Date range">
      <div className="gantt-filter-card__intro">
        <strong>Window</strong>
        <p>End date inclusive · pick a preset or set a custom span.</p>
        <div className="gantt-quick-ranges" role="group" aria-label="Quick ranges">
          {RANGE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={`gantt-chip${
                model.activePreset === preset.id ? " gantt-chip--active" : ""
              }`}
              aria-pressed={model.activePreset === preset.id}
              onClick={() => model.applyPreset(preset.id)}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>
      <div className="gantt-controls">
        <label className="gantt-control-field">
          <span>Start</span>
          <input
            type="date"
            value={dateInputValue(model.rangeStart)}
            onChange={(event) =>
              model.setCustomRangeStart(
                parseDateInput(event.target.value, model.rangeStart)
              )
            }
          />
        </label>
        <label className="gantt-control-field">
          <span>End</span>
          <input
            type="date"
            value={dateInputValue(model.rangeEndInclusive)}
            onChange={(event) =>
              model.setCustomRangeEnd(
                parseDateInput(event.target.value, model.rangeEndInclusive)
              )
            }
          />
        </label>
      </div>
    </section>
  );
}

export function GanttMemberSelector({
  model,
  labMemberProfiles
}: Omit<GanttControlsProps, "mode">) {
  return (
    <section className="gantt-selector" aria-label="Member selection">
      <header>
        <div>
          <strong>Members in chart</strong>
          <p>
            {model.selectedLabMembers.length} of {model.availableLabMembers.length} selected
          </p>
        </div>
        <div className="gantt-selector__toolbar">
          <button
            type="button"
            className="button"
            onClick={() => model.setSelectedLabMembers(model.availableLabMembers)}
          >
            All
          </button>
          <button
            type="button"
            className="button"
            onClick={() => model.setSelectedLabMembers([])}
          >
            None
          </button>
        </div>
      </header>
      <div className="gantt-selector__grid">
        {model.availableLabMembers.map((member) => {
          const profile = labMemberProfiles[member];
          return (
            <label
              className="gantt-selector__option"
              style={memberStyleVars(profile)}
              key={member}
            >
              <input
                type="checkbox"
                checked={model.selectedSet.has(member)}
                onChange={(event) =>
                  model.handleSelection(member, event.target.checked)
                }
              />
              {profile ? (
                <LabMemberAvatar profile={profile} className="lab-member-avatar--sm" />
              ) : null}
              <span>{member}</span>
            </label>
          );
        })}
      </div>
    </section>
  );
}
