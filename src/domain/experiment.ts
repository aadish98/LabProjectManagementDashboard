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
  labMember: string;
  taskLogUrl: string;
  activeSheetName: string;
  active: boolean;
  profilePictureUrl?: string;
}

export interface ExperimentDraft {
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
  email: string;
  role: Extract<UserRole, "employee" | "manager">;
  labMember?: string;
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
}
