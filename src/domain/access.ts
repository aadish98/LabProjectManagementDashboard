import type { RoleDirectoryEntry, SheetRegistryEntry } from "./experiment";

export type RoleCapability = "employee" | "manager" | "pi";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeLabMember(labMember: string): string {
  return labMember.trim().toLowerCase();
}

export function roleCapabilitiesForRegistryEntry(
  roles: RoleDirectoryEntry[] | undefined,
  entry: SheetRegistryEntry
): Set<RoleCapability> {
  const capabilities = new Set<RoleCapability>();
  if (!entry.memberId?.trim()) return capabilities;
  for (const role of roles ?? []) {
    if (role.memberId?.trim() === entry.memberId.trim()) {
      capabilities.add(role.role);
    }
  }
  return capabilities;
}

export function visibleRegistryForRole(
  registry: SheetRegistryEntry[],
  roles: RoleDirectoryEntry[] | undefined,
  viewerRole: RoleCapability,
  sessionEmail: string
): SheetRegistryEntry[] {
  if (viewerRole === "pi") return registry;

  if (viewerRole === "manager") {
    return registry.filter((entry) => {
      const capabilities = roleCapabilitiesForRegistryEntry(roles, entry);
      return capabilities.has("employee") && !capabilities.has("pi");
    });
  }

  const targetEmail = normalizeEmail(sessionEmail);
  const entries = (roles ?? []).filter(
    (entry) =>
      normalizeEmail(entry.email) === targetEmail &&
      entry.role === "employee"
  );
  const linkedIds = new Set(
    entries
      .map((entry) => entry.memberId?.trim())
      .filter((memberId): memberId is string => !!memberId)
  );
  return registry.filter(
    (entry) => !!entry.memberId && linkedIds.has(entry.memberId)
  );
}
