import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { resolveAuthoritativeViewerContext } from "../auth/roles";
import type { EmployeeSheetPrefs, UserSession } from "../domain/app";
import { backendAccessDiagnostic } from "../domain/identity";
import {
  acceptedMemberPrefs,
  type Invitation,
  type MemberConfig,
  type Membership
} from "../domain/onboarding";
import {
  BACKEND_BASE_URL,
  OnboardingApi,
  OnboardingApiError
} from "../services/onboardingApi";
import type { StatusMessage } from "./screens";

type FreshSessionRunner = <T>(
  operation: (freshSession: UserSession) => Promise<T>
) => Promise<T>;

interface AccessVerificationOptions {
  session: UserSession | null;
  withFreshSession: FreshSessionRunner;
}

export function useAccessVerification({
  session,
  withFreshSession
}: AccessVerificationOptions) {
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [pending, setPending] = useState(Boolean(session));
  const [diagnostic, setDiagnostic] = useState("");
  const [accessFailure, setAccessFailure] = useState<StatusMessage>(null);
  const [verifiedEmpty, setVerifiedEmpty] = useState(false);
  const verifiedRef = useRef<{
    email: string;
    memberships: Membership[];
    invitations: Invitation[];
  } | null>(null);
  const probeEpochRef = useRef(0);
  const memberConfigCacheRef = useRef(new Map<string, MemberConfig>());
  const viewer = useMemo(
    () =>
      resolveAuthoritativeViewerContext(
        session,
        memberships,
        invitations,
        pending,
        diagnostic || undefined
      ),
    [diagnostic, invitations, memberships, pending, session]
  );

  const probeAdminAccess = useCallback(async () => {
    if (!session) return;
    const probeEpoch = ++probeEpochRef.current;
    const setupDiagnostic = backendAccessDiagnostic(BACKEND_BASE_URL, session);
    if (setupDiagnostic.kind !== "ready") {
      setPending(false);
      setDiagnostic(`${setupDiagnostic.message} ${setupDiagnostic.action}`);
      setAccessFailure(null);
      setMemberships([]);
      setInvitations([]);
      setVerifiedEmpty(false);
      return;
    }
    setPending(true);
    setDiagnostic("");
    setAccessFailure(null);
    setVerifiedEmpty(false);
    try {
      const result = await withFreshSession(async (freshSession) => {
        const api = new OnboardingApi({ idToken: freshSession.idToken });
        const [membershipResponse, invitationResponse] = await Promise.all([
          api.getMemberships(),
          api.getMyInvitations()
        ]);
        return {
          memberships: membershipResponse.memberships.sort(
            (left, right) =>
              rolePriority(right.member.roles) - rolePriority(left.member.roles)
          ),
          invitations: invitationResponse.invitations
        };
      });
      if (probeEpoch !== probeEpochRef.current) return;
      setMemberships(result.memberships);
      setInvitations(result.invitations);
      setVerifiedEmpty(
        result.memberships.length === 0 && result.invitations.length === 0
      );
      memberConfigCacheRef.current.clear();
      for (const membership of result.memberships) {
        if (membership.config) {
          memberConfigCacheRef.current.set(
            `${membership.lab.id}:${membership.member.id}`,
            membership.config
          );
        }
      }
      verifiedRef.current = { email: session.email, ...result };
    } catch (error) {
      if (probeEpoch !== probeEpochRef.current) return;
      const cached =
        verifiedRef.current?.email.toLowerCase() === session.email.toLowerCase()
          ? verifiedRef.current
          : null;
      const isTransport =
        error instanceof OnboardingApiError &&
        (error.kind === "transport" || error.retryable);
      if (cached && isTransport) {
        setMemberships(cached.memberships);
        setInvitations(cached.invitations);
      } else {
        setMemberships([]);
        setInvitations([]);
      }
      setVerifiedEmpty(false);
      const message =
        error instanceof OnboardingApiError
          ? `${error.message} ${error.action}`
          : error instanceof Error
            ? error.message
            : "Could not verify authoritative app access.";
      setDiagnostic(message);
      setAccessFailure({
        kind: "error",
        text: message,
        ...(error instanceof OnboardingApiError
          ? {
              errorCode: error.code,
              httpStatus: error.status,
              operation: "verifyBackendAccess"
            }
          : {})
      });
    } finally {
      if (probeEpoch === probeEpochRef.current) {
        setPending(false);
      }
    }
  }, [session, withFreshSession]);

  useEffect(() => {
    if (!session) {
      probeEpochRef.current += 1;
      setMemberships([]);
      setInvitations([]);
      setDiagnostic("");
      setAccessFailure(null);
      setVerifiedEmpty(false);
      setPending(false);
      memberConfigCacheRef.current.clear();
      return;
    }
    void probeAdminAccess();
  }, [session?.idToken, probeAdminAccess]);

  const invalidateMemberConfigCache = useCallback(() => {
    memberConfigCacheRef.current.clear();
  }, []);

  const loadAuthoritativeManagerMembers = useCallback(
    async (labId: string, freshSession: UserSession) => {
      if (!freshSession.idToken) {
        throw new Error(
          "A fresh backend identity token is required to load member task configurations."
        );
      }
      const api = new OnboardingApi({ idToken: freshSession.idToken });
      const authoritativeMembers = await fetchAuthoritativeManagerMembers(api, labId);
      for (const { member, config } of authoritativeMembers) {
        if (config) {
          memberConfigCacheRef.current.set(`${labId}:${member.id}`, config);
        }
      }
      return authoritativeMembers;
    },
    []
  );

  const resolveMemberTaskPrefs = useCallback(
    async (
      labId: string,
      memberId: string,
      freshSession: UserSession
    ): Promise<EmployeeSheetPrefs> => {
      if (!freshSession.idToken) {
        throw new Error(
          "A fresh backend identity token is required to resolve the accepted column map."
        );
      }
      const key = `${labId}:${memberId}`;
      let config = memberConfigCacheRef.current.get(key);
      if (!config) {
        config = (
          await new OnboardingApi({ idToken: freshSession.idToken }).getConfig(
            labId,
            memberId
          )
        ).config;
        memberConfigCacheRef.current.set(key, config);
      }
      const prefs = acceptedMemberPrefs(config);
      if (!prefs) {
        throw new Error(
          "This member has no backend-accepted column map. Complete column review before changing tasks."
        );
      }
      return prefs;
    },
    []
  );

  return {
    viewer,
    probeAdminAccess,
    memberships,
    invitations,
    activeMembership: memberships[0] ?? null,
    accessDiagnostic: diagnostic,
    accessFailure,
    accessPending: pending,
    verifiedEmpty,
    resolveMemberTaskPrefs,
    loadAuthoritativeManagerMembers,
    invalidateMemberConfigCache
  };
}

function rolePriority(roles: Membership["member"]["roles"]): number {
  if (roles.includes("pi")) return 3;
  if (roles.includes("manager")) return 2;
  return 1;
}

export async function fetchAuthoritativeManagerMembers(
  api: Pick<OnboardingApi, "listMembers" | "getConfig">,
  labId: string
): Promise<Array<Pick<Membership, "member" | "config">>> {
  const { members } = await api.listMembers(labId);
  return Promise.all(
    members.filter((member) => member.active).map(async (member) => {
      try {
        const { config } = await api.getConfig(labId, member.id);
        return { member, config };
      } catch (error) {
        if (
          error instanceof OnboardingApiError &&
          error.code === "CONFIG_NOT_FOUND"
        ) {
          return { member, config: null };
        }
        throw error;
      }
    })
  );
}
