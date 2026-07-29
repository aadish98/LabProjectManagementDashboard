import type { ReactNode, RefObject } from "react";
import { Dialog } from "../../components/ui";

interface TaskDialogShellProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  initialFocusRef?: RefObject<HTMLElement | null>;
  busy?: boolean;
}

export function TaskDialogShell({
  title,
  subtitle,
  onClose,
  children,
  initialFocusRef,
  busy = false
}: TaskDialogShellProps) {
  return (
    <Dialog
      open
      title={title}
      description={subtitle}
      onClose={() => {
        if (!busy) onClose();
      }}
      initialFocusRef={initialFocusRef}
      closeOnBackdrop={!busy}
      showCloseButton={!busy}
      closeLabel={`Close ${title}`}
      className="modal-card"
    >
      <div className="modal-card__body" aria-busy={busy || undefined}>
        {children}
      </div>
    </Dialog>
  );
}
