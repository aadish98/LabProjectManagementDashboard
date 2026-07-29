import type { ExperimentDraft } from "../../domain/experiment";
import { FormField } from "../../components/ui";
import {
  CREATE_REQUIRED_FIELDS,
  TASK_FORM_PERMISSION_RULES,
  type TaskFormPermissionRules
} from "./taskFormFields";

const requiredKeys = new Set(CREATE_REQUIRED_FIELDS.map(({ key }) => key));

interface TaskFormProps {
  draft: ExperimentDraft;
  missingFields?: ReadonlySet<string>;
  permissions?: TaskFormPermissionRules;
  commentsLabel?: string;
  dataLinkPlaceholder?: string;
  idPrefix?: string;
  onChange: <K extends keyof ExperimentDraft>(
    key: K,
    value: ExperimentDraft[K]
  ) => void;
}

export function TaskForm({
  draft,
  missingFields = new Set(),
  permissions = TASK_FORM_PERMISSION_RULES.member,
  commentsLabel = "Comments / improvements (optional)",
  dataLinkPlaceholder,
  idPrefix = "task",
  onChange
}: TaskFormProps) {
  const issueFor = (field: string, label = field) =>
    missingFields.has(field) ? `${label} is required for this task to be compliant.` : "";

  return (
    <div className="form-grid">
      <FormField
        id={`${idPrefix}-project`}
        label="Project"
        error={issueFor("Project")}
        className="field field--wide"
        required={requiredKeys.has("project")}
      >
        <input
          data-dialog-initial-focus
          value={draft.project}
          onChange={(event) => onChange("project", event.target.value)}
        />
      </FormField>
      <FormField
        id={`${idPrefix}-experiment`}
        label="Task"
        error={issueFor("Experiment", "Task")}
        className="field field--wide"
        required={requiredKeys.has("experiment")}
      >
        <input
          value={draft.experiment}
          onChange={(event) => onChange("experiment", event.target.value)}
        />
      </FormField>
      <FormField
        id={`${idPrefix}-status`}
        label="Status"
        error={issueFor("Status")}
        className="field"
      >
        <select value={draft.status} onChange={(event) => onChange("status", event.target.value)}>
          {permissions.statusOptions.map((status) => (
            <option key={status}>{status}</option>
          ))}
        </select>
      </FormField>
      <FormField
        id={`${idPrefix}-time-estimate`}
        label="Time estimate"
        error={issueFor("Time Estimate", "Time estimate")}
        className="field"
        required={requiredKeys.has("timeEstimate")}
      >
        <input
          placeholder="4h"
          value={draft.timeEstimate}
          onChange={(event) => onChange("timeEstimate", event.target.value)}
        />
      </FormField>
      <FormField
        id={`${idPrefix}-start-date`}
        label="Start date"
        error={issueFor("Start Date", "Start date")}
        className="field"
        required={requiredKeys.has("startDateRaw")}
      >
        <input
          type="date"
          value={draft.startDateRaw}
          onChange={(event) => onChange("startDateRaw", event.target.value)}
        />
      </FormField>
      <FormField
        id={`${idPrefix}-projected-end-date`}
        label="Projected end date"
        error={issueFor("Projected End Date", "Projected end date")}
        className="field"
        required={requiredKeys.has("projectedEndDateRaw")}
      >
        <input
          type="date"
          value={draft.projectedEndDateRaw}
          onChange={(event) => onChange("projectedEndDateRaw", event.target.value)}
        />
      </FormField>
      <FormField
        id={`${idPrefix}-schematic`}
        label="Schematic"
        error={issueFor("Schematic")}
        className="field field--wide"
        required={requiredKeys.has("schematic")}
      >
        <input
          value={draft.schematic}
          onChange={(event) => onChange("schematic", event.target.value)}
        />
      </FormField>
      <FormField
        id={`${idPrefix}-data-link`}
        label="Link to data (Dropbox link)"
        error={issueFor("Link to Data", "Link to data")}
        className="field field--wide"
        required={requiredKeys.has("dataLink")}
      >
        <input
          type="url"
          placeholder={dataLinkPlaceholder}
          value={draft.dataLink}
          onChange={(event) => onChange("dataLink", event.target.value)}
        />
      </FormField>
      {permissions.showCompletionFields ? (
        <>
          <FormField
            id={`${idPrefix}-notebook-location`}
            label="Notebook location (optional)"
            className="field field--wide"
          >
            <input
              value={draft.notebookLocation}
              onChange={(event) => onChange("notebookLocation", event.target.value)}
            />
          </FormField>
          <FormField
            id={`${idPrefix}-result`}
            label="Result summary (for completed tasks)"
            error={issueFor("Result", "Result summary")}
            className="field field--wide"
          >
            <textarea
              rows={3}
              value={draft.result}
              onChange={(event) => onChange("result", event.target.value)}
            />
          </FormField>
        </>
      ) : null}
      <FormField
        id={`${idPrefix}-comments`}
        label={commentsLabel}
        className="field field--wide"
      >
        <textarea
          rows={3}
          value={draft.comments}
          onChange={(event) => onChange("comments", event.target.value)}
        />
      </FormField>
    </div>
  );
}
