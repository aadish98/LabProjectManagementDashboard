import { useState } from "react";

interface UnauthorizedScreenProps {
  email: string;
  reason?: string;
  reconnecting: boolean;
  onReconnect: () => void;
  onSignOut: () => void;
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Copy command was unavailable.");
}

export function UnauthorizedScreen({
  email,
  reason,
  reconnecting,
  onReconnect,
  onSignOut
}: UnauthorizedScreenProps) {
  const [copyStatus, setCopyStatus] = useState("");
  const diagnosticReason = reason || "No active authoritative membership was found.";
  const diagnostics = `Signed-in account: ${email}\nReason: ${diagnosticReason}`;
  const requestHref = `mailto:?subject=${encodeURIComponent(
    "Lab Workflow access request"
  )}&body=${encodeURIComponent(
    `Please grant ${email} the appropriate Access role in Lab Workflow.`
  )}`;
  return (
    <div className="signin-shell">
      <section className="signin-card">
        <h1>Access not authorized</h1>
        <p>
          The Google account <strong>{email}</strong> has not been granted app access yet. Ask a
          manager or PI to open <strong>Team setup</strong> and add this email with the right Access
          role.
        </p>
        <p className="muted-row">
          Request access from a manager or PI, or switch to an account that already has an Access
          role.
        </p>
        <nav className="button-row" aria-label="Access recovery actions">
          <a className="button button--primary" href={requestHref}>
            Request access
          </a>
          <button
            className="button button--ghost"
            type="button"
            onClick={onReconnect}
            disabled={reconnecting}
          >
            {reconnecting ? "Switching account…" : "Switch Google account"}
          </button>
          <button className="button button--secondary" type="button" onClick={onSignOut}>
            Sign out
          </button>
        </nav>
        <details className="diagnostics-disclosure">
          <summary>Access diagnostics</summary>
          <dl className="task-detail-grid">
            <div className="task-detail-grid__item task-detail-grid__item--wide">
              <dt>Signed-in account</dt>
              <dd>{email}</dd>
            </div>
            <div className="task-detail-grid__item task-detail-grid__item--wide">
              <dt>Reason</dt>
              <dd>{diagnosticReason}</dd>
            </div>
          </dl>
          <div className="button-row">
            <button
              className="button button--ghost"
              type="button"
              onClick={async () => {
                try {
                  await copyText(diagnostics);
                  setCopyStatus("Access diagnostics copied.");
                } catch {
                  setCopyStatus("Could not copy diagnostics. Select the text above and copy it.");
                }
              }}
            >
              Copy diagnostics
            </button>
          </div>
          <p className="sr-only" role="status" aria-live="polite">
            {copyStatus}
          </p>
        </details>
      </section>
    </div>
  );
}
