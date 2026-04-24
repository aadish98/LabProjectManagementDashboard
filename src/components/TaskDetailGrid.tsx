import { evaluateCompliance } from "../domain/compliance";
import type { ExperimentRecord } from "../domain/experiment";
import { formatDateLabel } from "../utils/date";

interface TaskDetailGridProps {
  record: ExperimentRecord;
  className?: string;
}

function displayValue(value: string | number | null | undefined): string {
  const normalized = String(value ?? "").trim();
  return normalized || "—";
}

function safeHref(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function DetailItem({ label, value }: { label: string; value: string | number | null | undefined }) {
  const text = displayValue(value);
  const href = typeof value === "string" ? safeHref(value.trim()) : null;
  const isLong = text.length > 64;

  return (
    <div className={`task-detail-grid__item${isLong ? " task-detail-grid__item--wide" : ""}`}>
      <dt>{label}</dt>
      <dd>
        {href ? (
          <a href={href} target="_blank" rel="noreferrer">
            {text}
          </a>
        ) : (
          text
        )}
      </dd>
    </div>
  );
}

export function TaskDetailGrid({ record, className = "" }: TaskDetailGridProps) {
  const compliance = evaluateCompliance(record);

  return (
    <dl className={`task-detail-grid ${className}`.trim()}>
      <DetailItem label="Lab member" value={record.labMember} />
      <DetailItem label="Project" value={record.project} />
      <DetailItem label="Experiment" value={record.experiment} />
      <DetailItem label="Status" value={record.status} />
      <DetailItem label="Task log" value={record.taskLogUrl} />
      <DetailItem label="Sheet tab" value={record.activeSheetName} />
      <DetailItem label="Row" value={record.rowNumber ?? "—"} />
      <DetailItem label="Time estimate" value={record.timeEstimate} />
      <DetailItem label="Start date" value={formatDateLabel(record.startDateRaw)} />
      <DetailItem label="Projected end" value={formatDateLabel(record.projectedEndDateRaw)} />
      <DetailItem label="Schematic" value={record.schematic} />
      <DetailItem label="Result" value={record.result} />
      <DetailItem label="Link to data" value={record.dataLink} />
      <DetailItem label="Notebook location" value={record.notebookLocation} />
      <DetailItem label="Comments / improvements" value={record.comments} />
      <DetailItem label="Compliance" value={compliance.feedback} />
    </dl>
  );
}
