import { TASK_FIELDS, type TaskFieldDefinition, type TaskFieldKey } from "../../domain/app";
import type { SheetHeaderAnalysis } from "../../services/sheets/metadata";
import { ErrorSummary, FormField } from "../../components/ui";
import {
  ADD_OPTION,
  normalizeColumnHeader,
  type ColumnSelections,
  type FieldChoice,
  type SelectionValidation
} from "./columnMapping";

interface ColumnRowProps {
  field: TaskFieldDefinition;
  choice: FieldChoice | undefined;
  headers: string[];
  duplicate: boolean;
  fieldId: string;
  error?: string;
  disabled: boolean;
  onChange: (choice: FieldChoice | undefined) => void;
}

function pillFor(choice: FieldChoice | undefined) {
  if (!choice) return { label: "Needs match", modifier: "column-pill--needs" };
  if (choice.kind === "unmapped") {
    return { label: "Optional · unmapped", modifier: "column-pill--matched" };
  }
  return choice.kind === "existing"
    ? { label: "Matched", modifier: "column-pill--matched" }
    : { label: "Will add", modifier: "column-pill--add" };
}

function ColumnRow({
  field,
  choice,
  headers,
  duplicate,
  fieldId,
  error,
  disabled,
  onChange
}: ColumnRowProps) {
  const pill = pillFor(choice);
  const selectValue =
    choice?.kind === "existing"
      ? `existing:${normalizeColumnHeader(choice.header)}`
      : choice?.kind === "add"
        ? ADD_OPTION
        : choice?.kind === "unmapped"
          ? "__unmapped__"
          : "";
  const placement = choice?.kind === "add" ? choice : null;

  return (
    <div className={`column-row${duplicate ? " column-row--issue" : ""}`}>
      <div className="column-row__head">
        <div className="column-row__label">
          <strong>{field.label}</strong>
          <span className="column-row__hint">{field.description}</span>
        </div>
        <span className={`column-pill ${pill.modifier}`}>{pill.label}</span>
      </div>
      <div className="column-row__controls">
        <FormField
          id={fieldId}
          label={`${field.label} sheet column`}
          error={error}
          required={field.required}
          className="field column-row__field"
        >
          <select
            value={selectValue}
            onChange={(event) => {
              const value = event.target.value;
              if (!value) {
                onChange(undefined);
              } else if (value === "__unmapped__") {
                onChange({ kind: "unmapped" });
              } else if (value === ADD_OPTION) {
                onChange({ kind: "add", afterHeader: null });
              } else {
                const target = value.slice("existing:".length);
                const matched = headers.find(
                  (header) => normalizeColumnHeader(header) === target
                );
                if (matched) onChange({ kind: "existing", header: matched });
              }
            }}
            disabled={disabled}
          >
            <option value="">— Choose a column —</option>
            {!field.required ? <option value="__unmapped__">Leave optional field unmapped</option> : null}
            <optgroup label="Existing columns">
              {headers.length === 0 ? (
                <option value="" disabled>
                  No headers in row 1
                </option>
              ) : (
                headers.map((header, index) => (
                  <option
                    key={`${header}-${index}`}
                    value={`existing:${normalizeColumnHeader(header)}`}
                  >
                    {header || `(blank column ${index + 1})`}
                  </option>
                ))
              )}
            </optgroup>
            <optgroup label="Or">
              <option value={ADD_OPTION}>Add column called “{field.defaultHeader}”</option>
            </optgroup>
          </select>
        </FormField>
        {placement ? (
          <FormField
            id={`${fieldId}-placement`}
            label={`${field.label} placement`}
            className="field column-row__field"
          >
            <select
              value={placement.afterHeader ?? "__end__"}
              onChange={(event) =>
                onChange({
                  kind: "add",
                  afterHeader: event.target.value === "__end__" ? null : event.target.value
                })
              }
              disabled={disabled}
            >
              <option value="__end__">End of sheet</option>
              {headers.map((header, index) => (
                <option key={`after-${header}-${index}`} value={header}>
                  After: {header || `(blank column ${index + 1})`}
                </option>
              ))}
            </select>
          </FormField>
        ) : null}
      </div>
    </div>
  );
}

interface ColumnMappingStepProps {
  analysis: SheetHeaderAnalysis | null;
  activeSheetName: string;
  analyzing: boolean;
  error: string;
  selections: ColumnSelections;
  validation: SelectionValidation;
  matchedCount: number;
  willAddCount: number;
  validating: boolean;
  onSelectionChange: (key: TaskFieldKey, choice: FieldChoice | undefined) => void;
  onRetry: () => void;
  onPickDifferentTab: () => void;
}

