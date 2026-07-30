import { selectAppRoute } from "./routing";
import { AppScreens } from "./screens";
import type { AppController } from "./useAppController";

export function AppRouter({ app }: { app: AppController }) {
  if (app.sessionLoading) {
    return <AppScreens route="accessCheck" />;
  }

  const route = selectAppRoute({
    hasSession: Boolean(app.session),
    viewerRole: app.viewer.role,
    hasEmployeePrefs: Boolean(app.employeePrefs),
    employeeForceSetup: app.employeeForceSetup,
    onboardingStatus: app.activeMembership?.member.onboarding.status ?? null
  });

  if (route === "signedOut" || !app.session) {
    return (
      <AppScreens
        route="signedOut"
        props={{
          onSignIn: () => void app.requestGoogleSession(),
          signingIn: app.signingIn,
          errorMessage: app.authError,
          noticeMessage: app.authNotice
        }}
      />
    );
  }

  if (route === "accessCheck") {
    return <AppScreens route="accessCheck" />;
  }

  if (route === "unauthorized") {
    return (
      <AppScreens
        route="unauthorized"
        props={{
          status: app.accessFailure ?? app.status,
          onDismissStatus: () => app.setStatus(null),
          screenProps: {
            email: app.session.email,
            reason: app.viewer.reason,
            reconnecting: app.signingIn,
            onReconnect: () => void app.requestGoogleSession(),
            onSignOut: () => void app.signOut()
          }
        }}
      />
    );
  }

  if (route === "employeeSetup") {
    return (
      <AppScreens
        route="employeeSetup"
        props={{
          session: app.session,
          config: app.config,
          membership: app.activeMembership,
          invitations: app.invitations,
          initialPrefs: app.employeePrefs,
          onValidated: app.handleEmployeePrefsValidated,
          onAccessChanged: () => void app.probeAdminAccess(),
          onReconnect: () => void app.requestGoogleSession(),
          onSignOut: () => void app.signOut(),
          onCancel:
            app.employeePrefs && app.employeeForceSetup
              ? () => app.setEmployeeForceSetup(false)
              : undefined
        }}
      />
    );
  }

  if (route === "managerSetup" && app.activeMembership) {
    return (
      <AppScreens
        route="managerSetup"
        props={{
          session: app.session,
          config: app.config,
          membership: app.activeMembership,
          invitations: app.invitations,
          onValidated: () => undefined,
          onAccessChanged: app.probeAdminAccess,
          onReconnect: () => void app.requestGoogleSession(),
          onSignOut: () => void app.signOut()
        }}
      />
    );
  }

  if (route === "employeeWorkspace" && app.employeePrefs) {
    return (
      <AppScreens
        route="employeeWorkspace"
        props={{
          status: app.status,
          onDismissStatus: () => app.setStatus(null),
          workspaceProps: {
            session: app.session,
            labMember: app.employeeLabMember,
            prefs: app.employeePrefs,
            experiments: app.activeDataset?.experiments ?? [],
            saving: app.saving,
            loading: app.loading,
            lastSyncedAt: app.activeDataset?.lastSyncedAt,
            staleReason: app.activeDataset?.cacheStaleReason,
            onRefresh: () => app.loadEmployeeData(app.employeePrefs!),
            onCreate: app.handleEmployeeCreate,
            onUpdate: app.handleEmployeeUpdate,
            onComplete: app.handleEmployeeComplete,
            onResolveOverdue: app.handleEmployeeOverdue,
            onChangePrefs: () => app.setEmployeeForceSetup(true),
            onReconnect: () => void app.requestGoogleSession(),
            onSignOut: () => void app.signOut(),
            reconnecting: app.signingIn
          }
        }}
      />
    );
  }

  return (
    <AppScreens
      route="managerWorkspace"
      props={{
        status: app.status,
        onDismissStatus: () => app.setStatus(null),
        role: app.managerRole,
        email: app.session.email,
        loading: app.loading,
        reconnecting: app.signingIn,
        refreshing: app.refreshing,
        fileAccessIssue: app.managerFileAccessIssue,
        onOpenSetup: () => app.setShowSetup(true),
        onReconnect: () => void app.requestGoogleSession(),
        onSignOut: () => void app.signOut(),
        onGrantTaskLogAccess: () => void app.handleGrantManagerTaskLogAccess(),
        onRetry: () => void app.loadManagerData(),
        setupProps: app.showSetup
          ? {
              config: app.config,
              session: app.session,
              membership: app.activeMembership,
              onChange: app.setConfig,
              onClose: () => app.setShowSetup(false),
              onSaved: app.handleTeamSetupSaved
            }
          : null,
        workspaceProps: app.activeDataset
          ? {
              session: app.session,
              labId: app.activeMembership!.lab.id,
              viewerRole: app.managerRole,
              dataset: app.activeDataset,
              visibleLabMembers: app.visibleLabMembers,
              managerOwnLabMember: app.managerOwnLabMember,
              managerOwnPrefs: app.managerOwnPrefs,
              managerOwnExperiments: app.managerOwnExperiments,
              saving: app.saving,
              refreshing: app.refreshing || app.loading,
              onRefresh: app.handleManagerRefresh,
              onReconnect: () => void app.requestGoogleSession(),
              onSignOut: () => void app.signOut(),
              onOpenSetup: () => app.setShowSetup(true),
              memberRecoveryBusyKey: app.memberLoadRecovery.busyKey,
              onGrantMemberAccess: app.memberLoadRecovery.grantAndVerify,
              onRetryMember: app.memberLoadRecovery.retry,
              onDeactivateMember: app.memberLoadRecovery.deactivate,
              onCreateTask: app.handleManagerCreateTask,
              onUpdateTask: app.handleManagerUpdateTask,
              onCreateOwnTask: app.handleManagerCreateOwnTask,
              onUpdateOwnTask: app.handleManagerUpdateOwnTask,
              onCompleteOwnTask: app.handleManagerCompleteOwnTask,
              onResolveOwnOverdue: app.handleManagerResolveOwnOverdue,
              reconnecting: app.signingIn
            }
          : null
      }}
    />
  );
}
