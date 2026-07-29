import { useState } from "react";
import type { AppConfig, UserSession } from "../../domain/app";
import { OnboardingApi, OnboardingApiError } from "../../services/onboardingApi";
import { extractIdFromUrl } from "../../services/sheets/helpers";
import { StatusBanner } from "../../components/ui";

interface BootstrapLabProps {
  session: UserSession;
  config: AppConfig;
  onClaimed: () => Promise<void> | void;
  onReconnect: () => void;
  onSignOut: () => void;
}

export function BootstrapLab({
  session,
  config,
  onClaimed,
  onReconnect,
  onSignOut
}: BootstrapLabProps) {
  const [labName, setLabName] = useState(
    session.name?.trim() ? `${session.name.trim()}'s Lab` : "My Lab"
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const adminSpreadsheetId = extractIdFromUrl(config.adminSpreadsheetId);

  const claimLab = async () => {
    if (!session.idToken || !session.accessToken || !adminSpreadsheetId) {
      setError("A fresh Google identity, Drive token, and explicit Admin workbook ID are required.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const api = new OnboardingApi({
        idToken: session.idToken,
        driveAccessToken: session.accessToken
      });
      const { claim } = await api.createBootstrapClaim(
        labName,
        adminSpreadsheetId
      );
      await api.claimBootstrap(claim.id);
      await onClaimed();
    } catch (claimError) {
      setError(messageFor(claimError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <a className="skip-link" href="#bootstrap-main">
        Skip to Team setup
      </a>
      <main id="bootstrap-main" className="signin-shell" tabIndex={-1}>
        <section className="signin-card setup-card setup-card--wide">
          <header className="setup-card__header">
            <p className="eyebrow">First lab</p>
            <h1>Claim this lab securely</h1>
            <p>
              No membership or invitation exists for <strong>{session.email}</strong>. The
              backend will check the exact Admin workbook’s canonical empty Roles sheet before
              creating the lab.
            </p>
          </header>
          <label className="field">
            <span>Lab name</span>
            <input
              value={labName}
              onChange={(event) => setLabName(event.target.value)}
              disabled={busy}
              required
            />
          </label>
          <div className="callout stack-xs">
            <strong>Admin workbook ID</strong>
            <code>{adminSpreadsheetId}</code>
            <p className="muted-row">
              Claiming creates a pending manager first-run checklist. It does not by itself prove
              access to every required Drive file.
            </p>
          </div>
          {error ? (
            <StatusBanner tone="error" onDismiss={() => setError("")}>
              {error}
            </StatusBanner>
          ) : null}
          <div className="button-row">
            <button
              className="button button--primary"
              type="button"
              onClick={() => void claimLab()}
              disabled={busy || !labName.trim()}
            >
              {busy ? "Verifying and claiming…" : "Verify Roles sheet & claim lab"}
            </button>
            <button className="button button--ghost" type="button" onClick={onReconnect}>
              Reconnect Google
            </button>
            <button className="button button--secondary" type="button" onClick={onSignOut}>
              Sign out
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}

function messageFor(error: unknown): string {
  if (error instanceof OnboardingApiError) {
    return `${error.message} ${error.action}`;
  }
  return error instanceof Error ? error.message : "The lab claim failed.";
}
