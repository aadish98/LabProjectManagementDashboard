import { useMemo, useState, type FormEvent } from "react";
import { evaluateCompliance } from "../../domain/compliance";
import type { ExperimentDraft, ExperimentRecord } from "../../domain/experiment";
import { ErrorSummary, FormField } from "../../components/ui";
import { formatDateInputValue, parsePossibleDate, startOfToday } from "../../utils/date";
import { TaskDialogShell } from "../tasks/TaskDialogShell";
import { TaskForm } from "../tasks/TaskForm";
import { getCreateTaskValidationIssues } from "../tasks/taskFormFields";

export interface CompletionPayload {
  rowNumber: number;
  taskId?: string;
  expectedRevision?: number;
  result: string;
  dataLink: string;
  schematic: string;
}

export interface OverduePayload {
  rowNumber: number;
  taskId?: string;
  expectedRevision?: number;
  newProjectedEndDate: string;
  newTimeEstimate: string;
  delayComment: string;
}

export type EmployeeTaskDialogState =
  | { kind: "create"; draft: ExperimentDraft }
  | { kind: "edit"; record: ExperimentRecord; draft: ExperimentDraft }
  | { kind: "complete"; record: ExperimentRecord }
  | { kind: "overdue"; record: ExperimentRecord }
  | null;

interface EditTaskDialogProps {
  draft: ExperimentDraft;
  saving: boolean;
  isCreate: boolean;
  onClose: () => void;
  onSubmit: (draft: ExperimentDraft) => Promise<void>;
}

