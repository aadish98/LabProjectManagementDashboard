import type {
  AppConfig,
  EmployeeSheetPrefs,
  UserSession
} from "../../domain/app";
import type {
  Invitation,
  Membership
} from "../../domain/onboarding";
import { StatusBanner } from "../../components/ui";
import {
  EmployeeConnectPane,
  FlowStatus,
  InvitationPane,
  OnboardingShell,
  OnboardingStatusCard
} from "./EmployeeOnboardingViews";
import { useEmployeeConnectController } from "./useEmployeeConnectController";

export interface EmployeeConnectFlowProps {
  session: UserSession;
  config: AppConfig;
  membership: Membership | null;
  invitations: Invitation[];
  initialPrefs?: EmployeeSheetPrefs | null;
  onValidated: (prefs: EmployeeSheetPrefs) => void;
  onAccessChanged?: () => void;
  onReconnect: () => void;
  onSignOut: () => void;
  onCancel?: () => void;
}

export function EmployeeConnectFlow({
  session,
  config,
  membership,
  invitations,
  initialPrefs,
  onValidated,
  onAccessChanged,
  onReconnect,
  onSignOut,
  onCancel
}: EmployeeConnectFlowProps) {
  const controller = useEmployeeConnectController({
    session,
    config,
    membership,
    invitations,
    initialPrefs,
    onValidated,
    onAccessChanged
  });
  const { current, invitation, onboarding } = controller;

  return (
    <OnboardingShell
      controller={controller}
      onReconnect={onReconnect}
      onSignOut={onSignOut}
    >
      {!current && invitation ? (
        <InvitationPane controller={controller} />
      ) : !current ? (
        <StatusBanner tone="error">
          No authoritative membership or invitation is available. Access cannot be inferred from
          local settings or a Drive file.
        </StatusBanner>
      ) : onboarding?.status === "invited" ||
        onboarding?.status === "needsSharing" ||
        onboarding?.status === "blocked" ? (
        <>
          <OnboardingStatusCard membership={current} />
          <FlowStatus controller={controller} showError={false} />
        </>
      ) : (
        <>
          <OnboardingStatusCard membership={current} />
          <EmployeeConnectPane controller={controller} onCancel={onCancel} />
        </>
      )}
    </OnboardingShell>
  );
}

/** @deprecated Use EmployeeConnectFlow for the onboarding orchestrator. */
export const EmployeeSetupGate = EmployeeConnectFlow;
export type EmployeeSetupGateProps = EmployeeConnectFlowProps;
