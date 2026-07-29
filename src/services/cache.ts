import type {
  AppConfig,
  EmployeeSheetPrefs,
  UserSession
} from "../domain/app";
import { defaultConfig } from "../domain/app";
import type { DashboardDataset } from "../domain/experiment";
import { tauriSessionSecretVault } from "../platform/tauri/secrets";

const CONFIG_KEY = "lab-workflow/config/v2";
const SESSION_KEY = "lab-workflow/session/v2";

type StoredSessionMetadata = Pick<UserSession, "email" | "name">;

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

/**
 * Older cached configs may contain fields that have been removed
 * (`managerEmails`, `employeeEmails`, `sheetRegistryName`, etc.). They are
 * ignored on read so legacy local storage does not leak into the new
 * centralized model.
 */
export function readStoredConfig(): AppConfig {
  const stored = (readJson<Record<string, unknown>>(CONFIG_KEY) ?? {}) as Record<string, unknown>;
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
  const delta: Partial<AppConfig> = {};
  for (const key of Object.keys(defaultConfig) as (keyof AppConfig)[]) {
    const next = config[key];
    if (typeof next !== "string" || next.trim() === "") continue;
    if (next === defaultConfig[key]) continue;
    delta[key] = next;
  }
  if (Object.keys(delta).length === 0) {
    window.localStorage.removeItem(CONFIG_KEY);
    return;
  }
  writeJson(CONFIG_KEY, delta);
}

function sessionMetadata(session: UserSession): StoredSessionMetadata {
  return {
    email: session.email,
    name: session.name
  };
}

async function migrateLegacySession(legacySession: UserSession): Promise<boolean> {
  const hasLegacySecrets = Boolean(
    legacySession.accessToken || legacySession.idToken || legacySession.refreshToken
  );
  if (!legacySession.email || !hasLegacySecrets) return false;

  // Remove every bearer token from localStorage before performing async I/O.
  // A vault failure therefore fails closed rather than leaving a reusable
  // credential in WebView storage.
  writeJson(SESSION_KEY, sessionMetadata(legacySession));
  if (legacySession.refreshToken) {
    await tauriSessionSecretVault.store(legacySession.email, legacySession.refreshToken);
  }
  return true;
}

export async function readStoredSessionWithSecrets(): Promise<UserSession | null> {
  const stored = readJson<UserSession>(SESSION_KEY);
  if (!stored?.email) return stored;

  const legacyRefreshToken = stored.refreshToken;
  if (stored.accessToken || stored.idToken || legacyRefreshToken) {
    await migrateLegacySession(stored);
  }

  const refreshToken =
    legacyRefreshToken ?? (await tauriSessionSecretVault.load(stored.email));
  const metadata = sessionMetadata(stored);
  return refreshToken ? { ...metadata, refreshToken } : metadata;
}

/** Moves a v2 localStorage refresh token into the OS vault exactly once. */
export async function migrateLegacySessionSecrets(): Promise<boolean> {
  const stored = readJson<UserSession>(SESSION_KEY);
  return stored ? migrateLegacySession(stored) : false;
}

async function syncSessionSecret(
  previousEmail: string | undefined,
  session: UserSession | null
): Promise<void> {
  if (previousEmail && (!session || emailKey(previousEmail) !== emailKey(session.email))) {
    await tauriSessionSecretVault.delete(previousEmail);
  }
  if (session?.refreshToken) {
    await tauriSessionSecretVault.store(session.email, session.refreshToken);
  }
}

export async function clearStoredSessionSecurely(account?: string): Promise<void> {
  const storedEmail = readJson<UserSession>(SESSION_KEY)?.email;
  writeJson(SESSION_KEY, null);

  const accounts = new Set(
    [storedEmail, account]
      .filter((email): email is string => Boolean(email?.trim()))
      .map(emailKey)
  );
  const results = await Promise.allSettled(
    [...accounts].map((email) => tauriSessionSecretVault.delete(email))
  );
  const failure = results.find(
    (result): result is PromiseRejectedResult => result.status === "rejected"
  );
  if (failure) throw failure.reason;
}

/** Persists session identity only after the OS vault operation succeeds. */
export async function writeStoredSessionSecurely(session: UserSession | null): Promise<void> {
  if (!session) {
    await clearStoredSessionSecurely();
    return;
  }
  const previousEmail = readJson<UserSession>(SESSION_KEY)?.email;
  await syncSessionSecret(previousEmail, session);
  writeJson(SESSION_KEY, sessionMetadata(session));
}

export function getDatasetCacheKey(adminSpreadsheetId: string): string {
  return `lab-workflow/dataset-cache/${adminSpreadsheetId}`;
}

export const DATASET_CACHE_VERSION = 2;

