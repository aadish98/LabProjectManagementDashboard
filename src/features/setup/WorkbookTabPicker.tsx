import type { PersonDraft } from "./teamSetupState";
import { FormField } from "../../components/ui";

interface WorkbookTabPickerProps {
  person: PersonDraft;
  workbookError?: string;
  tabError?: string;
  disabled: boolean;
  onPickWorkbook: () => void;
  onRefreshTabs: () => void;
  onTabChange: (activeSheetName: string) => void;
}

export function WorkbookTabPicker({
  person,
  workbookError,
  tabError,
  disabled,
  onPickWorkbook,
  onRefreshTabs,
  onTabChange
}: WorkbookTabPickerProps) {
  const workbookFieldId = `member-${person.id.replace(/[^a-zA-Z0-9_-]+/g, "-")}-task-log-workbook`;
  const fieldId = `member-${person.id.replace(/[^a-zA-Z0-9_-]+/g, "-")}-active-task-tab`;
  return (
    <>
      <FormField
        id={workbookFieldId}
        label="Task-log workbook"
        className="field lab-member__tasklog"
        error={workbookError || person.tabError}
        required
      >
        {({ required: _required, ...controlProps }) => (
          <div
            className={`workbook-chip workbook-chip--compact${
              person.taskLogUrl ? "" : " workbook-chip--empty"
            }`}
          >
            <div className="workbook-chip__text">
              <strong>
                {person.taskLogTitle ||
                  (person.taskLogUrl ? "Task-log workbook selected" : "No Task-log workbook")}
              </strong>
            </div>
            <button
              {...controlProps}
              aria-label={person.taskLogUrl ? "Change Task-log workbook" : "Choose"}
              className="button button--secondary workbook-chip__action"
              type="button"
              onClick={onPickWorkbook}
              disabled={disabled}
            >
              {person.taskLogUrl ? "Change" : "Choose"}
            </button>
          </div>
        )}
      </FormField>

      <FormField
        id={fieldId}
        label="Active task tab"
        className="field lab-field lab-field--tab"
        error={tabError}
        required
      >
        <select
          value={person.activeSheetName}
          onChange={(event) => onTabChange(event.target.value)}
          disabled={disabled || !person.taskLogUrl || person.loadingTabs}
        >
          <option value="">
            {person.loadingTabs
              ? "Loading..."
              : person.availableTabs.length > 0
                ? "Choose tab"
                : person.taskLogUrl
                  ? "Load tabs"
                  : "Pick spreadsheet first"}
          </option>
          {person.availableTabs.map((tab) => (
            <option key={tab.sheetId} value={tab.title}>
              {tab.title}
            </option>
          ))}
          {person.activeSheetName &&
          !person.availableTabs.some(
            (tab) => tab.title.toLowerCase() === person.activeSheetName.toLowerCase()
          ) ? (
            <option value={person.activeSheetName}>{person.activeSheetName} (saved)</option>
          ) : null}
        </select>
      </FormField>
      {person.taskLogUrl && person.availableTabs.length === 0 && !person.loadingTabs ? (
        <button
          className="button button--ghost lab-field__inline-action"
          type="button"
          onClick={onRefreshTabs}
          disabled={disabled}
        >
          Refresh tabs
        </button>
      ) : null}
    </>
  );
}
