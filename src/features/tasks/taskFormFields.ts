import type { EmployeeSheetPrefs } from "../../domain/app";
import type {
  ExperimentDraft,
  ExperimentRecord,
  SheetRegistryEntry
} from "../../domain/experiment";
import { formatDateInputValue } from "../../utils/date";

export const TASK_STATUS_OPTIONS = [
  "Planned",
  "In Progress",
  "Ongoing",
  "Complete",
  "Blocked"
] as const;

export const MANAGER_CREATE_STATUS_OPTIONS = TASK_STATUS_OPTIONS.filter(
  (status) => status !== "Complete"
);

export interface TaskFormPermissionRules {
  statusOptions: readonly string[];
  showCompletionFields: boolean;
}

export const TASK_FORM_PERMISSION_RULES = {
  member: {
    statusOptions: TASK_STATUS_OPTIONS,
    showCompletionFields: true
  },
  managerCreate: {
    statusOptions: MANAGER_CREATE_STATUS_OPTIONS,
    showCompletionFields: false
  },
  managerEdit: {
    statusOptions: TASK_STATUS_OPTIONS,
    showCompletionFields: true
  }
} satisfies Record<string, TaskFormPermissionRules>;

export const CREATE_REQUIRED_FIELDS: ReadonlyArray<{
  key: keyof ExperimentDraft;
  label: string;
  idSuffix: string;
  complianceLabel: string;
}> = [
  { key: "project", label: "Project", idSuffix: "project", complianceLabel: "Project" },
  { key: "experiment", label: "Task", idSuffix: "experiment", complianceLabel: "Experiment" },
  {
    key: "timeEstimate",
    label: "Time estimate",
    idSuffix: "time-estimate",
    complianceLabel: "Time Estimate"
  },
  { key: "startDateRaw", label: "Start date", idSuffix: "start-date", complianceLabel: "Start Date" },
  {
    key: "projectedEndDateRaw",
    label: "Projected end date",
    idSuffix: "projected-end-date",
    complianceLabel: "Projected End Date"
  },
  { key: "schematic", label: "Schematic", idSuffix: "schematic", complianceLabel: "Schematic" },
  { key: "dataLink", label: "Link to data", idSuffix: "data-link", complianceLabel: "Link to Data" }
];

export interface TaskValidationIssue {
  key: keyof ExperimentDraft;
  label: string;
  idSuffix: string;
  complianceLabel: string;
  message: string;
}

export function blankTaskDraft(
  labMember: string,
  context: Pick<EmployeeSheetPrefs, "taskLogUrl" | "activeSheetName">
): ExperimentDraft {
  return {
    rowNumber: null,
    labMember,
    taskLogUrl: context.taskLogUrl,
    activeSheetName: context.activeSheetName,
    project: "",
    experiment: "",
    schematic: "",
    timeEstimate: "",
    startDateRaw: "",
    projectedEndDateRaw: "",
    status: "Planned",
    result: "",
    dataLink: "",
    notebookLocation: "",
    comments: ""
  };
}

export function taskDraftFromRecord(record: ExperimentRecord): ExperimentDraft {
  return {
    rowNumber: record.rowNumber,
    labMember: record.labMember,
    taskLogUrl: record.taskLogUrl,
    activeSheetName: record.activeSheetName,
    project: record.project,
    experiment: record.experiment,
    schematic: record.schematic,
    timeEstimate: record.timeEstimate,
    startDateRaw: formatDateInputValue(record.startDateRaw, "first"),
    projectedEndDateRaw: formatDateInputValue(record.projectedEndDateRaw, "last"),
    status: record.status || "Planned",
    result: record.result,
    dataLink: record.dataLink,
    notebookLocation: record.notebookLocation,
    comments: record.comments
  };
}

export function getMissingCreateTaskFields(draft: ExperimentDraft): string[] {
  return getCreateTaskValidationIssues(draft).map(({ label }) => label);
}

export function getCreateTaskValidationIssues(
  draft: ExperimentDraft
): TaskValidationIssue[] {
  return CREATE_REQUIRED_FIELDS.filter(({ key }) => {
    const value = draft[key];
    return typeof value !== "string" || !value.trim();
  }).map((field) => ({
    ...field,
    message: `${field.label} is required.`
  }));
}

export function getCreateTaskValidationError(draft: ExperimentDraft): string {
  const missing = getCreateTaskValidationIssues(draft).map(({ label }) => label);
  return missing.length > 0 ? `Please fill in: ${missing.join(", ")}.` : "";
}

export function getCreateTaskMissingFields(draft: ExperimentDraft): ReadonlySet<string> {
  return new Set(
    getCreateTaskValidationIssues(draft).map(({ complianceLabel }) => complianceLabel)
  );
}

export function getInitialAssigneeId(
  registry: SheetRegistryEntry[],
  requestedMemberId?: string
): string {
  if (!requestedMemberId) return "";
  return registry.some((entry) => entry.memberId === requestedMemberId)
    ? requestedMemberId
    : "";
}

export function resolveAssigneeContext(
  registry: SheetRegistryEntry[],
  memberId: string
): SheetRegistryEntry | undefined {
  if (!memberId) return undefined;
  return registry.find((entry) => entry.memberId === memberId);
}
