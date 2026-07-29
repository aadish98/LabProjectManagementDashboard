import type { UserRole } from "./app";

export const experimentHeaders = [
  "Project",
  "Experiment",
  "Time Estimate",
  "Start Date",
  "Projected End Date",
  "Status",
  "Schematic",
  "Result",
  "Link to Data",
  "Comments/ Improvements",
  "Notebook Location"
] as const;

export type NormalizedStatus =
  | "planned"
  | "inProgress"
  | "completed"
  | "blocked"
  | "unknown";

export type KanbanLane = "inProgress" | "overdue" | "planned" | "completed";

export interface SheetRegistryEntry {
  /** Immutable identity. Legacy rows may omit it until setup backfills one. */
  memberId?: string;
  labMember: string;
  taskLogUrl: string;
  activeSheetName: string;
  active: boolean;
  /** Monotonic compatibility-mirror revision. Legacy rows parse as revision 0. */
  revision?: number;
}

/**
 * Reasons a `SheetRegistry` row could not be loaded into the live registry.
 * Surfaced to the manager so silent drops are visible.
 */
export type RegistryRowIssue =
  | "missingLabMember"
  | "missingTaskLogUrl"
  | "missingActiveSheetName"
  | "invalidTaskLogUrl";

export interface RegistryRowProblem {
  rowNumber: number;
  memberId?: string;
  labMember: string;
  taskLogUrl: string;
  activeSheetName: string;
  active: boolean;
  issues: RegistryRowIssue[];
}

/**
 * A `SheetRegistry` row whose task-log workbook is reachable but whose
 * `Active Sheet` no longer matches a tab in that workbook. The dashboard
 * still loads other lab members; the manager is shown which row to fix.
 */
export interface StaleTaskLogTab {
  memberId?: string;
  labMember: string;
  taskLogUrl: string;
  activeSheetName: string;
  reason: string;
}

export interface ExperimentDraft {
  /** Immutable sheet identity. Required for mutation, optional for legacy parsing. */
  taskId?: string;
  memberId?: string;
  rowNumber?: number | null;
  labMember: string;
  taskLogUrl: string;
  activeSheetName: string;
  project: string;
  experiment: string;
  schematic: string;
  timeEstimate: string;
  startDateRaw: string;
  projectedEndDateRaw: string;
  status: string;
  result: string;
  dataLink: string;
  notebookLocation: string;
  comments: string;
}

export interface ExperimentRecord extends ExperimentDraft {
  id: string;
  /** Monotonic optimistic-concurrency token stored in `Task Revision`. */
  taskRevision?: number;
}

export interface ComplianceResult {
  missingFields: string[];
  overdue: boolean;
  completedMissingResult: boolean;
  completedMissingDataLink: boolean;
  isCompliant: boolean;
  feedback: string;
  normalizedStatus: NormalizedStatus;
  lane: KanbanLane;
}

export interface EmployeeReport {
  labMember: string;
  totalExperiments: number;
  compliantCount: number;
  flaggedCount: number;
  missingFieldsCount: number;
  overdueCount: number;
  completedMissingResultCount: number;
  completedMissingDataLinkCount: number;
  generatedFeedback: string;
  latestFeedback?: string;
}

export interface RunLogEntry {
  timestamp: string;
  labMember: string;
  taskLogUrl: string;
  status: string;
  note: string;
  actorEmail?: string;
  memberId?: string;
  taskId?: string;
  workbook?: string;
  action?: string;
  changedFields?: string[];
}

export interface FeedbackHistoryEntry {
  runAt: string;
  message: string;
}

export interface FeedbackThread {
  labMember: string;
  entries: FeedbackHistoryEntry[];
}

export interface RoleDirectoryEntry {
  /** Preferred immutable link to a registry row; name is the legacy fallback. */
  memberId?: string;
  email: string;
  role: Extract<UserRole, "employee" | "manager" | "pi">;
  labMember?: string;
  active?: boolean;
  revision?: number;
}

export type MemberLoadIssueCode =
  | "network"
  | "forbidden"
  | "pickerGrant"
  | "notFound"
  | "schema"
  | "conflict"
  | "unknown";

export interface MemberLoadIssue {
  memberId?: string;
  labMember: string;
  taskLogUrl: string;
  activeSheetName: string;
  code: MemberLoadIssueCode;
  message: string;
  status?: number;
  operation?: string;
}

/**
 * Resolved profile picture for a single lab member. Carried alongside
 * the dataset so manager renderers can hydrate `LabMemberProfile` without
 * making another Sheets call. The `source` flag is for diagnostics: it
 * lets us tell at a glance whether the image came from a live read or
 * from the local cache fallback.
 */
export interface LabMemberProfilePicture {
  labMember: string;
  /** Resized image data URL, or undefined when initials/colors should win. */
  profilePictureDataUrl?: string;
  /** ISO timestamp written by the employee's setup gate. */
  updatedAt?: string;
  source: "live" | "cache" | "missing" | "error";
}

export interface DashboardDataset {
  source: "googleSheets";
  registry: SheetRegistryEntry[];
  experiments: ExperimentRecord[];
  runLog: RunLogEntry[];
  feedbackThreads: FeedbackThread[];
  roleDirectory: RoleDirectoryEntry[];
  lastSyncedAt: string;
  syncNote?: string;
  cacheVersion?: number;
  cacheInvalidatedAt?: string;
  cacheStaleReason?: string;
  /**
   * Registry rows that did not pass validation. These are not silently
   * dropped any more; the manager dashboard surfaces them so the operator
   * can fix the central admin workbook.
   */
  registryProblems?: RegistryRowProblem[];
  /**
   * Active registry rows whose `Active Sheet` no longer exists in the
   * referenced task-log workbook. Surfaced so the manager can repair the
   * registry without the whole dashboard load aborting.
   */
  staleTaskLogs?: StaleTaskLogTab[];
  /**
   * Per-member task-log failures. Accessible members remain in the dataset,
   * so one sharing or network problem cannot erase healthy records.
   */
  memberLoadIssues?: MemberLoadIssue[];
  /**
   * Profile pictures resolved from each employee task-log workbook's
   * `Profile` tab, or from the local manager cache when the live read
   * failed or returned nothing. Empty entries are kept so renderers know
   * the lookup happened.
   */
  profilePictures?: LabMemberProfilePicture[];
}
