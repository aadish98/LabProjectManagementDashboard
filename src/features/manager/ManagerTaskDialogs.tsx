import { useMemo, useState, type FormEvent } from "react";
import { evaluateCompliance } from "../../domain/compliance";
import type {
  ExperimentDraft,
  ExperimentRecord,
  SheetRegistryEntry
} from "../../domain/experiment";
import { ErrorSummary, FormField, StatusBanner } from "../../components/ui";
import { TaskDialogShell } from "../tasks/TaskDialogShell";
import { TaskForm } from "../tasks/TaskForm";
import {
  blankTaskDraft,
  getCreateTaskMissingFields,
  getCreateTaskValidationIssues,
  getInitialAssigneeId,
  resolveAssigneeContext,
  TASK_FORM_PERMISSION_RULES,
  taskDraftFromRecord
} from "../tasks/taskFormFields";

interface AddTaskDialogProps {
  registry: SheetRegistryEntry[];
  initialMemberId?: string;
  saving: boolean;
  onClose: () => void;
  onSubmit: (entry: SheetRegistryEntry, draft: ExperimentDraft) => Promise<void>;
}

export function AddTaskDialog({
  registry,
  initialMemberId,
  saving,
  onClose,
  onSubmit
}: AddTaskDialogProps) {
  const initialAssigneeId = getInitialAssigneeId(registry, initialMemberId);
  const initialContext = resolveAssigneeContext(registry, initialAssigneeId);
  const [selectedMemberId, setSelectedMemberId] = useState(initialAssigneeId);
  const [draft, setDraft] = useState<ExperimentDraft>(() =>
    blankTaskDraft(initialContext?.labMember ?? "", {
      taskLogUrl: initialContext?.taskLogUrl ?? "",
      activeSheetName: initialContext?.activeSheetName ?? ""
    })
  );
  const [error, setError] = useState("");
  const [errorFieldId, setErrorFieldId] = useState("manager-task-assignee");
  const [missingFields, setMissingFields] = useState<ReadonlySet<string>>(new Set());
  const selected = useMemo(
    () => resolveAssigneeContext(registry, selectedMemberId),
    [registry, selectedMemberId]
  );

  const handleAssignee = (nextMemberId: string) => {
    const nextContext = resolveAssigneeContext(registry, nextMemberId);
    setSelectedMemberId(nextMemberId);
    setDraft((previous) => ({
      ...previous,
      labMember: nextContext?.labMember ?? "",
      taskLogUrl: nextContext?.taskLogUrl ?? "",
      activeSheetName: nextContext?.activeSheetName ?? ""
    }));
  };

  const handleField = <K extends keyof ExperimentDraft>(key: K, value: ExperimentDraft[K]) => {
    setDraft((previous) => ({ ...previous, [key]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setMissingFields(new Set());
    if (!selected) {
      setError("Choose a Member to route this task to.");
      setErrorFieldId("manager-task-assignee");
      queueMicrotask(() => document.getElementById("manager-task-assignee")?.focus());
      return;
    }
    const validationIssues = getCreateTaskValidationIssues(draft);
    if (validationIssues.length > 0) {
      setError(`Please fill in: ${validationIssues.map(({ label }) => label).join(", ")}.`);
      setMissingFields(getCreateTaskMissingFields(draft));
      const fieldId = `manager-task-${validationIssues[0].idSuffix}`;
      setErrorFieldId(fieldId);
      queueMicrotask(() => document.getElementById(fieldId)?.focus());
      return;
    }

    const sanitizedDraft: ExperimentDraft = {
      ...draft,
      labMember: selected.labMember,
      taskLogUrl: selected.taskLogUrl,
      activeSheetName: selected.activeSheetName,
      project: draft.project.trim(),
      experiment: draft.experiment.trim(),
      schematic: draft.schematic.trim(),
      timeEstimate: draft.timeEstimate.trim(),
      dataLink: draft.dataLink.trim(),
      comments: draft.comments.trim()
    };

    try {
      await onSubmit(selected, sanitizedDraft);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to add the task.");
    }
  };

  return (
    <TaskDialogShell
      title={selected ? `New task for ${selected.labMember}` : "New task"}
      onClose={onClose}
      busy={saving}
    >
      <form className="stack-md" onSubmit={handleSubmit} noValidate>
        <ErrorSummary
          errors={error ? [{ fieldId: errorFieldId, message: error }] : []}
          title="Task could not be saved"
        />
        <FormField
          id="manager-task-assignee"
          label="Assign to"
          error={errorFieldId === "manager-task-assignee" ? error : ""}
          className="field"
        >
          <select
            value={selectedMemberId}
            onChange={(event) => handleAssignee(event.target.value)}
          >
            {registry.length === 0 ? (
              <option value="">No Members available</option>
            ) : (
              <>
                <option value="">Choose Member</option>
                {registry.filter((entry) => entry.memberId).map((entry) => (
                  <option key={entry.memberId} value={entry.memberId}>
                    {entry.labMember}
                  </option>
                ))}
              </>
            )}
          </select>
        </FormField>
        <TaskForm
          draft={draft}
          missingFields={missingFields}
          idPrefix="manager-task"
          permissions={TASK_FORM_PERMISSION_RULES.managerCreate}
          commentsLabel="Comments (optional)"
          onChange={handleField}
        />
        <div className="button-row">
          <button className="button button--primary" type="submit" disabled={saving}>
            {saving ? "Saving..." : "Add task"}
          </button>
          <button
            className="button button--secondary"
            type="button"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
        </div>
      </form>
    </TaskDialogShell>
  );
}

interface EditTaskDialogProps {
  record: ExperimentRecord;
  saving: boolean;
  onClose: () => void;
  onSubmit: (draft: ExperimentDraft) => Promise<void>;
}

export function EditTaskDialog({
  record,
  saving,
  onClose,
  onSubmit
}: EditTaskDialogProps) {
  const [draft, setDraft] = useState<ExperimentDraft>(() => taskDraftFromRecord(record));
  const [error, setError] = useState("");
  const compliance = useMemo(
    () => evaluateCompliance({ ...draft, id: record.id }),
    [draft, record.id]
  );
  const missingFields = useMemo(() => new Set(compliance.missingFields), [compliance.missingFields]);

  const handleField = <K extends keyof ExperimentDraft>(key: K, value: ExperimentDraft[K]) => {
    setDraft((previous) => ({ ...previous, [key]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    try {
      await onSubmit(draft);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to update the task.");
    }
  };

  return (
    <TaskDialogShell title="Edit task" subtitle={`Member: ${record.labMember}`} onClose={onClose} busy={saving}>
      <form className="stack-md" onSubmit={handleSubmit} noValidate>
        <TaskForm
          draft={draft}
          missingFields={missingFields}
          idPrefix="manager-edit-task"
          permissions={TASK_FORM_PERMISSION_RULES.managerEdit}
          onChange={handleField}
        />
        {error ? (
          <StatusBanner tone="error" onDismiss={() => setError("")}>
            {error}
          </StatusBanner>
        ) : null}
        <div className="button-row">
          <button className="button button--primary" type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save changes"}
          </button>
          <button
            className="button button--secondary"
            type="button"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
        </div>
      </form>
    </TaskDialogShell>
  );
}
