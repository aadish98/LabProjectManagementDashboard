import { normalizeEmail, normalizeLabMember, type RoleCapability } from "../../domain/access";
import type { OnboardingState } from "../../domain/onboarding";

/**
 * Flattened projections of a PersonDraft. These are not persisted anywhere:
 * Firestore is authoritative for membership, and `splitForSave` exists only to
 * produce a stable dirty-check signature for the member editor.
 */
export interface RegistryWriteRow {
  memberId: string;
  labMember: string;
  taskLogUrl: string;
  activeSheetName: string;
  active: boolean;
}

export interface RoleWriteRow {
  memberId: string;
  email: string;
  role: "manager" | "employee" | "pi";
  labMember?: string;
}

export interface TabOption {
  sheetId: number;
  title: string;
}

export type RoleFlags = Record<RoleCapability, boolean>;

export interface PersonDraft {
  id: string;
  name: string;
  email: string;
  roles: RoleFlags;
  taskLogUrl: string;
  taskLogTitle: string;
  activeSheetName: string;
  active: boolean;
  availableTabs: TabOption[];
  loadingTabs: boolean;
  tabError: string;
  labId?: string;
  memberRevision?: number;
  configRevision?: number;
  invitationId?: string;
  invitationRevision?: number;
  onboarding?: OnboardingState;
}

export interface PeopleValidation {
  byPerson: Map<string, string[]>;
  hasBlocking: boolean;
}

let draftCounter = 0;

function nextDraftId(prefix: string): string {
  draftCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${draftCounter.toString(36)}`;
}

export function emptyRoles(): RoleFlags {
  return { employee: false, manager: false, pi: false };
}

export function roleLabel(role: RoleCapability): string {
  if (role === "pi") return "PI";
  if (role === "employee") return "Member";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function hasAnyRole(roles: RoleFlags): boolean {
  return roles.employee || roles.manager || roles.pi;
}

export function hasTaskLogData(person: PersonDraft): boolean {
  return !!(person.taskLogUrl.trim() || person.activeSheetName.trim());
}

export function deriveNameFromEmail(email: string): string {
  const trimmed = email.trim();
  if (!trimmed) return "";
  const atIndex = trimmed.indexOf("@");
  const local = atIndex > 0 ? trimmed.slice(0, atIndex) : trimmed;
  const parts = local.split(/[.\-_]+/).filter(Boolean);
  if (parts.length === 0) return local;
  return parts
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function makePerson(base: Partial<PersonDraft>): PersonDraft {
  const person: PersonDraft = {
    id: nextDraftId("member"),
    name: "",
    email: "",
    roles: emptyRoles(),
    taskLogUrl: "",
    taskLogTitle: "",
    activeSheetName: "",
    active: true,
    availableTabs: [],
    loadingTabs: false,
    tabError: "",
    ...base
  };
  person.roles = { ...emptyRoles(), ...(base.roles ?? {}) };
  return person;
}

export function blankPerson(): PersonDraft {
  return makePerson({});
}

export function validatePeople(people: PersonDraft[]): PeopleValidation {
  const issues = new Map<string, string[]>();
  const add = (id: string, message: string) => {
    const list = issues.get(id) ?? [];
    list.push(message);
    issues.set(id, list);
  };
  const namesSeen = new Map<string, string>();
  const emailRoleSeen = new Map<string, string>();

  for (const person of people) {
    const email = person.email.trim();
    const hasRoles = hasAnyRole(person.roles);
    const hasTaskLog = hasTaskLogData(person);

    if (!hasRoles) add(person.id, "Select at least one Access role.");
    if (hasRoles) {
      if (!email) {
        add(person.id, "Email is required for Access roles.");
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        add(person.id, "That doesn't look like a valid email address.");
      } else {
        for (const role of ["employee", "manager", "pi"] as const) {
          if (!person.roles[role]) continue;
          const key = `${normalizeEmail(email)}:${role}`;
          if (emailRoleSeen.has(key)) {
            add(person.id, `This email already has the ${roleLabel(role)} Access role on another row.`);
          } else {
            emailRoleSeen.set(key, person.id);
          }
        }
      }
    }

    if ((hasRoles || hasTaskLog) && !person.name.trim()) {
      add(person.id, "Name is required for task-log access.");
    }
    if (hasRoles || hasTaskLog) {
      if (!person.taskLogUrl.trim()) add(person.id, "Pick a Task-log workbook.");
      if (!person.activeSheetName.trim()) add(person.id, "Choose the Active task tab.");
    }

    const nameKey = normalizeLabMember(person.name);
    if (nameKey && hasTaskLog) {
      if (namesSeen.has(nameKey)) {
        add(person.id, `Two Members share the name "${person.name.trim()}".`);
      } else {
        namesSeen.set(nameKey, person.id);
      }
    }
  }

  return { byPerson: issues, hasBlocking: issues.size > 0 };
}

export function splitForSave(people: PersonDraft[]): {
  registryRows: RegistryWriteRow[];
  roleRows: RoleWriteRow[];
} {
  const registryRows: RegistryWriteRow[] = [];
  const roleRows: RoleWriteRow[] = [];

  for (const person of people) {
    if (hasTaskLogData(person)) {
      registryRows.push({
        memberId: person.id,
        labMember: person.name.trim(),
        taskLogUrl: person.taskLogUrl.trim(),
        activeSheetName: person.activeSheetName.trim(),
        active: person.active
      });
    }
    const email = person.email.trim();
    if (!email) continue;
    for (const role of ["employee", "manager", "pi"] as const) {
      if (!person.roles[role]) continue;
      roleRows.push({
        memberId: person.id,
        email,
        role,
        labMember: person.name.trim() || undefined
      });
    }
  }

  return { registryRows, roleRows };
}

export function saveSignature(people: PersonDraft[]): string {
  return JSON.stringify(splitForSave(people));
}

export function personSaveSignature(person: PersonDraft | undefined): string {
  return person ? saveSignature([person]) : saveSignature([]);
}
