import { normalizeEmail, normalizeLabMember, type RoleCapability } from "../../domain/access";
import type { RegistryRowProblem, SheetRegistryEntry } from "../../domain/experiment";
import type {
  AdminWorkbookOverview,
  RegistryWriteRow,
  RoleWriteRow
} from "../../services/sheets/admin";
import type { OnboardingState } from "../../domain/onboarding";

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

function registryEntryToBase(entry: SheetRegistryEntry): Partial<PersonDraft> {
  return {
    id: entry.memberId?.trim() || nextDraftId("member"),
    name: entry.labMember,
    taskLogUrl: entry.taskLogUrl,
    taskLogTitle: "",
    activeSheetName: entry.activeSheetName,
    active: entry.active
  };
}

function registryProblemToBase(problem: RegistryRowProblem): Partial<PersonDraft> {
  return {
    id: problem.memberId?.trim() || nextDraftId("member"),
    name: problem.labMember,
    taskLogUrl: problem.taskLogUrl,
    taskLogTitle: "",
    activeSheetName: problem.activeSheetName,
    active: problem.active
  };
}

export function buildPeopleFromOverview(overview: AdminWorkbookOverview): PersonDraft[] {
  const people: PersonDraft[] = [];
  const peopleByName = new Map<string, PersonDraft>();
  const peopleByEmail = new Map<string, PersonDraft>();
  const peopleByMemberId = new Map<string, PersonDraft>();

  const remember = (person: PersonDraft) => {
    const nameKey = normalizeLabMember(person.name);
    const emailKey = normalizeEmail(person.email);
    if (person.id) peopleByMemberId.set(person.id, person);
    if (nameKey) peopleByName.set(nameKey, person);
    if (emailKey) peopleByEmail.set(emailKey, person);
  };

  for (const base of [
    ...overview.registry.map(registryEntryToBase),
    ...overview.registryProblems.map(registryProblemToBase)
  ]) {
    const person = makePerson(base);
    people.push(person);
    remember(person);
  }

  for (const role of overview.roles) {
    const labMemberKey = normalizeLabMember(role.labMember ?? "");
    const emailKey = normalizeEmail(role.email);
    let person =
      (role.memberId ? peopleByMemberId.get(role.memberId) : undefined) ??
      (labMemberKey ? peopleByName.get(labMemberKey) : undefined) ??
      (emailKey ? peopleByEmail.get(emailKey) : undefined);

    if (!person) {
      person = makePerson({
        id: role.memberId?.trim() || nextDraftId("member"),
        name: role.labMember?.trim() || deriveNameFromEmail(role.email),
        email: role.email
      });
      people.push(person);
    }

    person.email = person.email.trim() || role.email;
    if (!person.name.trim()) {
      person.name = role.labMember?.trim() || deriveNameFromEmail(role.email);
    }
    person.roles = { ...person.roles, [role.role]: true };
    remember(person);
  }

  return people;
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
