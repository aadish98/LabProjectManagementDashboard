import type { ExperimentDraft, ExperimentRecord, SheetRegistryEntry } from "../domain/experiment";
import type { RunLogAuditWrite } from "../services/sheets/admin";
import { extractIdFromUrl } from "../services/sheets/helpers";

const TASK_FIELDS: ReadonlyArray<keyof ExperimentDraft> = [
  "project",
  "experiment",
  "schematic",
  "timeEstimate",
  "startDateRaw",
  "projectedEndDateRaw",
  "status",
  "result",
  "dataLink",
  "notebookLocation",
  "comments"
];

export function changedTaskFields(
  previous: ExperimentRecord,
  next: ExperimentDraft
): string[] {
  return TASK_FIELDS.filter(
    (field) => String(previous[field] ?? "") !== String(next[field] ?? "")
  );
}

export function createdTaskFields(draft: ExperimentDraft): string[] {
  return TASK_FIELDS.filter((field) => String(draft[field] ?? "").trim() !== "");
}

export function buildManagerAuditEntry(input: {
  actorEmail: string;
  destination: Pick<
    SheetRegistryEntry,
    "memberId" | "labMember" | "taskLogUrl" | "activeSheetName"
  >;
  taskId: string;
  action: RunLogAuditWrite["action"];
  changedFields: string[];
  status: string;
  timestamp?: string;
  note?: string;
}): RunLogAuditWrite {
  const workbookId = extractIdFromUrl(input.destination.taskLogUrl);
  return {
    timestamp: input.timestamp ?? new Date().toISOString(),
    actorEmail: input.actorEmail,
    memberId: input.destination.memberId,
    taskId: input.taskId,
    workbook: `${workbookId || input.destination.taskLogUrl}#${input.destination.activeSheetName}`,
    action: input.action,
    changedFields: input.changedFields,
    labMember: input.destination.labMember,
    taskLogUrl: input.destination.taskLogUrl,
    status: input.status,
    note: input.note
  };
}
