import { useEffect, useState } from "react";
import type { AppConfig, EmployeeSheetPrefs, UserSession } from "../../domain/app";
import type { Invitation, ManagerFileProgress, Membership } from "../../domain/onboarding";
import { ONBOARDING_STATUS_LABELS } from "../../domain/onboarding";
import { openSpreadsheetPicker } from "../../services/googleDrivePicker";
import { OnboardingApi, OnboardingApiError } from "../../services/onboardingApi";
import { StatusBanner } from "../../components/ui";
import { EmployeeConnectFlow } from "./EmployeeSetupGate";

interface ManagerFirstRunProps {
  session: UserSession;
  config: AppConfig;
  membership: Membership;
  invitations: Invitation[];
  onValidated: (prefs: EmployeeSheetPrefs) => void;
  onAccessChanged: () => Promise<void> | void;
  onReconnect: () => void;
  onSignOut: () => void;
}

export function ManagerFirstRun({
  session,
  config,
  membership,
  invitations,
  onValidated,
  onAccessChanged,
  onReconnect,
  onSignOut
}: ManagerFirstRunProps) {
  const status = membership.member.onboarding.status;
  const [progress, setProgress] = useState<ManagerFileProgress | null>(null);
  const [memberRevision, setMemberRevision] = useState(membership.member.revision);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setMemberRevision(membership.member.revision);
  }, [membership.member.revision]);

  useEffect(() => {
    if (status !== "needsPicker" || !session.idToken) {
      setProgress(null);
      return;
    }
    let cancelled = false;
    setBusy(true);
    new OnboardingApi({ idToken: session.idToken })
      .getManagerFileProgress(membership.lab.id, membership.member.id)
      .then((result) => {
        if (!cancelled) {
          setProgress(result.progress);
          setMemberRevision(result.member.revision);
        }
      })
      .catch((loadError) => {
        if (!cancelled) setError(messageFor(loadError));
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [membership.lab.id, membership.member.id, session.idToken, status]);

  if (status === "needsColumnReview" && membership.config) {
    return (
      <div>
        <section className="callout callout--warning stack-xs" aria-label="Manager first-run status">
          <strong>Manager first-run · Column review remaining</strong>
          <p>
            Exact Admin and active Task-log file selections are complete. Confirm the personal
            Task-log column map before entering the manager workspace.
          </p>
        </section>
        <EmployeeConnectFlow
          session={session}
          config={config}
          membership={membership}
          invitations={invitations}
          onValidated={onValidated}
          onAccessChanged={onAccessChanged}
          onReconnect={onReconnect}
          onSignOut={onSignOut}
        />
      </div>
    );
  }

  const selectExactFiles = async () => {
    if (!session.accessToken || !session.idToken || !progress) {
      setError("Reconnect Google before selecting the remaining exact files.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const remaining = new Set(progress.remainingFileIds);
      const firstRemaining = progress.requiredFiles.find((file) => remaining.has(file.fileId));
      const picked = await openSpreadsheetPicker({
        accessToken: session.accessToken,
        apiKey: config.googleApiKey,
        appId: config.googleAppId,
        multiselect: true,
        query: firstRemaining?.fileId,
        title: "Select required first-run workbooks"
      });
      if (picked.length === 0) return;
      const result = await new OnboardingApi({ idToken: session.idToken })
        .recordManagerFileProof(
          membership.lab.id,
          membership.member.id,
          memberRevision,
          picked.map((file) => file.id)
        );
      setProgress(result.progress);
      setMemberRevision(result.member.revision);
      await onAccessChanged();
    } catch (proofError) {
      setError(messageFor(proofError));
      await onAccessChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <a className="skip-link" href="#manager-first-run-main">
        Skip to manager first-run
      </a>
      <main id="manager-first-run-main" className="signin-shell" tabIndex={-1}>
        <section className="signin-card setup-card setup-card--wide">
          <header className="setup-card__header">
            <p className="eyebrow">Manager first-run</p>
            <h1>Complete lab access setup</h1>
            <p>
              Workspace access stays locked until the authoritative lifecycle is ready.
            </p>
          </header>
          <div className="callout stack-xs">
            <strong>{ONBOARDING_STATUS_LABELS[status]}</strong>
            <p>{membership.member.onboarding.reason}</p>
            <p>
              Owner: <strong>{membership.member.onboarding.owner}</strong> · Next:{" "}
              {membership.member.onboarding.nextAction}
            </p>
          </div>
          {status === "needsPicker" && progress ? (
            <div className="callout stack-xs" aria-live="polite">
              <strong>Exact-file Picker checklist</strong>
              <p>
                {progress.verifiedFileIds.length} verified · {progress.remainingFileIds.length}{" "}
                remaining
              </p>
              <ul className="compact-list" aria-label="Required workbook progress">
                {progress.requiredFiles.map((file) => {
                  const verified = progress.verifiedFileIds.includes(file.fileId);
                  return (
                    <li key={file.fileId}>
                      <input
                        type="checkbox"
                        checked={verified}
                        readOnly
                        aria-label={`${file.label} ${verified ? "verified" : "remaining"}`}
                      />{" "}
                      <strong>{file.label}</strong> · {verified ? "Selected" : "Remaining"} ·{" "}
                      <code>{file.fileId}</code>
                    </li>
                  );
                })}
              </ul>
              <button
                className="button button--primary"
                type="button"
                onClick={() => void selectExactFiles()}
                disabled={busy || progress.remainingFileIds.length === 0}
              >
                {busy ? "Recording selections…" : "Select remaining exact files"}
              </button>
              <p className="muted-row">
                This records exact Drive Picker selections. It is not a claim that the app
                independently validated file contents or permissions.
              </p>
            </div>
          ) : null}
          {error ? (
            <StatusBanner tone="error" onDismiss={() => setError("")}>
              {error}
            </StatusBanner>
          ) : null}
          <nav className="button-row" aria-label="Manager first-run account actions">
            <button className="button button--ghost" type="button" onClick={onReconnect}>
              Reconnect Google
            </button>
            <button className="button button--secondary" type="button" onClick={onSignOut}>
              Sign out
            </button>
          </nav>
        </section>
      </main>
    </div>
  );
}

function messageFor(error: unknown): string {
  if (error instanceof OnboardingApiError) {
    return `${error.message} ${error.action}`;
  }
  return error instanceof Error ? error.message : "The exact-file proof failed.";
}