export function ColumnMappingStep({
  analysis,
  activeSheetName,
  analyzing,
  error,
  selections,
  validation,
  matchedCount,
  willAddCount,
  validating,
  onSelectionChange,
  onRetry,
  onPickDifferentTab
}: ColumnMappingStepProps) {
  const hasMissingFields = validation.missingFields.length > 0;
  const hasDuplicates = validation.duplicates.size > 0;
  const columnsReady = !!analysis && !analyzing;
  const reviewFieldKeys = new Set(
    TASK_FIELDS.filter((field) => {
      const choice = selections[field.key];
      if (!choice) return field.required;
      if (choice.kind === "unmapped") return false;
      if (choice.kind === "add") return true;
      const normalized = normalizeColumnHeader(choice.header);
      const matchingHeaders =
        analysis?.headers.filter(
          (header) => normalizeColumnHeader(header) === normalized
        ).length ?? 0;
      return (
        matchingHeaders !== 1 ||
        (validation.duplicates.get(normalized)?.length ?? 0) > 1
      );
    }).map((field) => field.key)
  );
  const modifier = columnsReady
    ? hasMissingFields || hasDuplicates
      ? " source-card--needs"
      : " source-card--selected"
    : " source-card--empty";
  const groups = [
    {
      label: "Core fields",
      hint: "",
      className: "column-section",
      fields: TASK_FIELDS.filter(
        (field) => field.required && reviewFieldKeys.has(field.key)
      )
    },
    {
      label: "Notes & references",
      hint: "Optional fields may be left unmapped and added later.",
      className: "column-section column-section--optional",
      fields: TASK_FIELDS.filter(
        (field) => !field.required && reviewFieldKeys.has(field.key)
      )
    }
  ];
  const advancedFields = TASK_FIELDS.filter(
    (field) => !reviewFieldKeys.has(field.key)
  );
  const fieldByKey = new Map(TASK_FIELDS.map((field) => [field.key, field]));
  const summaryErrors = [
    ...validation.missingFields.map((key) => ({
      fieldId: `column-map-${key}`,
      label: fieldByKey.get(key)?.label ?? key,
      message: "Choose an existing column or add the required column."
    })),
    ...Array.from(validation.duplicates.entries()).flatMap(([header, keys]) =>
      keys.map((key) => ({
        fieldId: `column-map-${key}`,
        label: fieldByKey.get(key)?.label ?? key,
        message: `“${header}” is assigned to more than one task field.`
      }))
    )
  ];

  return (
    <article className={`source-card${modifier}`}>
      <div className="source-card__body">
        <p className="source-card__eyebrow">Step 3 — Columns</p>
        <h2 className="source-card__title">Match your sheet's columns</h2>
        <p className="source-card__detail">
          Pick the column in your sheet that holds each task field. If a field doesn't have a
          column yet, we can add one for you in the place you choose.
        </p>
      </div>
      {analyzing ? (
        <p className="muted-row column-list__loading">
          Reading the headers in “{activeSheetName}”…
        </p>
      ) : error ? (
        <div className="column-list__error">
          <p className="error-text">{error}</p>
          <div className="button-row">
            <button className="button button--secondary" type="button" onClick={onRetry}>
              Try again
            </button>
            <button className="button button--ghost" type="button" onClick={onPickDifferentTab}>
              Pick a different tab
            </button>
          </div>
        </div>
      ) : analysis ? (
        <>
          <div className="column-summary">
            <span className="column-summary__metric">
              <strong>{matchedCount}</strong> matched
            </span>
            <span className="column-summary__metric">
              <strong>{willAddCount}</strong> will add
            </span>
            {hasMissingFields ? (
              <span className="column-summary__metric column-summary__metric--alert">
                <strong>{validation.missingFields.length}</strong> still need a column
              </span>
            ) : null}
          </div>
          <ErrorSummary
            title="Resolve the column mapping"
            errors={summaryErrors}
          />
          {reviewFieldKeys.size === 0 ? (
            <p className="muted-row">
              All required fields were inferred unambiguously. Optional fields without a clear
              match will remain unmapped.
            </p>
          ) : null}
          {groups.filter((group) => group.fields.length > 0).map((group) => (
            <div className={group.className} key={group.label}>
              <p className="column-section__label">{group.label}</p>
              {group.hint ? <p className="column-section__hint">{group.hint}</p> : null}
              <div className="column-list">
                {group.fields.map((field) => {
                  const choice = selections[field.key];
                  const duplicateKey =
                    choice?.kind === "existing" ? normalizeColumnHeader(choice.header) : "";
                  return (
                    <ColumnRow
                      key={field.key}
                      field={field}
                      choice={choice}
                      headers={analysis.headers}
                      fieldId={`column-map-${field.key}`}
                      duplicate={
                        !!duplicateKey &&
                        (validation.duplicates.get(duplicateKey)?.length ?? 0) > 1
                      }
                      error={
                        !choice && field.required
                          ? "Choose an existing column or add this required column."
                          : duplicateKey &&
                              (validation.duplicates.get(duplicateKey)?.length ?? 0) > 1
                            ? "This column is assigned to more than one task field."
                            : undefined
                      }
                      disabled={validating}
                      onChange={(next) => onSelectionChange(field.key, next)}
                    />
                  );
                })}
              </div>
            </div>
          ))}
          {advancedFields.length > 0 ? (
            <details className="diagnostics-disclosure">
              <summary>Advanced mapping</summary>
              <p className="column-section__hint">
                Inferred mappings are collapsed by default. Expand this section only to override
                a confident match or map an optional field.
              </p>
              <div className="column-list">
                {advancedFields.map((field) => {
                  const choice = selections[field.key];
                  const duplicateKey =
                    choice?.kind === "existing" ? normalizeColumnHeader(choice.header) : "";
                  const duplicate =
                    !!duplicateKey &&
                    (validation.duplicates.get(duplicateKey)?.length ?? 0) > 1;
                  return (
                    <ColumnRow
                      key={`advanced-${field.key}`}
                      field={field}
                      choice={choice}
                      headers={analysis.headers}
                      fieldId={`column-map-${field.key}`}
                      duplicate={duplicate}
                      error={
                        duplicate
                          ? "This column is assigned to more than one task field."
                          : undefined
                      }
                      disabled={validating}
                      onChange={(next) => onSelectionChange(field.key, next)}
                    />
                  );
                })}
              </div>
            </details>
          ) : null}
        </>
      ) : null}
    </article>
  );
}
