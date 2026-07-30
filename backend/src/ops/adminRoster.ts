import { createHash } from "node:crypto";
import type { LabRole } from "../domain/types.js";

export interface RosterWorkbookConfig {
  spreadsheetId: string;
  taskLogUrl: string;
  activeSheetName: string;
}

export interface RosterMember {
  memberId: string;
  email: string;
  displayName: string;
  roles: LabRole[];
  config?: RosterWorkbookConfig;
}

interface MutableRosterMember {
  suppliedMemberId?: string;
  email: string;
  displayName: string;
  roles: Set<LabRole>;
  sourceRows: number[];
}

interface RegistryEntry {
  suppliedMemberId?: string;
  displayName: string;
  config: RosterWorkbookConfig;
  sourceRow: number;
}

export class AdminRosterValidationError extends Error {
  constructor(readonly issues: string[]) {
    super(`Admin workbook validation failed:\n- ${issues.join("\n- ")}`);
    this.name = "AdminRosterValidationError";
  }
}

export function parseAdminRoster(
  rolesRows: string[][],
  registryRows: string[][],
  labId: string
): RosterMember[] {
  const issues: string[] = [];
  const rolesIndex = requiredHeaders(
    "Roles",
    rolesRows[0] ?? [],
    ["email", "role", "labmember"],
    issues
  );
  const registryIndex = requiredHeaders(
    "SheetRegistry",
    registryRows[0] ?? [],
    ["labmember", "tasklogurl", "activesheet"],
    issues
  );
  if (issues.length > 0) throw new AdminRosterValidationError(issues);

  const byEmail = new Map<string, MutableRosterMember>();
  const suppliedIdOwners = new Map<string, string>();

  for (let offset = 1; offset < rolesRows.length; offset += 1) {
    const row = rolesRows[offset] ?? [];
    const rowNumber = offset + 1;
    if (row.every((cell) => String(cell ?? "").trim() === "")) continue;

    const active = parseActive(cell(row, rolesIndex.active), "Roles", rowNumber, issues);
    if (!active) continue;

    const email = cell(row, rolesIndex.email).toLowerCase();
    const roleText = cell(row, rolesIndex.role).toLowerCase();
    const displayName = cell(row, rolesIndex.labmember);
    const suppliedMemberId = cell(row, rolesIndex.memberid) || undefined;

    if (!isEmail(email)) {
      issues.push(`Roles row ${rowNumber}: "${email || "(blank)"}" is not a valid email.`);
      continue;
    }
    if (!isLabRole(roleText)) {
      issues.push(
        `Roles row ${rowNumber}: role must be employee, manager, or pi; received "${roleText || "(blank)"}".`
      );
      continue;
    }
    if (!displayName) {
      issues.push(`Roles row ${rowNumber}: Lab Member is required.`);
      continue;
    }
    if (suppliedMemberId) {
      const owner = suppliedIdOwners.get(suppliedMemberId);
      if (owner && owner !== email) {
        issues.push(
          `Roles row ${rowNumber}: Member ID "${suppliedMemberId}" is also assigned to ${owner}.`
        );
        continue;
      }
      suppliedIdOwners.set(suppliedMemberId, email);
    }

    const existing = byEmail.get(email);
    if (!existing) {
      byEmail.set(email, {
        ...(suppliedMemberId ? { suppliedMemberId } : {}),
        email,
        displayName,
        roles: new Set([roleText]),
        sourceRows: [rowNumber]
      });
      continue;
    }
    if (normalizeName(existing.displayName) !== normalizeName(displayName)) {
      issues.push(
        `Roles rows ${existing.sourceRows.join(", ")} and ${rowNumber}: ${email} has conflicting Lab Member names.`
      );
    }
    if (
      existing.suppliedMemberId &&
      suppliedMemberId &&
      existing.suppliedMemberId !== suppliedMemberId
    ) {
      issues.push(
        `Roles rows ${existing.sourceRows.join(", ")} and ${rowNumber}: ${email} has conflicting Member IDs.`
      );
    }
    if (!existing.suppliedMemberId && suppliedMemberId) {
      existing.suppliedMemberId = suppliedMemberId;
    }
    existing.roles.add(roleText);
    existing.sourceRows.push(rowNumber);
  }

  const registryEntries: RegistryEntry[] = [];
  for (let offset = 1; offset < registryRows.length; offset += 1) {
    const row = registryRows[offset] ?? [];
    const rowNumber = offset + 1;
    if (row.every((value) => String(value ?? "").trim() === "")) continue;

    const active = parseActive(
      cell(row, registryIndex.active),
      "SheetRegistry",
      rowNumber,
      issues
    );
    if (!active) continue;

    const displayName = cell(row, registryIndex.labmember);
    const taskLogUrl = cell(row, registryIndex.tasklogurl);
    const activeSheetName = cell(row, registryIndex.activesheet);
    const suppliedMemberId = cell(row, registryIndex.memberid) || undefined;
    const spreadsheetId = extractSpreadsheetId(taskLogUrl);

    if (!displayName) {
      issues.push(`SheetRegistry row ${rowNumber}: Lab Member is required.`);
    }
    if (!spreadsheetId) {
      issues.push(`SheetRegistry row ${rowNumber}: Task Log URL is missing or invalid.`);
    }
    if (!activeSheetName) {
      issues.push(`SheetRegistry row ${rowNumber}: Active Sheet is required.`);
    }
    if (!displayName || !spreadsheetId || !activeSheetName) continue;

    registryEntries.push({
      ...(suppliedMemberId ? { suppliedMemberId } : {}),
      displayName,
      sourceRow: rowNumber,
      config: { spreadsheetId, taskLogUrl, activeSheetName }
    });
  }

  const registryById = uniqueRegistryIndex(
    registryEntries.filter((entry) => entry.suppliedMemberId),
    (entry) => entry.suppliedMemberId ?? "",
    "Member ID",
    issues
  );
  const registryByName = uniqueRegistryIndex(
    registryEntries,
    (entry) => normalizeName(entry.displayName),
    "Lab Member",
    issues
  );

  const result: RosterMember[] = [];
  for (const member of byEmail.values()) {
    const registry =
      (member.suppliedMemberId
        ? registryById.get(member.suppliedMemberId)
        : undefined) ?? registryByName.get(normalizeName(member.displayName));
    const roles = orderRoles(member.roles);
    if (roles.includes("employee") && !registry) {
      issues.push(
        `Roles row ${member.sourceRows[0]}: ${member.email} is an employee but has no unique active SheetRegistry row.`
      );
    }
    result.push({
      memberId:
        validUuid(member.suppliedMemberId) ??
        deterministicUuid(`${labId}:member:${member.email}`),
      email: member.email,
      displayName: member.displayName.trim(),
      roles,
      ...(registry ? { config: registry.config } : {})
    });
  }

  const resultingIds = new Map<string, string>();
  for (const member of result) {
    const owner = resultingIds.get(member.memberId);
    if (owner && owner !== member.email) {
      issues.push(`Generated Member ID ${member.memberId} collides for ${owner} and ${member.email}.`);
    }
    resultingIds.set(member.memberId, member.email);
  }
  if (result.length === 0) {
    issues.push("Roles contains no active people to import.");
  }
  if (issues.length > 0) throw new AdminRosterValidationError(issues);
  return result.sort((left, right) => left.email.localeCompare(right.email));
}

