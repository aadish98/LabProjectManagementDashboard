import { useState, type FormEvent } from "react";
import type { EmployeeSheetPrefs, UserSession } from "../domain/app";
import { validateEmployeeSheet } from "../services/googleSheets";

interface EmployeeSetupGateProps {
  session: UserSession;
  initialPrefs?: EmployeeSheetPrefs | null;
  onValidated: (prefs: EmployeeSheetPrefs) => void;
  onReconnect: () => void;
  onSignOut: () => void;
  reconnecting: boolean;
}

export function EmployeeSetupGate({
  session,
  initialPrefs,
  onValidated,
  onReconnect,
  onSignOut,
  reconnecting
}: EmployeeSetupGateProps) {
  const [taskLogUrl, setTaskLogUrl] = useState(initialPrefs?.taskLogUrl ?? "");
  const [activeSheetName, setActiveSheetName] = useState(
    initialPrefs?.activeSheetName ?? ""
  );
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (!session.accessToken) {
      setError("Your Google session is missing an access token. Sign in again to continue.");
      return;
    }

    const prefs: EmployeeSheetPrefs = {
      taskLogUrl: taskLogUrl.trim(),
      activeSheetName: activeSheetName.trim()
    };

    if (!prefs.taskLogUrl || !prefs.activeSheetName) {
      setError("Both the task log URL and the active sheet/tab name are required.");
      return;
    }

    setValidating(true);
    try {
      await validateEmployeeSheet(prefs, session.accessToken);
      onValidated(prefs);
    } catch (validationError) {
      setError(
        validationError instanceof Error
          ? validationError.message
          : "Could not validate the task log."
      );
    } finally {
      setValidating(false);
    }
  };

  return (
    <div className="signin-shell">
      <section className="signin-card setup-card">
        <header className="setup-card__header">
          <h1>Connect your task log</h1>
          <p>
            Signed in as <strong>{session.email}</strong>. Add your Google Sheet and the active
            tab name once - the app remembers it locally on this device.
          </p>
        </header>

        <form className="stack-md" onSubmit={handleSubmit}>
          <label className="field">
            <span>Task log spreadsheet URL</span>
            <input
              type="text"
              placeholder="https://docs.google.com/spreadsheets/d/..."
              value={taskLogUrl}
              onChange={(event) => setTaskLogUrl(event.target.value)}
              autoFocus
            />
          </label>

          <label className="field">
            <span>Active sheet / tab name</span>
            <input
              type="text"
              placeholder="e.g. Sept 2026"
              value={activeSheetName}
              onChange={(event) => setActiveSheetName(event.target.value)}
            />
          </label>

          {error ? <p className="error-text">{error}</p> : null}

          <div className="button-row">
            <button className="button button--primary" type="submit" disabled={validating}>
              {validating ? "Validating..." : "Validate and continue"}
            </button>
            <button
              className="button button--ghost"
              type="button"
              onClick={onReconnect}
              disabled={validating || reconnecting}
            >
              {reconnecting ? "Reconnecting..." : "Reconnect Google"}
            </button>
            <button
              className="button button--secondary"
              type="button"
              onClick={onSignOut}
              disabled={validating}
            >
              Sign out
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
