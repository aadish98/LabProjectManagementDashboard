import { ConfirmDialog, StatusBanner } from "../../components/ui";
import { MemberList } from "./MemberList";
import type { TeamSetupController } from "./useTeamSetupController";

export function TeamSetupUnavailable({ controller }: { controller: TeamSetupController }) {
  return (
    <section className="panel lab-setup stack-md">
      <div className="panel__header">
        <div>
          <h2>Team setup unavailable</h2>
          <p>
            A verified backend manager membership and Google ID token are required. Configure
            VITE_BACKEND_BASE_URL or reconnect Google, then retry.
          </p>
        </div>
        <button
          className="button button--secondary"
          type="button"
          onClick={controller.actions.onClose}
        >
          Close
        </button>
      </div>
    </section>
  );
}

export function TeamSetupPane({ controller }: { controller: TeamSetupController }) {
  const { actions } = controller;
  return (
    <section className="panel lab-setup stack-md" aria-busy={controller.loading}>
      <TeamSetupHeader controller={controller} />
      <TeamSetupStatus controller={controller} />
      <div className="callout stack-xs">
        <strong>Saved does not mean ready.</strong>
        <p>
          Each Member shows the current owner, reason, and next action for Invited, Needs sharing,
          Needs Picker, Needs column review, Ready, or Blocked.
        </p>
      </div>
      <MemberList
        people={controller.people}
        savedPeopleById={controller.savedPeopleById}
        validation={controller.validation}
        controlsDisabled={controller.controlsDisabled}
        saving={!!controller.savingPersonId}
        repairingSetup={false}
        loading={controller.loading}
        savingPersonId={controller.savingPersonId}
        pendingRemovalId={controller.pendingRemovalId}
        onUpdate={actions.updatePerson}
        onRoleChange={actions.updateRole}
        onPickWorkbook={(id) => void actions.pickWorkbook(id)}
        onRefreshTabs={(id) => void actions.refreshTabs(id)}
        onSave={(person) => void actions.savePerson(person)}
        onProvision={(person) => void actions.provision(person)}
        onRemove={actions.requestRemoval}
      />
      <ConfirmDialog
        open={Boolean(controller.pendingRemoval)}
        title={`Deactivate ${
          controller.pendingRemoval?.name ||
          controller.pendingRemoval?.email ||
          "this Member"
        }?`}
        message="This deactivates only this member and revokes their pending invitation. Other members and workbooks are not changed."
        tone="danger"
        confirmLabel="Deactivate Member"
        busy={Boolean(
          controller.pendingRemoval &&
            controller.savingPersonId === controller.pendingRemoval.id
        )}
        onCancel={actions.cancelRemoval}
        onConfirm={() => {
          if (controller.pendingRemoval) {
            void actions.confirmRemoval(controller.pendingRemoval);
          }
        }}
      />
    </section>
  );
}

function TeamSetupHeader({ controller }: { controller: TeamSetupController }) {
  return (
    <div className="panel__header">
      <div>
        <h2>Authoritative Member onboarding</h2>
        <p>
          {controller.membership?.lab.name} · Firestore records control access, roles,
          readiness, and Task-log configuration.
        </p>
      </div>
      <div className="button-row">
        <button
          className="button button--primary"
          type="button"
          onClick={controller.actions.addInvitation}
          disabled={controller.controlsDisabled}
        >
          Add invitation
        </button>
        <button
          className="button button--ghost"
          type="button"
          onClick={controller.actions.onClose}
          disabled={controller.controlsDisabled}
        >
          Close
        </button>
      </div>
    </div>
  );
}

function TeamSetupStatus({ controller }: { controller: TeamSetupController }) {
  const { actions } = controller;
  return (
    <>
      {controller.loading ? (
        <p className="muted-row">Loading authoritative onboarding records…</p>
      ) : null}
      {controller.error ? (
        <StatusBanner tone="error" onDismiss={actions.dismissError}>
          {controller.error}
        </StatusBanner>
      ) : null}
      {controller.notice ? (
        <StatusBanner tone="success" onDismiss={actions.dismissNotice}>
          <span>{controller.notice}</span>
          {controller.undoDeactivation ? (
            <button
              className="button button--secondary"
              type="button"
              disabled={controller.controlsDisabled}
              onClick={() => void actions.undoMemberDeactivation()}
            >
              Undo member deactivation
            </button>
          ) : null}
        </StatusBanner>
      ) : null}
    </>
  );
}
