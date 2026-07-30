export type UserRole = "guest" | "unauthorized" | "employee" | "manager" | "pi";

/**
 * Fixed compatibility-workbook tab names. Firestore is authoritative for
 * access and onboarding; these tabs remain workflow/mirroring conventions.
 */
export const ADMIN_TAB_NAMES = {
  registry: "SheetRegistry",
  runLog: "RunLog",
  feedback: "Feedback",
  roles: "Roles"
} as const;

export type AdminTabName = (typeof ADMIN_TAB_NAMES)[keyof typeof ADMIN_TAB_NAMES];

/** Non-secret device connection configuration for Google APIs. */
export interface AppConfig {
  googleClientId: string;
  googleApiKey: string;
  googleAppId: string;
}

export interface UserSession {
  email: string;
  name: string;
  accessToken?: string;
  /** Short-lived Google OpenID token forwarded to the backend for verification. */
  idToken?: string;
  refreshToken?: string;
  accessTokenExpiresAt?: number;
}

export type TaskFieldKey =
  | "project"
  | "experiment"
  | "timeEstimate"
  | "startDate"
  | "projectedEndDate"
  | "status"
  | "schematic"
  | "result"
  | "dataLink"
  | "comments"
  | "notebookLocation";

export interface TaskFieldDefinition {
  key: TaskFieldKey;
  label: string;
  description: string;
  required: boolean;
  defaultHeader: string;
  /**
   * Normalized header tokens (lowercase, alphanumeric only) the auto-matcher
   * should treat as equivalent for this field. The first entry is the canonical
   * default written when the user asks the app to add the column.
   */
  aliasTokens: string[];
}

export const TASK_FIELDS: ReadonlyArray<TaskFieldDefinition> = [
  {
    key: "project",
    label: "Project",
    description: "Top-level project or program a task belongs to.",
    required: true,
    defaultHeader: "Project",
    aliasTokens: ["project"]
  },
  {
    key: "experiment",
    label: "Experiment",
    description: "Specific experiment, build, or task title.",
    required: true,
    defaultHeader: "Experiment",
    aliasTokens: ["experiment"]
  },
  {
    key: "timeEstimate",
    label: "Time Estimate",
    description: "How long the task is expected to take.",
    required: true,
    defaultHeader: "Time Estimate",
    aliasTokens: ["timeestimate"]
  },
  {
    key: "startDate",
    label: "Start Date",
    description: "Day work on the task begins.",
    required: true,
    defaultHeader: "Start Date",
    aliasTokens: ["startdate"]
  },
  {
    key: "projectedEndDate",
    label: "Projected End Date",
    description: "Target completion date for the task.",
    required: true,
    defaultHeader: "Projected End Date",
    aliasTokens: ["projectedenddate", "enddate"]
  },
  {
    key: "status",
    label: "Status",
    description: "Lifecycle state such as Planned, In Progress, or Complete.",
    required: true,
    defaultHeader: "Status",
    aliasTokens: ["status"]
  },
  {
    key: "schematic",
    label: "Schematic",
    description: "Link or reference to a protocol or analysis pipeline.",
    required: true,
    defaultHeader: "Schematic",
    aliasTokens: ["schematic", "analysispipelineschema"]
  },
  {
    key: "result",
    label: "Result",
    description: "Summary of the task outcome once it is complete.",
    required: true,
    defaultHeader: "Result",
    aliasTokens: ["result"]
  },
  {
    key: "dataLink",
    label: "Link to Data",
    description: "URL pointing to the recorded data or output.",
    required: true,
    defaultHeader: "Link to Data",
    aliasTokens: ["linktodata"]
  },
  {
    key: "comments",
    label: "Comments / Improvements",
    description: "Optional notes, retros, or improvement ideas.",
    required: false,
    defaultHeader: "Comments/ Improvements",
    aliasTokens: ["commentsimprovements"]
  },
  {
    key: "notebookLocation",
    label: "Notebook Location",
    description: "Optional path to a lab notebook or write-up.",
    required: false,
    defaultHeader: "Notebook Location",
    aliasTokens: ["notebooklocation"]
  }
];

export type ColumnMappingMode = "existing" | "add";

export interface ColumnMappingExisting {
  mode: "existing";
  /** Original header text from the user's sheet, preserved verbatim. */
  header: string;
}

export interface ColumnMappingAdded {
  mode: "add";
  /** Header text the app wrote into the sheet. */
  header: string;
}

export type ColumnMapping = ColumnMappingExisting | ColumnMappingAdded;

export type EmployeeSheetColumnMap = Partial<Record<TaskFieldKey, ColumnMapping>>;

export interface EmployeeSheetPrefs {
  taskLogUrl: string;
  activeSheetName: string;
  /**
   * Optional. When present, read/write paths use this map to resolve which
   * sheet column corresponds to each app field. Older prefs without this map
   * fall back to auto-inference at load time.
   */
  columnMap?: EmployeeSheetColumnMap;
  /**
   * Backend-accepted maps are authoritative. Missing entries must remain
   * unmapped instead of falling back to device-local header heuristics.
   */
  strictColumnMap?: boolean;
}

export type ViewerSource =
  | "guest"
  | "backendMembership"
  | "backendInvitation"
  | "backendDenied";

export interface ViewerContext {
  role: UserRole;
  labMember?: string;
  accessibleLabMembers: string[];
  reason: string;
  source: ViewerSource;
}

// Google OAuth client IDs are formatted "<projectNumber>-<random>.apps.googleusercontent.com".
// The Drive Picker's appId is just the project number, so we can recover it from the client ID
// when the env var is omitted instead of forcing the operator to set it twice.
export function deriveGoogleAppIdFromClientId(clientId: string): string {
  const trimmed = clientId.trim();
  if (!trimmed) return "";
  const [prefix] = trimmed.split("-");
  return /^\d+$/.test(prefix ?? "") ? prefix! : "";
}

const envClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";
const envAppId = import.meta.env.VITE_GOOGLE_APP_ID ?? "";

export const defaultConfig: AppConfig = {
  googleClientId: envClientId,
  googleApiKey: import.meta.env.VITE_GOOGLE_API_KEY ?? "",
  googleAppId: envAppId || deriveGoogleAppIdFromClientId(envClientId)
};

export function deriveLabMemberFromEmail(email: string, fallbackName?: string): string {
  if (fallbackName && fallbackName.trim()) return fallbackName.trim();
  const local = (email.split("@")[0] ?? email).trim();
  if (!local) return email;
  const pretty = local
    .split(/[._\-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  return pretty || email;
}
