import { useRef, type MouseEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useModalIsolation } from "../../hooks/useModalIsolation";
import { useStableId } from "../../hooks/useStableId";

export interface DialogProps {
  open: boolean;
  title: ReactNode;
  children: ReactNode;
  onClose: () => void;
  description?: ReactNode;
  footer?: ReactNode;
  initialFocusRef?: RefObject<HTMLElement | null>;
  closeOnBackdrop?: boolean;
  showCloseButton?: boolean;
  closeLabel?: string;
  className?: string;
  overlayClassName?: string;
  id?: string;
}

export function Dialog({
  open,
  title,
  children,
  onClose,
  description,
  footer,
  initialFocusRef,
  closeOnBackdrop = true,
  showCloseButton = true,
  closeLabel = "Close",
  className,
  overlayClassName,
  id
}: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const dialogId = useStableId(id, "dialog");
  const titleId = `${dialogId}-title`;
  const descriptionId = description ? `${dialogId}-description` : undefined;

  useFocusTrap({
    active: open,
    containerRef: dialogRef,
    initialFocusRef,
    onEscape: onClose
  });
  useModalIsolation(dialogRef, open);

  if (!open || typeof document === "undefined") {
    return null;
  }

  const handleBackdropMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (closeOnBackdrop && event.target === event.currentTarget) {
      onClose();
    }
  };

  return createPortal(
    <div
      className={["ui-dialog__overlay", overlayClassName].filter(Boolean).join(" ")}
      data-state="open"
      onMouseDown={handleBackdropMouseDown}
    >
      <div
        ref={dialogRef}
        id={dialogId}
        className={["ui-dialog", className].filter(Boolean).join(" ")}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        <header className="ui-dialog__header">
          <h2 id={titleId} className="ui-dialog__title">
            {title}
          </h2>
          {showCloseButton ? (
            <button
              className="ui-dialog__close"
              type="button"
              onClick={onClose}
              aria-label={closeLabel}
            >
              <span aria-hidden="true">×</span>
            </button>
          ) : null}
        </header>
        {description ? (
          <div id={descriptionId} className="ui-dialog__description">
            {description}
          </div>
        ) : null}
        <div className="ui-dialog__body">{children}</div>
        {footer ? <footer className="ui-dialog__footer">{footer}</footer> : null}
      </div>
    </div>,
    document.body
  );
}
