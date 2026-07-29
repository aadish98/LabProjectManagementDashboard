import type { ReactNode } from "react";
import { StatusBanner } from "../../components/ui";
import { ONBOARDING_STATUS_LABELS, type Membership } from "../../domain/onboarding";
import { initialsForName } from "../../domain/people";
import { ColumnMappingStep } from "./ColumnMappingStep";
import { OnboardingSteps } from "./OnboardingSteps";
import { ProfileStep } from "./ProfileStep";
import type { EmployeeConnectController } from "./useEmployeeConnectController";
import { WorkbookTabPicker } from "./WorkbookTabPicker";

export function OnboardingShell({
  controller,
  onReconnect,
  onSignOut,
  children
}: {
  controller: EmployeeConnectController;
  onReconnect: () => void;
  onSignOut: () => void;
  children: ReactNode;
}) {
  return (
    <div>
      <a className="skip-link" href="#onboarding-main">
        Skip to onboarding
      </a>
      <main id="onboarding-main" className="signin-shell" tabIndex={-1}>
        <section className="signin-card setup-card setup-card--wide">
          <header className="setup-card__header">
            <h1>Task-log onboarding</h1>
            <p>
              Signed in as <strong>{controller.session.email}</strong>. Backend membership is the
              authority; local preferences are only a cache.
            </p>
          </header>
          {children}
          <nav className="button-row" aria-label="Onboarding account actions">
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

export function InvitationPane({ controller }: { controller: EmployeeConnectController }) {
  return (
    <>
      <div className="callout stack-xs">
        <strong>Invitation found for {controller.session.email}</strong>
        <p>
          Accept this backend invitation to load the exact Task-log workbook, Active task tab,
          Access roles, and onboarding status on this device.
        </p>
        <button
          className="button button--primary"
          type="button"
          onClick={() => void controller.actions.acceptInvitation()}
          disabled={controller.busy}
        >
          {controller.busy ? "Accepting…" : "Accept invitation"}
        </button>
      </div>
      {controller.error ? (
        <StatusBanner tone="error" onDismiss={controller.actions.clearError}>
          {controller.error}
        </StatusBanner>
      ) : null}
    </>
  );
}

export function OnboardingStatusCard({ membership }: { membership: Membership }) {
  const state = membership.member.onboarding;
  return (
    <div className={`callout onboarding-status onboarding-status--${state.status}`}>
      <strong>{ONBOARDING_STATUS_LABELS[state.status]}</strong>
      <p>{state.reason}</p>
      <p>
        Owner: <strong>{state.owner}</strong> · Next: {state.nextAction}
      </p>
      {state.status !== "ready" ? (
        <details className="diagnostics-disclosure">
          <summary>Recovery and diagnostics</summary>
          <dl className="task-detail-grid">
            <div className="task-detail-grid__item task-detail-grid__item--wide">
              <dt>Lab</dt>
              <dd>{membership.lab.name}</dd>
            </div>
            <div className="task-detail-grid__item task-detail-grid__item--wide">
              <dt>Member ID</dt>
              <dd>{membership.member.id}</dd>
            </div>
            <div className="task-detail-grid__item task-detail-grid__item--wide">
              <dt>Expected workbook</dt>
              <dd>{membership.config?.spreadsheetId || "Not configured yet"}</dd>
            </div>
            <div className="task-detail-grid__item task-detail-grid__item--wide">
              <dt>Recovery</dt>
              <dd>{state.nextAction}</dd>
            </div>
          </dl>
        </details>
      ) : null}
    </div>
  );
}

export function EmployeeConnectPane({
  controller,
  onCancel
}: {
  controller: EmployeeConnectController;
  onCancel?: () => void;
}) {
  const { actions, profile } = controller;
  return (
    <>
      <OnboardingSteps
        hasSelectedSpreadsheet={controller.hasSelectedSpreadsheet}
        hasSelectedSheet={controller.hasSelectedSheet}
        columnsReady={!controller.showColumnReview || (!!controller.analysis && !controller.analyzing)}
        columnsValid={!controller.hasMissingRequired && !controller.hasDuplicates}
        profileDone
      />
      <form className="stack-md" onSubmit={actions.submit} noValidate>
        <WorkbookTabPicker
          taskLogUrl={controller.taskLogUrl}
          spreadsheetTitle={controller.spreadsheetTitle}
          activeSheetName={controller.activeSheetName}
          sheetOptions={controller.sheetOptions}
          picking={controller.busy}
          loadingSheets={false}
          validating={controller.busy}
          onPickSpreadsheet={() => void actions.pickSpreadsheet()}
          onTabChange={actions.setActiveSheetName}
        />
        {controller.showColumnReview ? (
          <ColumnMappingStep
            analysis={controller.analysis}
            activeSheetName={controller.activeSheetName}
            analyzing={controller.analyzing}
            error=""
            selections={controller.selections}
            validation={controller.validation}
            matchedCount={controller.matchedCount}
            willAddCount={controller.willAddCount}
            validating={controller.busy}
            onSelectionChange={actions.updateSelection}
            onRetry={actions.retryAnalysis}
            onPickDifferentTab={() => actions.setActiveSheetName("")}
          />
        ) : null}
        <FlowStatus controller={controller} />
        <div className="button-row">
          {controller.onboarding?.status === "ready" ? (
            <button className="button button--primary" type="submit" disabled={controller.busy}>
              Update authoritative configuration
            </button>
          ) : controller.showColumnReview ? (
            <button
              className="button button--primary"
              type="submit"
              disabled={controller.busy || controller.analyzing}
            >
              {controller.busy ? "Finishing…" : "Confirm required columns & finish"}
            </button>
          ) : null}
          {onCancel ? (
            <button className="button button--ghost" type="button" onClick={onCancel}>
              Cancel
            </button>
          ) : null}
        </div>
      </form>
      <ProfileStep
        choice={profile.choice}
        initials={initialsForName(controller.session.name || controller.session.email)}
        processing={profile.busy}
        validating={false}
        error={profile.error}
        onFile={(file) => void profile.saveFile(file)}
        onUseInitials={() => void profile.useInitials()}
        onClearError={profile.clearError}
      />
      <p className="muted-row">
        Profile photo updates are optional, independently retryable, and never block task-log
        onboarding.
      </p>
    </>
  );
}

export function FlowStatus({
  controller,
  showError = true
}: {
  controller: EmployeeConnectController;
  showError?: boolean;
}) {
  return (
    <>
      {showError && controller.error ? (
        <StatusBanner tone="error" onDismiss={controller.actions.clearError}>
          {controller.error}
        </StatusBanner>
      ) : null}
      {controller.notice ? (
        <StatusBanner tone="success" onDismiss={controller.actions.clearNotice}>
          {controller.notice}
        </StatusBanner>
      ) : null}
    </>
  );
}