export function deterministicUuid(seed: string): string {
  const bytes = Buffer.from(createHash("sha256").update(seed).digest().subarray(0, 16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function requiredHeaders(
  tab: string,
  headers: string[],
  required: string[],
  issues: string[]
): Record<string, number | undefined> {
  const index: Record<string, number | undefined> = {};
  headers.forEach((header, position) => {
    index[normalizeHeader(header)] = position;
  });
  for (const header of required) {
    if (index[header] === undefined) {
      issues.push(`${tab}: required column "${header}" is missing.`);
    }
  }
  return index;
}

function uniqueRegistryIndex(
  entries: RegistryEntry[],
  keyFor: (entry: RegistryEntry) => string,
  label: string,
  issues: string[]
): Map<string, RegistryEntry> {
  const result = new Map<string, RegistryEntry>();
  for (const entry of entries) {
    const key = keyFor(entry);
    const existing = result.get(key);
    if (existing) {
      issues.push(
        `SheetRegistry rows ${existing.sourceRow} and ${entry.sourceRow}: duplicate active ${label} "${key}".`
      );
      continue;
    }
    result.set(key, entry);
  }
  return result;
}

function parseActive(
  raw: string,
  tab: string,
  rowNumber: number,
  issues: string[]
): boolean {
  const value = raw.trim().toLowerCase();
  if (!value || ["true", "yes", "y", "1"].includes(value)) return true;
  if (["false", "no", "n", "0"].includes(value)) return false;
  issues.push(`${tab} row ${rowNumber}: Active must be TRUE or FALSE; received "${raw}".`);
  return false;
}

function cell(row: string[], index: number | undefined): string {
  return index === undefined ? "" : String(row[index] ?? "").trim();
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function isLabRole(value: string): value is LabRole {
  return value === "employee" || value === "manager" || value === "pi";
}

function orderRoles(roles: Set<LabRole>): LabRole[] {
  return (["employee", "manager", "pi"] as const).filter((role) => roles.has(role));
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validUuid(value: string | undefined): string | null {
  if (!value) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  )
    ? value.toLowerCase()
    : null;
}

function extractSpreadsheetId(value: string): string {
  const trimmed = value.trim();
  const urlMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  const id = urlMatch?.[1] ?? trimmed;
  return /^[a-zA-Z0-9_-]{10,}$/.test(id) ? id : "";
}
