import type {
  RegistryRowProblem,
  RoleDirectoryEntry,
  SheetRegistryEntry
} from "../../../domain/experiment";

export interface ParsedRegistry {
  entries: SheetRegistryEntry[];
  problems: RegistryRowProblem[];
}

export const ADMIN_REGISTRY_HEADERS: ReadonlyArray<string> = [
  "Lab Member",
  "Task Log URL",
  "Active Sheet",
  "Active",
  "Member ID",
  "Revision"
];

export const ADMIN_ROLES_HEADERS: ReadonlyArray<string> = [
  "Email",
  "Role",
  "Lab Member",
  "Member ID",
  "Revision",
  "Active"
];

export const RUN_LOG_HEADERS: ReadonlyArray<string> = [
  "Timestamp",
  "Actor Email",
  "Member ID",
  "Task ID",
  "Workbook",
  "Action",
  "Changed Fields",
  "Lab Member",
  "Task Log URL",
  "Status",
  "Note"
];

export interface RunLogAuditWrite {
  timestamp: string;
  actorEmail: string;
  memberId?: string;
  taskId: string;
  workbook: string;
  action: "task.created" | "task.updated" | "task.completed";
  changedFields: string[];
  labMember: string;
  taskLogUrl: string;
  status: string;
  note?: string;
}

export interface AdminTabResolution {
  sheetId: number;
  title: string;
}

export interface AdminWorkbookOverview {
  spreadsheetId: string;
  spreadsheetTitle: string;
  setupRepairIssues: string[];
  registry: SheetRegistryEntry[];
  registryProblems: RegistryRowProblem[];
  roles: RoleDirectoryEntry[];
  rolesState: "missing" | "invalid" | "canonicalEmpty" | "canonicalNonEmpty";
}

export interface RegistryWriteRow {
  memberId: string;
  labMember: string;
  taskLogUrl: string;
  activeSheetName: string;
  active: boolean;
  revision?: number;
  expectedRevision?: number;
}

export interface RoleWriteRow {
  memberId: string;
  email: string;
  role: "manager" | "employee" | "pi";
  labMember?: string;
  active?: boolean;
  revision?: number;
  expectedRevision?: number;
}

export interface MemberRoleMirrorUpdate {
  memberId: string;
  rows: RoleWriteRow[];
  revision?: number;
  expectedRevision?: number;
}

export interface MemberCompatibilityMirrorUpdate {
  memberId: string;
  registry?: RegistryWriteRow;
  roles: RoleWriteRow[];
  revision: number;
  expectedRevision?: number;
}

export interface AdminValueRange {
  range: string;
  values: string[][];
}
