interface UnauthorizedScreenProps {
  email: string;
  reconnecting: boolean;
  onReconnect: () => void;
  onOpenSetup: () => void;
  onSignOut: () => void;
}

export function UnauthorizedScreen({
  email,
  reconnecting,
  onReconnect,
  onOpenSetup,
  onSignOut
}: UnauthorizedScreenProps) {
  return (
    <div className="signin-shell">
      <section className="signin-card">
        <h1>Access not authorized</h1>
        <p>
          The Google account <strong>{email}</strong> is not on the manager or employee allow lists
          for this lab. Update setup if this device has stale access settings, reconnect Google, or
          sign out to use a different account.
        </p>
        <div className="button-row">
          <button className="button button--primary" type="button" onClick={onOpenSetup}>
            Open setup
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
      </section>
    </div>
  );
}
