import type {
  RegistryRowIssue,
  RoleDirectoryEntry,
  SheetRegistryEntry
} from "../../../domain/experiment";
import {
  createImmutableId,
  extractIdFromUrl,
  headerIndex,
  safeCell
} from "../helpers";
import type {
  ParsedRegistry,
  RegistryWriteRow,
  RoleWriteRow
} from "./types";

export function backfillMemberIds(
  registry: SheetRegistryEntry[],
  roles: RoleDirectoryEntry[]
): { registry: SheetRegistryEntry[]; roles: RoleDirectoryEntry[] } {
  const idByLegacyName = new Map<string, string>();
  const nextRegistry = registry.map((entry) => {
    const memberId = entry.memberId?.trim() || createImmutableId("member");
    const nameKey = entry.labMember.trim().toLowerCase();
    if (nameKey) idByLegacyName.set(nameKey, memberId);
    return { ...entry, memberId };
  });
  const nextRoles = roles.map((entry) => {
    if (entry.memberId?.trim()) return entry;
    const memberId = idByLegacyName.get((entry.labMember ?? "").trim().toLowerCase());
    return memberId ? { ...entry, memberId } : entry;
  });
  return { registry: nextRegistry, roles: nextRoles };
}

export function parseRegistry(rows: string[][]): ParsedRegistry {
  const headers = rows[0] ?? [];
  const index = headerIndex(headers);
  const entries: SheetRegistryEntry[] = [];
  const problems: ParsedRegistry["problems"] = [];

  rows.slice(1).forEach((row, offset) => {
    const memberId = safeCell(row, index.memberid) || undefined;
    const labMember = safeCell(row, index.labmember);
    const taskLogUrl = safeCell(row, index.tasklogurl);
    const activeSheetName = safeCell(row, index.activesheet);
    const activeRaw = safeCell(row, index.active).toLowerCase();
    const active = ["true", "yes", "y", "1"].includes(activeRaw);
    const revision = Number.parseInt(safeCell(row, index.revision), 10);
    if (!memberId && !labMember && !taskLogUrl && !activeSheetName && !activeRaw) return;

    const issues: RegistryRowIssue[] = [];
    if (!labMember) issues.push("missingLabMember");
    if (!taskLogUrl) {
      issues.push("missingTaskLogUrl");
    } else if (!extractIdFromUrl(taskLogUrl)) {
      issues.push("invalidTaskLogUrl");
    }
    if (!activeSheetName) issues.push("missingActiveSheetName");

    if (issues.length === 0) {
      entries.push({
        ...(memberId ? { memberId } : {}),
        labMember,
        taskLogUrl,
        activeSheetName,
        active,
        revision: Number.isFinite(revision) ? revision : 0
      });
    } else {
      problems.push({
        rowNumber: offset + 2,
        memberId,
        labMember,
        taskLogUrl,
        activeSheetName,
        active,
        issues
      });
    }
  });
  return { entries, problems };
}

export function parseRoles(rows: string[][]): RoleDirectoryEntry[] {
  const index = headerIndex(rows[0] ?? []);
  return rows
    .slice(1)
    .map((row) => {
      const role = safeCell(row, index.role).toLowerCase();
      if (role !== "manager" && role !== "employee" && role !== "pi") return null;
      return {
        ...(safeCell(row, index.memberid)
          ? { memberId: safeCell(row, index.memberid) }
          : {}),
        email: safeCell(row, index.email).toLowerCase(),
        role,
        labMember: safeCell(row, index.labmember) || undefined,
        active:
          !safeCell(row, index.active) ||
          ["true", "yes", "y", "1"].includes(
            safeCell(row, index.active).toLowerCase()
          ),
        revision: Number.parseInt(safeCell(row, index.revision), 10) || 0
      } as RoleDirectoryEntry;
    })
    .filter(
      (entry): entry is RoleDirectoryEntry =>
        !!entry && !!entry.email && entry.active !== false
    );
}

export function registryRowToValues(row: RegistryWriteRow): string[] {
  return [
    row.labMember.trim(),
    row.taskLogUrl.trim(),
    row.activeSheetName.trim(),
    row.active ? "TRUE" : "FALSE",
    row.memberId.trim() || createImmutableId("member"),
    String(row.revision ?? 1)
  ];
}

export function roleRowToValues(row: RoleWriteRow): string[] {
  return [
    row.email.trim().toLowerCase(),
    row.role,
    (row.labMember ?? "").trim(),
    row.memberId.trim(),
    String(row.revision ?? 1),
    row.active === false ? "FALSE" : "TRUE"
  ];
}
