import type { ComponentProps } from "react";
import { SignedOutScreen } from "../components/SignedOutScreen";
import { TeamSetupPanel } from "../components/TeamSetupPanel";
import { UnauthorizedScreen } from "../components/UnauthorizedScreen";
import { Dialog, StatusBanner as UiStatusBanner } from "../components/ui";
import { EmployeeWorkspace } from "../features/employee/EmployeeWorkspace";
import { ManagerWorkspace } from "../features/manager/ManagerWorkspace";
import { EmployeeConnectFlow } from "../features/onboarding/EmployeeSetupGate";
import { ManagerFirstRun } from "../features/onboarding/ManagerFirstRun";
import type { MissingSpreadsheetAccess } from "../services/sheets/errors";
import type { AppRoute } from "./routing";

export type StatusMessage =
  | {
      kind: "info" | "error" | "success";
      text: string;
      errorCode?: string;
      httpStatus?: number;
      operation?: string;
    }
  | null;

export interface ManagerFileAccessIssue {
  message: string;
  missingSpreadsheets: MissingSpreadsheetAccess[];
}

function StatusMessageBanner({
  status,
  onDismiss
}: {
  status: StatusMessage;
  onDismiss?: () => void;
}) {
  if (!status) return null;
  return (
    <UiStatusBanner tone={status.kind} onDismiss={onDismiss}>
      <span>{status.text}</span>
      {status.errorCode || status.httpStatus || status.operation ? (
        <small>
          {[status.errorCode, status.httpStatus ? `HTTP ${status.httpStatus}` : "", status.operation]
            .filter(Boolean)
            .join(" · ")}
        </small>
      ) : null}
    </UiStatusBanner>
  );
}

function SkipToTasks({
  label = "Skip to tasks",
  targetId = "tasks-main"
}: {
  label?: string;
  targetId?: string;
} = {}) {
  return (
    <a className="skip-link" href={`#${targetId}`}>
      {label}
    </a>
  );
}

export function AccessCheckScreen() {
  return (
    <div>
      <SkipToTasks label="Skip to access status" targetId="access-main" />
      <main id="access-main" className="signin-shell" tabIndex={-1}>
        <section className="signin-card" aria-live="polite">
          <h1>Checking app access</h1>
          <p>Confirming your Access role and available workspace…</p>
        </section>
      </main>
    </div>
  );
}

interface UnauthorizedShellProps {
  status: StatusMessage;
  onDismissStatus: () => void;
  screenProps: ComponentProps<typeof UnauthorizedScreen>;
}

function UnauthorizedShell({
  status,
  onDismissStatus,
  screenProps
}: UnauthorizedShellProps) {
  return (
    <div className="page-shell">
      <SkipToTasks label="Skip to access details" />
      <StatusMessageBanner status={status} onDismiss={onDismissStatus} />
      <main id="tasks-main" tabIndex={-1}>
        <UnauthorizedScreen {...screenProps} />
      </main>
    </div>
  );
}

interface EmployeeShellProps {
  status: StatusMessage;
  onDismissStatus: () => void;
  workspaceProps: ComponentProps<typeof EmployeeWorkspace>;
}

function EmployeeShell({ status, onDismissStatus, workspaceProps }: EmployeeShellProps) {
  return (
    <div className="page-shell">
      <SkipToTasks />
      <StatusMessageBanner status={status} onDismiss={onDismissStatus} />
      <main aria-label="Member workspace">
        <EmployeeWorkspace {...workspaceProps} />
      </main>
    </div>
  );
}

interface ManagerShellProps {
  status: StatusMessage;
  onDismissStatus: () => void;
  setupProps: ComponentProps<typeof TeamSetupPanel> | null;
  workspaceProps: ComponentProps<typeof ManagerWorkspace> | null;
  role: "manager" | "pi";
  email: string;
  loading: boolean;
  reconnecting: boolean;
  refreshing: boolean;
  fileAccessIssue: ManagerFileAccessIssue | null;
  onOpenSetup: () => void;
  onReconnect: () => void;
  onSignOut: () => void;
  onGrantTaskLogAccess: () => void;
  onRetry: () => void;
}

