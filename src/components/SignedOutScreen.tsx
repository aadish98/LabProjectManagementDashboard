interface SignedOutScreenProps {
  onSignIn: () => void;
  signingIn: boolean;
  errorMessage?: string;
  noticeMessage?: string;
}

export function SignedOutScreen({
  onSignIn,
  signingIn,
  errorMessage,
  noticeMessage
}: SignedOutScreenProps) {
  return (
    <div className="signin-shell">
      <section className="signin-card">
        <h1>Lab Workflow</h1>
        <p>Sign in with your lab Google account to continue.</p>
        {noticeMessage ? <p className="muted-row">{noticeMessage}</p> : null}
        <button
          className="button button--primary"
          type="button"
          onClick={onSignIn}
          disabled={signingIn}
        >
          {signingIn ? "Signing in..." : "Sign in with Google"}
        </button>
        {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
      </section>
    </div>
  );
}
