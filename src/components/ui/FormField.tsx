import {
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode
} from "react";
import { useStableId } from "../../hooks/useStableId";

export interface FormFieldControlProps {
  id: string;
  required?: boolean;
  "aria-invalid"?: boolean | "true" | "false" | "grammar" | "spelling";
  "aria-describedby"?: string;
  "aria-errormessage"?: string;
}

interface ChildControlProps {
  id?: string;
  required?: boolean;
  "aria-invalid"?: boolean | "true" | "false" | "grammar" | "spelling";
  "aria-describedby"?: string;
  "aria-errormessage"?: string;
}

export interface FormFieldProps {
  label: ReactNode;
  children:
    | ReactElement<ChildControlProps>
    | ((controlProps: FormFieldControlProps) => ReactNode);
  id?: string;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
}

function joinIds(...values: Array<string | undefined>) {
  return Array.from(
    new Set(
      values
        .flatMap((value) => value?.split(/\s+/) ?? [])
        .filter(Boolean)
    )
  ).join(" ");
}

export function FormField({
  label,
  children,
  id,
  hint,
  error,
  required,
  className
}: FormFieldProps) {
  const generatedId = useStableId(id, "field");
  const childElement = isValidElement<ChildControlProps>(children) ? children : null;
  const childId = childElement?.props.id;
  const controlId = id ?? childId ?? generatedId;
  const hasHint = hint !== undefined && hint !== null && hint !== false && hint !== "";
  const hasError = error !== undefined && error !== null && error !== false && error !== "";
  const hintId = hasHint ? `${controlId}-hint` : undefined;
  const errorId = hasError ? `${controlId}-error` : undefined;
  const childDescription = childElement?.props["aria-describedby"];
  const describedBy = joinIds(childDescription, hintId, errorId) || undefined;
  const isRequired = required ?? childElement?.props.required ?? false;
  const controlProps: FormFieldControlProps = {
    id: controlId,
    required: isRequired || undefined,
    "aria-invalid": hasError ? true : childElement?.props["aria-invalid"],
    "aria-describedby": describedBy,
    "aria-errormessage": errorId ?? childElement?.props["aria-errormessage"]
  };

  const control =
    typeof children === "function"
      ? children(controlProps)
      : cloneElement(children, controlProps);

  return (
    <div
      className={[
        "ui-form-field",
        hasError && "ui-form-field--invalid",
        isRequired && "ui-form-field--required",
        className
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <label className="ui-form-field__label" htmlFor={controlId}>
        {label}
        {isRequired ? <span className="ui-form-field__required"> (required)</span> : null}
      </label>
      <div className="ui-form-field__control">{control}</div>
      {hasHint ? (
        <div id={hintId} className="ui-form-field__hint">
          {hint}
        </div>
      ) : null}
      {hasError ? (
        <div id={errorId} className="ui-form-field__error" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}
