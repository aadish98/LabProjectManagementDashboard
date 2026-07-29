import type { RoleCapability } from "../../domain/access";
import { ONBOARDING_STATUS_LABELS } from "../../domain/onboarding";
import { ErrorSummary, FormField } from "../../components/ui";
import { RoleConfirmation } from "./RoleConfirmation";
import type { PersonDraft } from "./teamSetupState";
import { WorkbookTabPicker } from "./WorkbookTabPicker";

interface MemberEditorProps {
  person: PersonDraft;
  issues: string[];
  controlsDisabled: boolean;
  saveDisabled: boolean;
  saveText: string;
  removalPending: boolean;
  onUpdate: (patch: Partial<PersonDraft>) => void;
  onRoleChange: (role: RoleCapability, checked: boolean) => void;
  onPickWorkbook: () => void;
  onRefreshTabs: () => void;
  onSave: () => void;
  onProvision: () => void;
  onRemove: () => void;
}

export function MemberEditor({
  person,
  issues,
  controlsDisabled,
  saveDisabled,
  saveText,
  removalPending,
  onUpdate,
  onRoleChange,
  onPickWorkbook,
  onRefreshTabs,
  onSave,
  onProvision,
  onRemove
}: MemberEditorProps) {
  const hasIssues = issues.length > 0;
  const fieldPrefix = `member-${person.id.replace(/[^a-zA-Z0-9_-]+/g, "-")}`;
  const nameError = issues.find((issue) => /name/i.test(issue));
  const emailError = issues.find((issue) => /email/i.test(issue));
  const roleError = issues.find((issue) => /role/i.test(issue));
  const workbookError = issues.find((issue) => /workbook|spreadsheet/i.test(issue));
  const tabError = issues.find((issue) => /tab/i.test(issue));
  const fieldIdForIssue = (issue: string) => {
    if (/email/i.test(issue)) return `${fieldPrefix}-email`;
    if (/role/i.test(issue)) return `${fieldPrefix}-access-role`;
    if (/tab/i.test(issue)) return `${fieldPrefix}-active-task-tab`;
    if (/workbook|spreadsheet/i.test(issue)) return `${fieldPrefix}-task-log-workbook`;
    return `${fieldPrefix}-name`;
  };

  return (
    <article className={`lab-member${hasIssues ? " lab-row--needs" : ""}`}>
      <div className="lab-member__main">
        <ErrorSummary
          className="lab-member__errors"
          title="Fix this member"
          errors={issues.map((issue) => ({
            fieldId: fieldIdForIssue(issue),
            message: issue
          }))}
        />
        {person.onboarding ? (
          <div className={`onboarding-status onboarding-status--${person.onboarding.status}`}>
            <strong>{ONBOARDING_STATUS_LABELS[person.onboarding.status]}</strong>
            <span>Owner: {person.onboarding.owner}</span>
            <span>{person.onboarding.reason}</span>
            <span>Next: {person.onboarding.nextAction}</span>
          </div>
        ) : (
          <div className="onboarding-status onboarding-status--draft">
            <strong>Draft invitation</strong>
            <span>Choose explicit Access roles, a Task-log workbook, and an Active task tab before inviting.</span>
          </div>
        )}
        <FormField
          id={`${fieldPrefix}-name`}
          label="Name"
          error={nameError}
          className="field lab-member__name"
        >
          <input
            type="text"
            value={person.name}
            placeholder="Display name"
            disabled={controlsDisabled}
            onChange={(event) => onUpdate({ name: event.target.value })}
          />
        </FormField>
        <FormField
          id={`${fieldPrefix}-email`}
          label="Email"
          error={emailError}
          className="field lab-member__email"
        >
          <input
            type="email"
            value={person.email}
            placeholder="member@example.com"
            disabled={controlsDisabled}
            onChange={(event) => onUpdate({ email: event.target.value })}
          />
        </FormField>
        <RoleConfirmation
          id={`${fieldPrefix}-access-role`}
          personName={person.name}
          roles={person.roles}
          error={roleError}
          disabled={controlsDisabled}
          onChange={onRoleChange}
        />
        <WorkbookTabPicker
          person={person}
          workbookError={workbookError}
          tabError={tabError}
          disabled={controlsDisabled}
          onPickWorkbook={onPickWorkbook}
          onRefreshTabs={onRefreshTabs}
          onTabChange={(activeSheetName) => onUpdate({ activeSheetName })}
        />
        <FormField
          id={`${fieldPrefix}-status`}
          label="Member status"
          className="field lab-field lab-field--status"
        >
          <select
            value={person.active ? "true" : "false"}
            disabled={controlsDisabled}
            onChange={(event) => onUpdate({ active: event.target.value === "true" })}
          >
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </FormField>
        <div className="lab-member__meta">
          <div className="lab-row__actions">
            <button
              className="button button--secondary lab-row__save"
              type="button"
              onClick={onSave}
              disabled={saveDisabled}
            >
              {saveText}
            </button>
            {person.onboarding?.status === "needsSharing" ? (
              <button
                className="button button--primary"
                type="button"
                onClick={onProvision}
                disabled={controlsDisabled}
              >
                Provision exact files
              </button>
            ) : null}
            <button
              className="button button--ghost lab-row__remove"
              type="button"
              onClick={onRemove}
              disabled={controlsDisabled || removalPending}
            >
              Deactivate Member
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
