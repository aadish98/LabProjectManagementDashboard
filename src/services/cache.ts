import type { AppConfig, EmployeeSheetPrefs, UserSession } from "../domain/app";
import { defaultConfig } from "../domain/app";
import type { DashboardDataset } from "../domain/experiment";

const CONFIG_KEY = "lab-workflow/config";
const SESSION_KEY = "lab-workflow/session";

function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson<T>(key: string, value: T | null): void {
  if (value === null) {
    window.localStorage.removeItem(key);
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
}

function emailKey(email: string): string {
  return email.trim().toLowerCase();
}

export function readStoredConfig(): AppConfig {
  const stored = readJson<Partial<AppConfig>>(CONFIG_KEY) ?? {};
  const merged: AppConfig = { ...defaultConfig };
  for (const key of Object.keys(defaultConfig) as (keyof AppConfig)[]) {
    const value = stored[key];
    if (typeof value === "string" && value.trim() !== "") {
      merged[key] = value;
    }
  }
  return merged;
}

export function writeStoredConfig(config: AppConfig): void {
  writeJson(CONFIG_KEY, config);
}

export function readStoredSession(): UserSession | null {
  return readJson<UserSession>(SESSION_KEY);
}

export function writeStoredSession(session: UserSession | null): void {
  writeJson(SESSION_KEY, session);
}

export function getDatasetCacheKey(adminSpreadsheetId: string): string {
  return `lab-workflow/dataset-cache/${adminSpreadsheetId}`;
}

export function readDatasetCache(key: string): DashboardDataset | null {
  return readJson<DashboardDataset>(key);
}

export function writeDatasetCache(key: string, dataset: DashboardDataset): void {
  writeJson(key, dataset);
}

export function getEmployeePrefsKey(email: string): string {
  return `lab-workflow/employee-prefs/${emailKey(email)}`;
}

export function readEmployeePrefs(email: string): EmployeeSheetPrefs | null {
  if (!email) return null;
  const stored = readJson<EmployeeSheetPrefs>(getEmployeePrefsKey(email));
  if (!stored) return null;
  if (typeof stored.taskLogUrl !== "string" || typeof stored.activeSheetName !== "string") {
    return null;
  }
  if (!stored.taskLogUrl.trim() || !stored.activeSheetName.trim()) return null;
  return stored;
}

export function writeEmployeePrefs(email: string, prefs: EmployeeSheetPrefs | null): void {
  if (!email) return;
  writeJson(getEmployeePrefsKey(email), prefs);
}

export function getManagerTabOrderKey(email: string): string {
  return `lab-workflow/manager-tabs/${emailKey(email)}`;
}

export function readManagerTabOrder(email: string): string[] | null {
  if (!email) return null;
  const stored = readJson<string[]>(getManagerTabOrderKey(email));
  if (!Array.isArray(stored)) return null;
  return stored.filter((value): value is string => typeof value === "string" && value.length > 0);
}

export function writeManagerTabOrder(email: string, order: string[] | null): void {
  if (!email) return;
  writeJson(getManagerTabOrderKey(email), order);
}

export interface ManagerSnapshotRecord {
  id: string;
  rowNumber: number | null;
  labMember: string;
  project: string;
  experiment: string;
  status: string;
  startDateRaw: string;
  projectedEndDateRaw: string;
  timeEstimate: string;
  schematic: string;
  result: string;
  dataLink: string;
  comments: string;
  notebookLocation: string;
}

export interface ManagerSnapshot {
  takenAt: string;
  experiments: ManagerSnapshotRecord[];
}

export function getManagerSnapshotKey(email: string, spreadsheetId: string): string {
  return `lab-workflow/manager-snapshot/${emailKey(email)}/${spreadsheetId}`;
}

export function readManagerSnapshot(
  email: string,
  spreadsheetId: string
): ManagerSnapshot | null {
  if (!email || !spreadsheetId) return null;
  return readJson<ManagerSnapshot>(getManagerSnapshotKey(email, spreadsheetId));
}

export function writeManagerSnapshot(
  email: string,
  spreadsheetId: string,
  snapshot: ManagerSnapshot | null
): void {
  if (!email || !spreadsheetId) return;
  writeJson(getManagerSnapshotKey(email, spreadsheetId), snapshot);
}

export interface ManagerLastRun {
  ranAt: string;
  durationMs: number;
}

export function getManagerLastRunKey(email: string): string {
  return `lab-workflow/manager-lastrun/${emailKey(email)}`;
}

export function readManagerLastRun(email: string): ManagerLastRun | null {
  if (!email) return null;
  return readJson<ManagerLastRun>(getManagerLastRunKey(email));
}

export function writeManagerLastRun(
  email: string,
  lastRun: ManagerLastRun | null
): void {
  if (!email) return;
  writeJson(getManagerLastRunKey(email), lastRun);
}