export function readDatasetCache(key: string): DashboardDataset | null {
  const dataset = readJson<DashboardDataset>(key);
  if (!dataset || dataset.cacheVersion !== DATASET_CACHE_VERSION) return null;
  return dataset;
}

export function writeDatasetCache(key: string, dataset: DashboardDataset): void {
  writeJson(key, {
    ...dataset,
    cacheVersion: DATASET_CACHE_VERSION,
    cacheInvalidatedAt: undefined,
    cacheStaleReason: undefined
  });
}

export function invalidateDatasetCaches(
  adminSpreadsheetId: string,
  reason: string
): void {
  if (!adminSpreadsheetId.trim()) return;
  const prefix = getDatasetCacheKey(adminSpreadsheetId);
  const invalidatedAt = new Date().toISOString();
  for (let index = 0; index < window.localStorage.length; index++) {
    const key = window.localStorage.key(index);
    if (!key?.startsWith(prefix)) continue;
    const dataset = readJson<DashboardDataset>(key);
    if (!dataset || dataset.cacheVersion !== DATASET_CACHE_VERSION) {
      window.localStorage.removeItem(key);
      index -= 1;
      continue;
    }
    writeJson(key, {
      ...dataset,
      cacheInvalidatedAt: invalidatedAt,
      cacheStaleReason: reason
    });
  }
}

export function getEmployeePrefsKey(email: string): string {
  return `lab-workflow/employee-prefs/${emailKey(email)}`;
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

export type ManagerScopeMode = "team" | "mine";

export function getManagerScopeModeKey(email: string): string {
  return `lab-workflow/manager-scope/${emailKey(email)}`;
}

export function readManagerScopeMode(email: string): ManagerScopeMode | null {
  if (!email) return null;
  const stored = readJson<string>(getManagerScopeModeKey(email));
  return stored === "team" || stored === "mine" ? stored : null;
}

export function writeManagerScopeMode(email: string, mode: ManagerScopeMode | null): void {
  if (!email) return;
  writeJson(getManagerScopeModeKey(email), mode);
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

// =====================================================================
// Profile picture cache (employee + manager).
//
// Profile pictures live in each employee's task-log workbook `Profile`
// tab. The cache here is purely a performance optimization:
//
// - It lets the employee setup gate render their saved photo before the
//   live read finishes.
// - It lets the manager dashboard avoid blocking on the per-employee
//   profile reads, and gracefully fall back to the last known image
//   when a profile read fails.
//
// The Sheet is the source of truth. Every cache entry stores `updatedAt`
// from the Sheet so the live read can invalidate the cache without
// re-fetching unchanged image data.
// =====================================================================

export interface ManagerProfileCacheEntry {
  labMember: string;
  profilePictureDataUrl: string;
  updatedAt: string;
  cachedAt: string;
}

function getManagerProfileCacheKey(email: string, spreadsheetId: string): string {
  return `lab-workflow/profile-cache/manager/${emailKey(email)}/${spreadsheetId}`;
}

export function readManagerProfileCache(
  email: string,
  spreadsheetId: string
): ManagerProfileCacheEntry | null {
  if (!email || !spreadsheetId) return null;
  const stored = readJson<ManagerProfileCacheEntry>(
    getManagerProfileCacheKey(email, spreadsheetId)
  );
  if (!stored) return null;
  if (typeof stored.profilePictureDataUrl !== "string") return null;
  if (typeof stored.updatedAt !== "string") return null;
  return stored;
}

export function writeManagerProfileCache(
  email: string,
  spreadsheetId: string,
  entry: ManagerProfileCacheEntry | null
): void {
  if (!email || !spreadsheetId) return;
  writeJson(getManagerProfileCacheKey(email, spreadsheetId), entry);
}

export interface EmployeeProfileCacheEntry {
  profilePictureDataUrl: string;
  displayName: string;
  updatedAt: string;
  cachedAt: string;
}

function getEmployeeProfileCacheKey(email: string, spreadsheetId: string): string {
  return `lab-workflow/profile-cache/employee/${emailKey(email)}/${spreadsheetId}`;
}

export function readEmployeeProfileCache(
  email: string,
  spreadsheetId: string
): EmployeeProfileCacheEntry | null {
  if (!email || !spreadsheetId) return null;
  const stored = readJson<EmployeeProfileCacheEntry>(
    getEmployeeProfileCacheKey(email, spreadsheetId)
  );
  if (!stored) return null;
  if (typeof stored.profilePictureDataUrl !== "string") return null;
  if (typeof stored.updatedAt !== "string") return null;
  return stored;
}

export function writeEmployeeProfileCache(
  email: string,
  spreadsheetId: string,
  entry: EmployeeProfileCacheEntry | null
): void {
  if (!email || !spreadsheetId) return;
  writeJson(getEmployeeProfileCacheKey(email, spreadsheetId), entry);
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
