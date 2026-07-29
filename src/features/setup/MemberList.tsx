import type { RoleCapability } from "../../domain/access";
import { MemberEditor } from "./MemberEditor";
import {
  personSaveSignature,
  type PeopleValidation,
  type PersonDraft
} from "./teamSetupState";

interface MemberListProps {
  people: PersonDraft[];
  savedPeopleById: Map<string, PersonDraft>;
  validation: PeopleValidation;
  controlsDisabled: boolean;
  saving: boolean;
  repairingSetup: boolean;
  loading: boolean;
  savingPersonId: string | null;
  pendingRemovalId: string | null;
  onUpdate: (id: string, patch: Partial<PersonDraft>) => void;
  onRoleChange: (id: string, role: RoleCapability, checked: boolean) => void;
  onPickWorkbook: (id: string) => void;
  onRefreshTabs: (id: string) => void;
  onSave: (person: PersonDraft) => void;
  onProvision: (person: PersonDraft) => void;
  onRemove: (id: string) => void;
}

export function MemberList({
  people,
  savedPeopleById,
  validation,
  controlsDisabled,
  saving,
  repairingSetup,
  loading,
  savingPersonId,
  pendingRemovalId,
  onUpdate,
  onRoleChange,
  onPickWorkbook,
  onRefreshTabs,
  onSave,
  onProvision,
  onRemove
}: MemberListProps) {
  if (people.length === 0) {
    return <p className="muted-row">No members yet. Add a member invitation to configure access.</p>;
  }

  return people.map((person) => {
    const issues = validation.byPerson.get(person.id) ?? [];
    const savedPerson = savedPeopleById.get(person.id);
    const hasUnsavedChanges =
      personSaveSignature(person) !== personSaveSignature(savedPerson);
    const isSavingPerson = savingPersonId === person.id;
    const saveDisabled =
      saving ||
      repairingSetup ||
      loading ||
      !!savingPersonId ||
      !hasUnsavedChanges ||
      issues.length > 0;
    const saveText = isSavingPerson
      ? "Saving..."
      : issues.length > 0
        ? "Fix first"
        : hasUnsavedChanges
          ? "Save"
          : "Saved";

    return (
      <MemberEditor
        key={person.id}
        person={person}
        issues={issues}
        controlsDisabled={controlsDisabled}
        saveDisabled={saveDisabled}
        saveText={saveText}
        removalPending={pendingRemovalId === person.id}
        onUpdate={(patch) => onUpdate(person.id, patch)}
        onRoleChange={(role, checked) => onRoleChange(person.id, role, checked)}
        onPickWorkbook={() => onPickWorkbook(person.id)}
        onRefreshTabs={() => onRefreshTabs(person.id)}
        onSave={() => onSave(person)}
        onProvision={() => onProvision(person)}
        onRemove={() => onRemove(person.id)}
      />
    );
  });
}