function ManagerShell({
  status,
  onDismissStatus,
  setupProps,
  workspaceProps,
  role,
  email,
  loading,
  reconnecting,
  refreshing,
  fileAccessIssue,
  onOpenSetup,
  onReconnect,
  onSignOut,
  onGrantTaskLogAccess,
  onRetry
}: ManagerShellProps) {
  return (
    <div className="page-shell">
      <SkipToTasks />
      <StatusMessageBanner status={status} onDismiss={onDismissStatus} />
      {setupProps ? (
        <Dialog
          open
          title="Team setup"
          description="Manage Members, Access roles, and Task-log workbooks."
          onClose={setupProps.onClose}
          closeOnBackdrop={false}
          className="ui-dialog--wide"
        >
          <TeamSetupPanel {...setupProps} />
        </Dialog>
      ) : null}
      {workspaceProps ? (
        <main aria-label="Manager workspace">
          <ManagerWorkspace {...workspaceProps} />
        </main>
      ) : (
        <main className="manager-shell" id="tasks-main" tabIndex={-1}>
          <header className="manager-topbar">
            <div>
              <h1>{role === "pi" ? "PI dashboard" : "Manager dashboard"}</h1>
              <p className="muted-row">{loading ? "Loading dataset…" : "No data loaded."}</p>
            </div>
            <div className="manager-topbar__actions">
              <span className="muted-row">{email}</span>
              <button className="button button--ghost" type="button" onClick={onOpenSetup}>
                Team setup
              </button>
              <button
                className="button button--ghost"
                type="button"
                onClick={onReconnect}
                disabled={reconnecting}
              >
                {reconnecting ? "Reconnecting..." : "Reconnect Google"}
              </button>
              <button className="button button--secondary" type="button" onClick={onSignOut}>
                Sign out
              </button>
            </div>
          </header>
          <div className="callout">
            {loading ? (
              <p>Loading…</p>
            ) : fileAccessIssue ? (
              <>
                <p>{fileAccessIssue.message}</p>
                <p className="muted-row">
                  Re-select the listed workbooks in Drive Picker, then retry loading. This
                  recovery action does not change authoritative first-run proof.
                </p>
                <button
                  className="button button--primary"
                  type="button"
                  onClick={onGrantTaskLogAccess}
                  disabled={refreshing}
                >
                  {refreshing ? "Opening Drive…" : "Open Drive Picker"}
                </button>
              </>
            ) : (
              <>
                <p>
                  Couldn’t load the manager dataset. Open Team setup to check the authoritative
                  member configurations and Task-log access, then try again.
                </p>
                <button className="button button--primary" type="button" onClick={onRetry}>
                  Try again
                </button>
              </>
            )}
          </div>
          <details className="diagnostics-disclosure">
            <summary>Manager recovery and diagnostics</summary>
            <p>
              Signed in as {email}. Retry the current check, reconnect Google if the token expired,
              or open Team setup to inspect authoritative Member access and configuration.
            </p>
            <div className="button-row">
              <button className="button button--secondary" type="button" onClick={onRetry}>
                Retry data check
              </button>
              <button className="button button--ghost" type="button" onClick={onOpenSetup}>
                Open Team setup
              </button>
            </div>
          </details>
        </main>
      )}
    </div>
  );
}

export type AppScreensProps =
  | { route: Extract<AppRoute, "signedOut">; props: ComponentProps<typeof SignedOutScreen> }
  | { route: Extract<AppRoute, "accessCheck"> }
  | { route: Extract<AppRoute, "unauthorized">; props: UnauthorizedShellProps }
  | { route: Extract<AppRoute, "employeeSetup">; props: ComponentProps<typeof EmployeeConnectFlow> }
  | { route: Extract<AppRoute, "employeeWorkspace">; props: EmployeeShellProps }
  | { route: Extract<AppRoute, "managerSetup">; props: ComponentProps<typeof ManagerFirstRun> }
  | { route: Extract<AppRoute, "managerWorkspace">; props: ManagerShellProps };

export function AppScreens(screen: AppScreensProps) {
  switch (screen.route) {
    case "signedOut":
      return (
        <div>
          <SkipToTasks label="Skip to sign in" targetId="signin-main" />
          <main id="signin-main" tabIndex={-1}>
            <SignedOutScreen {...screen.props} />
          </main>
        </div>
      );
    case "accessCheck":
      return <AccessCheckScreen />;
    case "unauthorized":
      return <UnauthorizedShell {...screen.props} />;
    case "employeeSetup":
      return <EmployeeConnectFlow {...screen.props} />;
    case "employeeWorkspace":
      return <EmployeeShell {...screen.props} />;
    case "managerSetup":
      return <ManagerFirstRun {...screen.props} />;
    case "managerWorkspace":
      return <ManagerShell {...screen.props} />;
  }
}
