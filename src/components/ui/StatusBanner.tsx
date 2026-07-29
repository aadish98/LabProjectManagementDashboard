import type { ReactNode } from "react";

export type StatusBannerTone = "success" | "info" | "error";

export interface StatusBannerProps {
  tone?: StatusBannerTone;
  title?: ReactNode;
  children: ReactNode;
  icon?: ReactNode;
  onDismiss?: () => void;
  dismissLabel?: string;
  className?: string;
}

export function StatusBanner({
  tone = "info",
  title,
  children,
  icon,
  onDismiss,
  dismissLabel = "Dismiss notification",
  className
}: StatusBannerProps) {
  const isError = tone === "error";

  return (
    <section
      className={["ui-status-banner", `ui-status-banner--${tone}`, className]
        .filter(Boolean)
        .join(" ")}
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      aria-atomic="true"
    >
      {icon ? (
        <span className="ui-status-banner__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <div className="ui-status-banner__content">
        {title ? <strong className="ui-status-banner__title">{title}</strong> : null}
        <div className="ui-status-banner__message">{children}</div>
      </div>
      {onDismiss ? (
        <button
          className="ui-status-banner__dismiss"
          type="button"
          onClick={onDismiss}
          aria-label={dismissLabel}
        >
          <span aria-hidden="true">×</span>
        </button>
      ) : null}
    </section>
  );
}
