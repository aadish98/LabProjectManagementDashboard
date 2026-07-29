import { useEffect, useMemo, useState } from "react";
import { evaluateCompliance, summarizeEmployeeReports } from "../../domain/compliance";
import type {
  DashboardDataset,
  ExperimentRecord,
  KanbanLane
} from "../../domain/experiment";
import { buildLabMemberProfiles } from "../../domain/people";
import { readManagerTabOrder, writeManagerTabOrder } from "../../services/cache";

export const ALL_EMPLOYEES_TAB = "__all__";

export const MANAGER_LANES: Array<{ key: KanbanLane; label: string }> = [
  { key: "inProgress", label: "In Progress" },
  { key: "overdue", label: "Overdue" },
  { key: "planned", label: "Planned" },
  { key: "completed", label: "Completed" }
];

function groupRecordsByLane(records: ExperimentRecord[]): Record<KanbanLane, ExperimentRecord[]> {
  const grouped: Record<KanbanLane, ExperimentRecord[]> = {
    inProgress: [],
    overdue: [],
    planned: [],
    completed: []
  };
  for (const record of records) {
    grouped[evaluateCompliance(record).lane].push(record);
  }
  grouped.completed.sort((a, b) => (b.rowNumber ?? 0) - (a.rowNumber ?? 0));
  return grouped;
}

export function useManagerDashboard(
  sessionEmail: string,
  dataset: DashboardDataset,
  visibleLabMembers: string[]
) {
  const visibleLabMemberSignature = visibleLabMembers.join("|");
  const [activeTab, setActiveTab] = useState(ALL_EMPLOYEES_TAB);
  const [tabOrder, setTabOrder] = useState<string[]>(() => [
    ALL_EMPLOYEES_TAB,
    ...(readManagerTabOrder(sessionEmail) ?? [])
  ]);
  const [selectedLabMembers, setSelectedLabMembers] = useState<string[]>(() => visibleLabMembers);
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const stored = readManagerTabOrder(sessionEmail) ?? [];
    const knownEmployees = new Set(visibleLabMembers);
    const orderedKnown = stored.filter((tab) => knownEmployees.has(tab));
    const remaining = visibleLabMembers.filter((member) => !orderedKnown.includes(member));
    const next = [ALL_EMPLOYEES_TAB, ...orderedKnown, ...remaining];
    setTabOrder(next);
    if (!next.includes(activeTab)) setActiveTab(ALL_EMPLOYEES_TAB);
  }, [activeTab, sessionEmail, visibleLabMemberSignature]);

  useEffect(() => {
    setSelectedLabMembers((previous) => {
      const allowed = new Set(visibleLabMembers);
      const next = previous.filter((member) => allowed.has(member));
      return next.length > 0 ? next : visibleLabMembers;
    });
  }, [visibleLabMemberSignature]);

  const profilePicturesByLabMember = useMemo(() => {
    if (!dataset.profilePictures) return undefined;
    const output: Record<string, string | undefined> = {};
    for (const entry of dataset.profilePictures) {
      if (entry.profilePictureDataUrl) output[entry.labMember] = entry.profilePictureDataUrl;
    }
    return output;
  }, [dataset.profilePictures]);

  const labMemberProfiles = useMemo(
    () => buildLabMemberProfiles(dataset.registry, visibleLabMembers, profilePicturesByLabMember),
    [dataset.registry, visibleLabMembers, profilePicturesByLabMember]
  );
  const selectedLabMemberSet = useMemo(() => new Set(selectedLabMembers), [selectedLabMembers]);
  const activeLabMembers = useMemo(() => {
    if (activeTab !== ALL_EMPLOYEES_TAB) {
      return visibleLabMembers.includes(activeTab) ? [activeTab] : [];
    }
    return visibleLabMembers.filter((member) => selectedLabMemberSet.has(member));
  }, [activeTab, selectedLabMemberSet, visibleLabMembers]);
  const activeLabMemberSet = useMemo(() => new Set(activeLabMembers), [activeLabMembers]);
  const filteredExperiments = useMemo(
    () => dataset.experiments.filter((record) => activeLabMemberSet.has(record.labMember)),
    [dataset.experiments, activeLabMemberSet]
  );
  const lanes = useMemo(() => groupRecordsByLane(filteredExperiments), [filteredExperiments]);
  const ownerGroupedLanes = useMemo(() => {
    const result: Record<
      KanbanLane,
      Array<{ labMember: string; records: ExperimentRecord[] }>
    > = {
      inProgress: [],
      overdue: [],
      planned: [],
      completed: []
    };
    for (const lane of MANAGER_LANES) {
      const byMember = new Map<string, ExperimentRecord[]>();
      for (const record of lanes[lane.key]) {
        const bucket = byMember.get(record.labMember);
        if (bucket) bucket.push(record);
        else byMember.set(record.labMember, [record]);
      }
      for (const labMember of activeLabMembers) {
        const records = byMember.get(labMember);
        if (records?.length) result[lane.key].push({ labMember, records });
      }
    }
    return result;
  }, [lanes, activeLabMembers]);

  const reports = useMemo(
    () => summarizeEmployeeReports(filteredExperiments, dataset.feedbackThreads),
    [filteredExperiments, dataset.feedbackThreads]
  );
  const metrics = useMemo(() => {
    let compliant = 0;
    let overdue = 0;
    let missingCloseout = 0;
    for (const record of filteredExperiments) {
      const compliance = evaluateCompliance(record);
      if (compliance.isCompliant) compliant += 1;
      if (compliance.overdue) overdue += 1;
      if (compliance.completedMissingDataLink || compliance.completedMissingResult) {
        missingCloseout += 1;
      }
    }
    return { total: filteredExperiments.length, compliant, overdue, missingCloseout };
  }, [filteredExperiments]);

  const handleReorder = (next: string[]) => {
    setTabOrder(next);
    writeManagerTabOrder(
      sessionEmail,
      next.filter((tab) => tab !== ALL_EMPLOYEES_TAB)
    );
  };
  const handleToggleLabMember = (labMember: string, checked: boolean) => {
    setSelectedLabMembers((previous) => {
      const next = new Set(previous);
      if (checked) next.add(labMember);
      else next.delete(labMember);
      return visibleLabMembers.filter((member) => next.has(member));
    });
  };
  const handleToggleExpandedTask = (recordId: string) => {
    setExpandedTaskIds((previous) => {
      const next = new Set(previous);
      if (next.has(recordId)) next.delete(recordId);
      else next.add(recordId);
      return next;
    });
  };

  return {
    activeTab,
    setActiveTab,
    tabOrder,
    selectedLabMembers,
    setSelectedLabMembers,
    selectedLabMemberSet,
    activeLabMembers,
    filteredExperiments,
    ganttExperiments: filteredExperiments,
    lanes,
    ownerGroupedLanes,
    reports,
    metrics,
    labMemberProfiles,
    expandedTaskIds,
    handleReorder,
    handleToggleLabMember,
    handleToggleExpandedTask
  };
}
