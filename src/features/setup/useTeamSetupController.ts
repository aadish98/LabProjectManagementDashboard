import {
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";
import type { RoleCapability } from "../../domain/access";
import type { AppConfig, UserSession } from "../../domain/app";
import type { Membership } from "../../domain/onboarding";
import { extractIdFromUrl } from "../../services/sheets/helpers";
import {
  OnboardingApi,
  OnboardingApiError
} from "../../services/onboardingApi";
import {
  apiMessage,
  personFromRecords
} from "./teamSetupRecords";
import {
  blankPerson,
  validatePeople,
  type PersonDraft
} from "./teamSetupState";
import {
  useTeamMemberActions,
  type MirrorRetry
} from "./useTeamMemberActions";
import { useTeamWorkbookActions } from "./useTeamWorkbookActions";

interface TeamSetupControllerOptions {
  config: AppConfig;
  session: UserSession;
  membership: Membership | null;
  onChange: (nextConfig: AppConfig) => void;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

export function useTeamSetupController({
  config,
  session,
  membership,
  onChange,
  onClose,
  onSaved
}: TeamSetupControllerOptions) {
  const [people, setPeople] = useState<PersonDraft[]>([]);
  const [savedPeople, setSavedPeople] = useState<PersonDraft[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingPersonId, setSavingPersonId] = useState<string | null>(null);
  const [pendingRemovalId, setPendingRemovalId] = useState<string | null>(null);
  const [undoDeactivation, setUndoDeactivation] = useState<PersonDraft | null>(null);
  const [mirrorRetry, setMirrorRetry] = useState<MirrorRetry | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const validation = useMemo(() => validatePeople(people), [people]);
  const savedPeopleById = useMemo(
    () => new Map(savedPeople.map((person) => [person.id, person])),
    [savedPeople]
  );
  const controlsDisabled = loading || !!savingPersonId;
  const pendingRemoval = people.find((person) => person.id === pendingRemovalId) ?? null;
  const authoritativeAdminSpreadsheetId = membership?.lab.adminSpreadsheetId.trim() ?? "";

  useEffect(() => {
    if (
      authoritativeAdminSpreadsheetId &&
      extractIdFromUrl(config.adminSpreadsheetId) !== authoritativeAdminSpreadsheetId
    ) {
      onChange({
        ...config,
        adminSpreadsheetId: authoritativeAdminSpreadsheetId
      });
    }
  }, [authoritativeAdminSpreadsheetId, config, onChange]);

  const loadAuthoritativePeople = useCallback(async () => {
    if (!membership || !session.idToken) return;
    setLoading(true);
    setError("");
    try {
      const api = new OnboardingApi({ idToken: session.idToken });
      const [{ members }, { invitations }] = await Promise.all([
        api.listMembers(membership.lab.id),
        api.listInvitations(membership.lab.id)
      ]);
      const configs = await Promise.all(
        members.map(async (member) => {
          try {
            return (await api.getConfig(member.labId, member.id)).config;
          } catch (configError) {
            if (
              configError instanceof OnboardingApiError &&
              configError.code === "CONFIG_NOT_FOUND"
            ) {
              return null;
            }
            throw configError;
          }
        })
      );
      const invitationByMember = new Map(
        invitations
          .filter((invitation) => invitation.status === "pending")
          .map((invitation) => [invitation.memberId, invitation])
      );
      const next = members.map((member, index) =>
        personFromRecords(member, configs[index] ?? null, invitationByMember.get(member.id))
      );
      setPeople(next);
      setSavedPeople(next);
    } catch (loadError) {
      setError(
        `${apiMessage(loadError)} Any onboarding draft already shown here was preserved.`
      );
    } finally {
      setLoading(false);
    }
  }, [membership, session.idToken]);

  useEffect(() => {
    void loadAuthoritativePeople();
  }, [loadAuthoritativePeople]);

  const updatePerson = (id: string, patch: Partial<PersonDraft>) => {
    setNotice("");
    setError("");
    setPeople((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const updateRole = (id: string, role: RoleCapability, checked: boolean) => {
    setPeople((rows) =>
      rows.map((row) =>
        row.id === id ? { ...row, roles: { ...row.roles, [role]: checked } } : row
      )
    );
    setNotice("");
    setError("");
  };

  const workbookActions = useTeamWorkbookActions({
    config,
    session,
    people,
    updatePerson,
    setError
  });
  const memberActions = useTeamMemberActions({
    config,
    session,
    membership,
    authoritativeAdminSpreadsheetId,
    validation,
    undoDeactivation,
    mirrorRetry,
    setPeople,
    setSavedPeople,
    setSavingPersonId,
    setPendingRemovalId,
    setUndoDeactivation,
    setMirrorRetry,
    setError,
    setNotice,
    reloadPeople: loadAuthoritativePeople,
    onSaved
  });

  return {
    membership,
    available: Boolean(membership && session.idToken),
    people,
    savedPeopleById,
    validation,
    loading,
    savingPersonId,
    pendingRemovalId,
    pendingRemoval,
    undoDeactivation,
    mirrorRetry,
    error,
    notice,
    controlsDisabled,
    authoritativeAdminSpreadsheetId,
    actions: {
      onClose,
      addInvitation: () => setPeople((rows) => [...rows, blankPerson()]),
      updatePerson,
      updateRole,
      requestRemoval: setPendingRemovalId,
      cancelRemoval: () => setPendingRemovalId(null),
      dismissError: () => setError(""),
      dismissNotice: () => {
        setNotice("");
        setUndoDeactivation(null);
      },
      ...workbookActions,
      ...memberActions
    }
  };
}

export type TeamSetupController = ReturnType<typeof useTeamSetupController>;
