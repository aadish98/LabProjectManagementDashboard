export type UserRole = "guest" | "unauthorized" | "employee" | "manager";

export interface AppConfig {
  adminSpreadsheetId: string;
  googleClientId: string;
  managerEmails: string;
  employeeEmails: string;
  sheetRegistryName: string;
  runLogSheetName: string;
  feedbackSheetName: string;
  rolesSheetName: string;
}

export interface UserSession {
  email: string;
  name: string;
  accessToken?: string;
}

export interface EmployeeSheetPrefs {
  taskLogUrl: string;
  activeSheetName: string;
}

export interface ViewerContext {
  role: UserRole;
  labMember?: string;
  accessibleLabMembers: string[];
  reason: string;
}

export const defaultConfig: AppConfig = {
  adminSpreadsheetId: import.meta.env.VITE_ADMIN_SPREADSHEET_ID ?? "",
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "",
  managerEmails: import.meta.env.VITE_MANAGER_EMAILS ?? "",
  employeeEmails: import.meta.env.VITE_EMPLOYEE_EMAILS ?? "",
  sheetRegistryName: "SheetRegistry",
  runLogSheetName: "RunLog",
  feedbackSheetName: "Feedback",
  rolesSheetName: "Roles"
};

function emailSet(value: string): Set<string> {
  return new Set(
    value
      .split(/[\n,;]/)
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isConfiguredManager(email: string, config: AppConfig): boolean {
  if (!email) return false;
  return emailSet(config.managerEmails).has(email.trim().toLowerCase());
}

export function isConfiguredEmployee(email: string, config: AppConfig): boolean {
  if (!email) return false;
  return emailSet(config.employeeEmails).has(email.trim().toLowerCase());
}

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
