import { StatusBanner } from "../../components/ui";
import {
  GanttHeader,
  GanttMemberSelector,
  GanttRangeControls,
  GanttSummary
} from "./GanttControls";
import { GanttExceptions } from "./GanttExceptions";
import { GanttTimeline } from "./GanttTimeline";
import {
  useGanttViewModel,
  type GanttViewProps
} from "./useGanttViewModel";
import "./gantt.css";

export function GanttView({
  mode,
  experiments,
  labMembers,
  defaultSelection,
  labMemberProfiles = {},
  onEditTask
}: GanttViewProps) {
  const model = useGanttViewModel({
    mode,
    experiments,
    labMembers,
    defaultSelection
  });

  return (
    <section className="gantt-panel" aria-label="Gantt chart">
      <GanttHeader model={model} />
      <div className="gantt-panel__body">
        <GanttSummary mode={mode} model={model} />
        <GanttRangeControls model={model} />
        {mode === "manager" ? (
          <GanttMemberSelector
            model={model}
            labMemberProfiles={labMemberProfiles}
          />
        ) : null}

        {model.exportError ? (
          <StatusBanner tone="error" onDismiss={() => model.setExportError("")}>
            {model.exportError}
          </StatusBanner>
        ) : null}

        <div className="gantt-print-region" data-print-region="gantt">
          <div className="gantt-print-heading">
            <strong>{model.humanRange}</strong>
            <span>{model.selectedScopeText}</span>
          </div>
          <GanttTimeline model={model} labMemberProfiles={labMemberProfiles} />
          <GanttExceptions
            model={model}
            labMemberProfiles={labMemberProfiles}
            onEditTask={onEditTask}
          />
        </div>
      </div>
    </section>
  );
}
