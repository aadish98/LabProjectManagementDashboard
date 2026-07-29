import { useRef, type ReactNode } from "react";
import { Dialog } from "./Dialog";

export interface ConfirmDialogProps {
  open: boolean;
  title: ReactNode;
  message: ReactNode;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmingLabel?: string;
  tone?: "default" | "danger";
  busy?: boolean;
  confirmDisabled?: boolean;
  initialFocus?: "confirm" | "cancel";
  className?: string;
}

export function ConfirmDialog({
  open,
  title,
  message,
  onConfirm,
  onCancel,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmingLabel = "Working…",
  tone = "default",
  busy = false,
  confirmDisabled = false,
  initialFocus = tone === "danger" ? "cancel" : "confirm",
  className
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const requestCancel = () => {
    if (!busy) {
      onCancel();
    }
  };

  const footer = (
    <div className="ui-confirm-dialog__actions" aria-busy={busy}>
      <button
        ref={cancelRef}
        className="ui-confirm-dialog__cancel"
        type="button"
        onClick={requestCancel}
        disabled={busy}
      >
        {cancelLabel}
      </button>
      <button
        ref={confirmRef}
        className={[
          "ui-confirm-dialog__confirm",
          `ui-confirm-dialog__confirm--${tone}`
        ].join(" ")}
        type="button"
        onClick={() => void onConfirm()}
        disabled={busy || confirmDisabled}
      >
        {busy ? confirmingLabel : confirmLabel}
      </button>
    </div>
  );

  return (
    <Dialog
      open={open}
      title={title}
      description={message}
      onClose={requestCancel}
      closeOnBackdrop={!busy}
      showCloseButton={false}
      initialFocusRef={initialFocus === "cancel" ? cancelRef : confirmRef}
      footer={footer}
      className={["ui-confirm-dialog", className].filter(Boolean).join(" ")}
    >
      {null}
    </Dialog>
  );
}