function EditTaskDialog({
  draft,
  saving,
  isCreate,
  onClose,
  onSubmit
}: EditTaskDialogProps) {
  const [local, setLocal] = useState<ExperimentDraft>(draft);
  const [error, setError] = useState("");
  const [errorFieldId, setErrorFieldId] = useState("employee-task-project");
  const compliance = useMemo(
    () =>
      evaluateCompliance({
        ...local,
        id: local.rowNumber ? `${local.labMember}-${local.rowNumber}` : `${local.labMember}-draft`
      }),
    [local]
  );
  const missingFields = useMemo(() => new Set(compliance.missingFields), [compliance.missingFields]);

  const handleField = <K extends keyof ExperimentDraft>(key: K, value: ExperimentDraft[K]) => {
    setLocal((previous) => ({ ...previous, [key]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (isCreate) {
      const validationIssues = getCreateTaskValidationIssues(local);
      if (validationIssues.length > 0) {
        setError(`Please fill in: ${validationIssues.map(({ label }) => label).join(", ")}.`);
        const fieldId = `employee-task-${validationIssues[0].idSuffix}`;
        setErrorFieldId(fieldId);
        queueMicrotask(() => document.getElementById(fieldId)?.focus());
        return;
      }
    }

    try {
      await onSubmit(local);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to save the task.");
    }
  };

  return (
    <TaskDialogShell title={isCreate ? "New task" : "Edit task"} onClose={onClose} busy={saving}>
      <form className="stack-md" onSubmit={handleSubmit} noValidate>
        <ErrorSummary
          errors={error ? [{ fieldId: errorFieldId, message: error }] : []}
          title="Task could not be saved"
        />
        <TaskForm
          draft={local}
          missingFields={missingFields}
          dataLinkPlaceholder="https://www.dropbox.com/..."
          idPrefix="employee-task"
          onChange={handleField}
        />
        <div className="button-row">
          <button className="button button--primary" type="submit" disabled={saving}>
            {saving ? "Saving..." : isCreate ? "Create task" : "Save changes"}
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

interface CompletionDialogProps {
  record: ExperimentRecord;
  saving: boolean;
  onClose: () => void;
  onSubmit: (payload: CompletionPayload) => Promise<void>;
}

function CompletionDialog({ record, saving, onClose, onSubmit }: CompletionDialogProps) {
  const [result, setResult] = useState(record.result);
  const [dataLink, setDataLink] = useState(record.dataLink);
  const [schematic, setSchematic] = useState(record.schematic);
  const [error, setError] = useState("");
  const [errorFieldId, setErrorFieldId] = useState("complete-schematic");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (!result.trim() || !dataLink.trim() || !schematic.trim()) {
      setError("Result, link to data, and schematic are required to mark a task complete.");
      const firstId = !schematic.trim()
        ? "complete-schematic"
        : !dataLink.trim()
          ? "complete-data-link"
          : "complete-result";
      setErrorFieldId(firstId);
      queueMicrotask(() => document.getElementById(firstId)?.focus());
      return;
    }
    if (record.rowNumber == null) {
      setError("This task has no row number. Save it before completing.");
      return;
    }

    try {
      await onSubmit({
        rowNumber: record.rowNumber,
        taskId: record.taskId,
        expectedRevision: record.taskRevision,
        result: result.trim(),
        dataLink: dataLink.trim(),
        schematic: schematic.trim()
      });
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Unable to complete the task."
      );
    }
  };

  return (
    <TaskDialogShell
      title={`Complete: ${record.experiment || "task"}`}
      onClose={onClose}
      busy={saving}
    >
      <form className="stack-md" onSubmit={handleSubmit} noValidate>
        <ErrorSummary
          errors={error ? [{ fieldId: errorFieldId, message: error }] : []}
          title="Task could not be completed"
        />
        <FormField
          id="complete-schematic"
          label="Schematic"
          error={error && !schematic.trim() ? "Schematic is required." : ""}
          className="field"
          required
        >
          <input
            data-dialog-initial-focus
            value={schematic}
            onChange={(event) => setSchematic(event.target.value)}
          />
        </FormField>
        <FormField
          id="complete-data-link"
          label="Link to data (Dropbox link to result)"
          error={error && !dataLink.trim() ? "Link to data is required." : ""}
          className="field"
          required
        >
          <input
            type="url"
            placeholder="https://www.dropbox.com/..."
            value={dataLink}
            onChange={(event) => setDataLink(event.target.value)}
          />
        </FormField>
        <FormField
          id="complete-result"
          label="Result summary"
          error={error && !result.trim() ? "Result summary is required." : ""}
          className="field"
          required
        >
          <textarea rows={4} value={result} onChange={(event) => setResult(event.target.value)} />
        </FormField>
        <div className="button-row">
          <button className="button button--primary" type="submit" disabled={saving}>
            {saving ? "Saving..." : "Mark complete"}
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

interface OverdueDialogProps {
  record: ExperimentRecord;
  saving: boolean;
  onClose: () => void;
  onSubmit: (payload: OverduePayload) => Promise<void>;
}

function OverdueDialog({ record, saving, onClose, onSubmit }: OverdueDialogProps) {
  const [newProjectedEndDate, setNewProjectedEndDate] = useState(
    formatDateInputValue(record.projectedEndDateRaw, "last")
  );
  const [newTimeEstimate, setNewTimeEstimate] = useState(record.timeEstimate);
  const [delayComment, setDelayComment] = useState("");
  const [error, setError] = useState("");
  const [errorFieldId, setErrorFieldId] = useState("overdue-end-date");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (!newProjectedEndDate || !newTimeEstimate.trim() || !delayComment.trim()) {
      setError("A new projected end date, new time estimate, and delay reason are all required.");
      const firstId = !newProjectedEndDate
        ? "overdue-end-date"
        : !newTimeEstimate.trim()
          ? "overdue-time-estimate"
          : "overdue-delay-reason";
      setErrorFieldId(firstId);
      queueMicrotask(() => document.getElementById(firstId)?.focus());
      return;
    }

    const parsedEnd = parsePossibleDate(newProjectedEndDate);
    if (!parsedEnd || parsedEnd.getTime() <= startOfToday().getTime()) {
      setError("The new projected end date must be after today.");
      setErrorFieldId("overdue-end-date");
      queueMicrotask(() => document.getElementById("overdue-end-date")?.focus());
      return;
    }
    if (record.rowNumber == null) {
      setError("This task has no row number. Save it before resolving overdue state.");
      return;
    }

    try {
      await onSubmit({
        rowNumber: record.rowNumber,
        taskId: record.taskId,
        expectedRevision: record.taskRevision,
        newProjectedEndDate,
        newTimeEstimate: newTimeEstimate.trim(),
        delayComment: delayComment.trim()
      });
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to record the overdue resolution."
      );
    }
  };

  return (
    <TaskDialogShell
      title={`Resolve overdue: ${record.experiment || "task"}`}
      onClose={onClose}
      busy={saving}
    >
      <form className="stack-md" onSubmit={handleSubmit} noValidate>
        <p className="muted-row">
          The previous projected end date and time estimate will stay in the cell with a strike-through,
          and the new values plus your delay comment will be appended.
        </p>
        <ErrorSummary
          errors={error ? [{ fieldId: errorFieldId, message: error }] : []}
          title="Overdue update could not be saved"
        />
        <FormField
          id="overdue-end-date"
          label="New projected end date"
          error={
            error && errorFieldId === "overdue-end-date"
              ? "Enter a projected end date after today."
              : ""
          }
          className="field"
          required
        >
          <input
            data-dialog-initial-focus
            type="date"
            value={newProjectedEndDate}
            onChange={(event) => setNewProjectedEndDate(event.target.value)}
          />
        </FormField>
        <FormField
          id="overdue-time-estimate"
          label="New time estimate"
          error={
            error && !newTimeEstimate.trim() ? "New time estimate is required." : ""
          }
          className="field"
          required
        >
          <input
            placeholder="4h"
            value={newTimeEstimate}
            onChange={(event) => setNewTimeEstimate(event.target.value)}
          />
        </FormField>
        <FormField
          id="overdue-delay-reason"
          label="Why is this delayed?"
          error={error && !delayComment.trim() ? "Delay reason is required." : ""}
          className="field"
          required
        >
          <textarea
            rows={3}
            value={delayComment}
            onChange={(event) => setDelayComment(event.target.value)}
          />
        </FormField>
        <div className="button-row">
          <button className="button button--primary" type="submit" disabled={saving}>
            {saving ? "Saving..." : "Update task"}
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

interface EmployeeTaskDialogsProps {
  dialog: EmployeeTaskDialogState;
  saving: boolean;
  onClose: () => void;
  onSaveTask: (draft: ExperimentDraft) => Promise<void>;
  onComplete: (payload: CompletionPayload) => Promise<void>;
  onResolveOverdue: (payload: OverduePayload) => Promise<void>;
}

export function EmployeeTaskDialogs({
  dialog,
  saving,
  onClose,
  onSaveTask,
  onComplete,
  onResolveOverdue
}: EmployeeTaskDialogsProps) {
  if (!dialog) return null;
  if (dialog.kind === "create" || dialog.kind === "edit") {
    return (
      <EditTaskDialog
        draft={dialog.draft}
        saving={saving}
        isCreate={dialog.kind === "create"}
        onClose={onClose}
        onSubmit={onSaveTask}
      />
    );
  }
  if (dialog.kind === "complete") {
    return (
      <CompletionDialog
        record={dialog.record}
        saving={saving}
        onClose={onClose}
        onSubmit={onComplete}
      />
    );
  }
  return (
    <OverdueDialog
      record={dialog.record}
      saving={saving}
      onClose={onClose}
      onSubmit={onResolveOverdue}
    />
  );
}
