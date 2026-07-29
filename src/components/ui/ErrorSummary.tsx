import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type MouseEvent,
  type ReactNode
} from "react";
import { useStableId } from "../../hooks/useStableId";

export interface ErrorSummaryItem {
  fieldId: string;
  message: ReactNode;
  label?: string;
}

export interface ErrorSummaryProps {
  errors: ErrorSummaryItem[];
  title?: ReactNode;
  focusOnMount?: boolean;
  className?: string;
}

export const ErrorSummary = forwardRef<HTMLDivElement, ErrorSummaryProps>(function ErrorSummary(
  {
    errors,
    title = "Please fix the following errors",
    focusOnMount = false,
    className
  },
  forwardedRef
) {
  const summaryRef = useRef<HTMLDivElement>(null);
  const titleId = useStableId(undefined, "error-summary");
  useImperativeHandle(forwardedRef, () => summaryRef.current as HTMLDivElement);

  useEffect(() => {
    if (focusOnMount && errors.length > 0) {
      summaryRef.current?.focus();
    }
  }, [errors.length, focusOnMount]);

  if (errors.length === 0) {
    return null;
  }

  const focusField = (event: MouseEvent<HTMLAnchorElement>, fieldId: string) => {
    const field = document.getElementById(fieldId);
    if (!field) {
      return;
    }

    event.preventDefault();
    field.scrollIntoView({ block: "center", behavior: "auto" });
    field.focus({ preventScroll: true });
  };

  return (
    <div
      ref={summaryRef}
      className={["ui-error-summary", className].filter(Boolean).join(" ")}
      role="alert"
      aria-labelledby={titleId}
      tabIndex={-1}
    >
      <h2 id={titleId} className="ui-error-summary__title">
        {title}
      </h2>
      <ul className="ui-error-summary__list">
        {errors.map((error, index) => (
          <li key={`${error.fieldId}-${index}`} className="ui-error-summary__item">
            <a
              className="ui-error-summary__link"
              href={`#${encodeURIComponent(error.fieldId)}`}
              onClick={(event) => focusField(event, error.fieldId)}
            >
              {error.label ? `${error.label}: ` : null}
              {error.message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
});
