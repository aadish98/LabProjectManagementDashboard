import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent
} from "react";
import type { ExperimentRecord } from "../../domain/experiment";
import type { LabMemberProfile } from "../../domain/people";
import { exportSvgAsPng } from "./exporters";
import { tasksInRange } from "./windowing";
import type { GanttDensity } from "./GanttChart";
import {
  addDays,
  dateInputValue,
  formatHumanRange,
  pixelsPerDay,
  rangeForPreset,
  sanitizeFilenamePart,
  selectionLabel,
  spanInDays,
  startOfDay,
  uniqueSorted,
  type RangePreset
} from "./viewUtils";

export interface GanttViewProps {
  mode: "employee" | "manager";
  experiments: ExperimentRecord[];
  labMembers: string[];
  defaultSelection?: string[];
  labMemberProfiles?: Record<string, LabMemberProfile>;
  onEditTask?: (record: ExperimentRecord) => void;
}

export function useGanttViewModel({
  mode,
  experiments,
  labMembers,
  defaultSelection
}: Pick<GanttViewProps, "mode" | "experiments" | "labMembers" | "defaultSelection">) {
  const initialPreset = rangeForPreset("thisQuarter");
  const [rangeStart, setRangeStart] = useState<Date>(
    initialPreset?.start ?? startOfDay(new Date())
  );
  const [rangeEndInclusive, setRangeEndInclusive] = useState<Date>(
    initialPreset?.endInclusive ?? addDays(startOfDay(new Date()), 89)
  );
  const [activePreset, setActivePreset] =
    useState<RangePreset["id"]>("thisQuarter");
  const [density, setDensity] = useState<GanttDensity>("comfortable");
  const availableLabMembers = useMemo(
    () =>
      uniqueSorted(
        labMembers.length ? labMembers : experiments.map((record) => record.labMember)
      ),
    [experiments, labMembers]
  );
  const [selectedLabMembers, setSelectedLabMembers] = useState<string[]>(() =>
    uniqueSorted(defaultSelection?.length ? defaultSelection : availableLabMembers)
  );
  const [expandedExceptionIds, setExpandedExceptionIds] = useState<Set<string>>(
    () => new Set()
  );
  const [exportError, setExportError] = useState("");
  const svgRef = useRef<SVGSVGElement | null>(null);
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);
  const panInstructionsId = useId();

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
  const { scheduledRows, exceptionRows } = useMemo(
    () => ({
      scheduledRows: rows.filter((row) => row.isScheduled),
      exceptionRows: rows.filter((row) => !row.isScheduled)
    }),
    [rows]
  );
  const exceptionGroups = useMemo(() => {
    const memberOrder = new Map(
      availableLabMembers.map((member, index) => [member, index])
    );
    const grouped = new Map<string, typeof exceptionRows>();
    for (const row of exceptionRows) {
      const key = row.record.labMember || "Unassigned";
      grouped.set(key, [...(grouped.get(key) ?? []), row]);
    }
    return Array.from(grouped.entries())
      .sort(([left], [right]) => {
        const leftOrder = memberOrder.get(left) ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = memberOrder.get(right) ?? Number.MAX_SAFE_INTEGER;
        return leftOrder === rightOrder
          ? left.localeCompare(right)
          : leftOrder - rightOrder;
      })
      .map(([labMember, groupRows]) => ({ labMember, rows: groupRows }));
  }, [availableLabMembers, exceptionRows]);

  const humanRange = formatHumanRange(rangeStart, rangeEndInclusive);
  const days = spanInDays(rangeStart, rangeEndInclusive);
  const selectedScopeText = selectionLabel(
    selectedLabMembers,
    availableLabMembers
  ).replace(/-/g, " ");

  const applyPreset = (presetId: RangePreset["id"]) => {
    if (presetId === "custom") {
      setActivePreset("custom");
      return;
    }
    const next = rangeForPreset(presetId);
    if (!next) return;
    setActivePreset(presetId);
    setRangeStart(next.start);
    setRangeEndInclusive(next.endInclusive);
  };

  const setCustomRangeStart = (next: Date) => {
    setRangeStart(next);
    if (next > rangeEndInclusive) setRangeEndInclusive(next);
    setActivePreset("custom");
  };

  const setCustomRangeEnd = (next: Date) => {
    setRangeEndInclusive(next);
    if (next < rangeStart) setRangeStart(next);
    setActivePreset("custom");
  };

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
      setExportError(
        error instanceof Error ? error.message : "Unable to export the chart."
      );
    }
  };

  const handleTimelineKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const amount = event.shiftKey ? 320 : 80;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      timelineScrollRef.current?.scrollBy({
        left: event.key === "ArrowLeft" ? -amount : amount,
        behavior: "auto"
      });
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      timelineScrollRef.current?.scrollTo({
        left: event.key === "Home" ? 0 : timelineScrollRef.current.scrollWidth,
        behavior: "auto"
      });
    }
  };

  return {
    activePreset,
    applyPreset,
    availableLabMembers,
    days,
    density,
    exceptionGroups,
    exceptionRows,
    expandedExceptionIds,
    exportError,
    handleExportPng,
    handleSelection,
    handleTimelineKeyDown,
    handleToggleException,
    humanRange,
    panInstructionsId,
    pxPerDay: pixelsPerDay(days),
    rangeEnd,
    rangeEndInclusive,
    rangeStart,
    scheduledRows,
    scopedExperiments,
    selectedLabMembers,
    selectedScopeText,
    selectedSet,
    setCustomRangeEnd,
    setCustomRangeStart,
    setDensity,
    setExportError,
    setSelectedLabMembers,
    svgRef,
    timelineScrollRef
  };
}

export type GanttViewModel = ReturnType<typeof useGanttViewModel>;
