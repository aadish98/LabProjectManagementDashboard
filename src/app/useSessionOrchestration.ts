import { useCallback, useEffect, useRef, useState } from "react";
import {
  getFreshSession,
  revokeGoogleSession,
  signInWithGoogle
} from "../auth/googleIdentity";
import type { AppConfig, UserSession } from "../domain/app";
import {
  clearStoredSessionSecurely,
  readStoredConfig,
  readStoredSessionWithSecrets,
  writeStoredConfig,
  writeStoredSessionSecurely
} from "../services/cache";
import {
  GoogleSheetsAuthError,
  isGoogleSheetsAuthError
} from "../services/sheets/errors";

interface SessionCallbacks {
  onSessionStarted: () => void;
  onSessionCleared: () => void;
  onAuthError: (message: string) => void;
}

export function useSessionOrchestration(callbacks: SessionCallbacks) {
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  const [config, setConfig] = useState<AppConfig>(() => readStoredConfig());
  const [session, setSession] = useState<UserSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const sessionRef = useRef<UserSession | null>(null);
  const sessionEpochRef = useRef(0);

  useEffect(() => writeStoredConfig(config), [config]);

  const rememberSession = useCallback((nextSession: UserSession) => {
    sessionRef.current = nextSession;
    setSession((current) => {
      if (
        current &&
        current.email === nextSession.email &&
        current.name === nextSession.name &&
        current.accessToken === nextSession.accessToken &&
        current.idToken === nextSession.idToken &&
        current.refreshToken === nextSession.refreshToken &&
        current.accessTokenExpiresAt === nextSession.accessTokenExpiresAt
      ) {
        return current;
      }
      return nextSession;
    });
  }, []);

  const forgetSession = useCallback(() => {
    sessionEpochRef.current += 1;
    sessionRef.current = null;
    setSession(null);
    callbacksRef.current.onSessionCleared();
  }, []);

  const clearForFreshSignIn = useCallback(
    async (currentSession: UserSession | null, notice: string): Promise<void> => {
      forgetSession();
      setAuthNotice(notice);
      try {
        await clearStoredSessionSecurely(currentSession?.email);
      } catch (error) {
        const message =
          error instanceof Error
            ? `The local session was cleared, but the credential vault could not be cleared: ${error.message}`
            : "The local session was cleared, but the credential vault could not be cleared.";
        setAuthError(message);
        callbacksRef.current.onAuthError(message);
      }
    },
    [forgetSession]
  );

  useEffect(() => {
    let cancelled = false;
    const hydrationEpoch = sessionEpochRef.current;

    void (async () => {
      let storedSession: UserSession | null = null;
      try {
        storedSession = await readStoredSessionWithSecrets();
        if (cancelled || hydrationEpoch !== sessionEpochRef.current) return;
        if (!storedSession?.refreshToken) {
          await clearStoredSessionSecurely(storedSession?.email);
          return;
        }

        const freshSession = await getFreshSession(storedSession, config.googleClientId);
        if (cancelled || hydrationEpoch !== sessionEpochRef.current) return;
        await writeStoredSessionSecurely(freshSession);
        if (cancelled || hydrationEpoch !== sessionEpochRef.current) {
          await clearStoredSessionSecurely(freshSession.email);
          return;
        }
        rememberSession(freshSession);
        callbacksRef.current.onSessionStarted();
      } catch (error) {
        try {
          await clearStoredSessionSecurely(storedSession?.email);
        } catch (vaultError) {
          if (!cancelled) {
            const message =
              vaultError instanceof Error
                ? `Secure session recovery failed: ${vaultError.message}`
                : "Secure session recovery could not clear the credential vault.";
            setAuthError(message);
            callbacksRef.current.onAuthError(message);
          }
        }
        if (!cancelled) {
          sessionRef.current = null;
          setSession(null);
          setAuthNotice("Google needs a fresh sign-in to continue.");
        }
      } finally {
        if (!cancelled) setSessionLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [config.googleClientId, rememberSession]);

  const persistRefreshedSession = useCallback(
    async (nextSession: UserSession, expectedEpoch: number): Promise<void> => {
      if (expectedEpoch !== sessionEpochRef.current || !sessionRef.current) {
        throw new GoogleSheetsAuthError();
      }
      await writeStoredSessionSecurely(nextSession);
      if (expectedEpoch !== sessionEpochRef.current || !sessionRef.current) {
        await clearStoredSessionSecurely(nextSession.email);
        throw new GoogleSheetsAuthError();
      }
      rememberSession(nextSession);
    },
    [rememberSession]
  );

  const withFreshSession = useCallback(
    async <T,>(operation: (freshSession: UserSession) => Promise<T>): Promise<T> => {
      const activeSession = sessionRef.current;
      const activeEpoch = sessionEpochRef.current;
      if (!activeSession) throw new GoogleSheetsAuthError();

      let freshSession: UserSession;
      try {
        freshSession = await getFreshSession(activeSession, config.googleClientId);
      } catch {
        await clearForFreshSignIn(
          activeSession,
          "Google needs a fresh sign-in to continue."
        );
        throw new GoogleSheetsAuthError();
      }
      await persistRefreshedSession(freshSession, activeEpoch);

      try {
        return await operation(freshSession);
      } catch (error) {
        if (!isGoogleSheetsAuthError(error)) throw error;
        let retrySession: UserSession;
        try {
          retrySession = await getFreshSession(
            { ...freshSession, accessTokenExpiresAt: 0 },
            config.googleClientId
          );
        } catch {
          await clearForFreshSignIn(
            freshSession,
            "Google needs a fresh sign-in to continue."
          );
          throw new GoogleSheetsAuthError();
        }
        await persistRefreshedSession(retrySession, activeEpoch);
        return operation(retrySession);
      }
    },
    [clearForFreshSignIn, config.googleClientId, persistRefreshedSession]
  );

  const requestGoogleSession = useCallback(async () => {
    setAuthError("");
    setAuthNotice("");
    setSigningIn(true);
    let attemptedSession: UserSession | null = null;
    try {
      const signInEpoch = sessionEpochRef.current;
      const next = await signInWithGoogle(config.googleClientId);
      attemptedSession = next;
      if (signInEpoch !== sessionEpochRef.current) return;
      await writeStoredSessionSecurely(next);
      if (signInEpoch !== sessionEpochRef.current) {
        await clearStoredSessionSecurely(next.email);
        return;
      }
      rememberSession(next);
      callbacksRef.current.onSessionStarted();
    } catch (error) {
      const failedSession = sessionRef.current;
      forgetSession();
      try {
        await clearStoredSessionSecurely(
          attemptedSession?.email ?? failedSession?.email
        );
      } catch {
        // The original persistence/authentication error is more actionable.
      }
      const message = error instanceof Error ? error.message : "Unable to complete Google sign-in.";
      setAuthError(message);
      setAuthNotice("");
      callbacksRef.current.onAuthError(message);
    } finally {
      setSigningIn(false);
    }
  }, [config.googleClientId, forgetSession, rememberSession]);

  const requireFreshGoogleSignIn = useCallback(() => {
    setAuthError("");
    const activeSession = sessionRef.current;
    void clearForFreshSignIn(
      activeSession,
      "Google needs a fresh sign-in to continue."
    );
  }, [clearForFreshSignIn]);

  const signOut = useCallback(async () => {
    setAuthError("");
    setAuthNotice("");
    const activeSession = sessionRef.current;
    forgetSession();

    let revokeFailed = false;
    try {
      if (activeSession) await revokeGoogleSession(activeSession);
    } catch {
      revokeFailed = true;
    }

    try {
      await clearStoredSessionSecurely(activeSession?.email);
      if (revokeFailed) {
        setAuthNotice(
          "Signed out locally and cleared saved credentials, but Google token revocation could not be confirmed."
        );
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? `Signed out locally, but the credential vault could not be cleared: ${error.message}`
          : "Signed out locally, but the credential vault could not be cleared.";
      setAuthError(message);
      callbacksRef.current.onAuthError(message);
    }
  }, [forgetSession]);

  return {
    config,
    setConfig,
    session,
    sessionLoading,
    signingIn,
    authError,
    authNotice,
    withFreshSession,
    requestGoogleSession,
    requireFreshGoogleSignIn,
    signOut
  };
}
