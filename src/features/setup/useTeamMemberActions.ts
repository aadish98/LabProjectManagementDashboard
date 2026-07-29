import type { Dispatch, SetStateAction } from "react";
import type { AppConfig, UserSession } from "../../domain/app";
import type { Invitation, Member, MemberConfig, Membership } from "../../domain/onboarding";
import { invalidateDatasetCaches } from "../../services/cache";
import { mirrorMemberCompatibilityRows } from "../../services/sheets/admin";
import {
  sheetsErrorMessage,
  SheetRevisionConflictError
} from "../../services/sheets/errors";
import { extractIdFromUrl } from "../../services/sheets/helpers";
import { analyzeEmployeeSheetHeaders } from "../../services/sheets/metadata";
import { OnboardingApi } from "../../services/onboardingApi";
import { buildProposedColumnMap } from "../onboarding/columnMapping";
import {
  apiMessage,
  memberIssueFieldId,
  personFromRecords
} from "./teamSetupRecords";
import {
  splitForSave,
  type PeopleValidation,
  type PersonDraft
} from "./teamSetupState";

export interface MirrorRetry {
  person: PersonDraft;
  revision: number;
  deactivate: boolean;
  conflict: boolean;
}

interface TeamMemberActionsOptions {
  config: AppConfig;
  session: UserSession;
  membership: Membership | null;
  authoritativeAdminSpreadsheetId: string;
  validation: PeopleValidation;
  undoDeactivation: PersonDraft | null;
  mirrorRetry: MirrorRetry | null;
  setPeople: Dispatch<SetStateAction<PersonDraft[]>>;
  setSavedPeople: Dispatch<SetStateAction<PersonDraft[]>>;
  setSavingPersonId: Dispatch<SetStateAction<string | null>>;
  setPendingRemovalId: Dispatch<SetStateAction<string | null>>;
  setUndoDeactivation: Dispatch<SetStateAction<PersonDraft | null>>;
  setMirrorRetry: Dispatch<SetStateAction<MirrorRetry | null>>;
  setError: Dispatch<SetStateAction<string>>;
  setNotice: Dispatch<SetStateAction<string>>;
  reloadPeople: () => Promise<void>;
  onSaved: () => Promise<void>;
}

export function useTeamMemberActions(options: TeamMemberActionsOptions) {
  const {
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
    reloadPeople,
    onSaved
  } = options;

  const mirrorCompatibility = async (
    person: PersonDraft,
    revision: number,
    deactivate = false
  ) => {
    if (!session.accessToken || !authoritativeAdminSpreadsheetId) return "";
    const { registryRows, roleRows } = splitForSave([person]);
    const registryRow = registryRows[0];
    try {
      await mirrorMemberCompatibilityRows(
        { ...config, adminSpreadsheetId: authoritativeAdminSpreadsheetId },
        session,
        {
          memberId: person.id,
          revision,
          ...(registryRow
            ? {
                registry: {
                  ...registryRow,
                  active: deactivate ? false : registryRow.active
                }
              }
            : {}),
          roles: deactivate ? [] : roleRows
        }
      );
      setMirrorRetry(null);
      return "";
    } catch (mirrorError) {
      const conflict = mirrorError instanceof SheetRevisionConflictError;
      setMirrorRetry({ person, revision, deactivate, conflict });
      return ` The authoritative backend update succeeded, but the compatibility Sheets mirror ${
        conflict ? "has a revision conflict" : "needs retry"
      }: ${sheetsErrorMessage(mirrorError)}${
        conflict
          ? " Reload and reconcile the externally changed mirror row before retrying."
          : ""
      }`;
    }
  };

  const savePerson = async (person: PersonDraft) => {
    if (!membership || !session.idToken) {
      setError("Backend membership and a Google ID token are required.");
      return;
    }
    if ((validation.byPerson.get(person.id) ?? []).length > 0) {
      setError("Fix the highlighted fields before updating this onboarding record.");
      const firstIssue = validation.byPerson.get(person.id)?.[0];
      queueMicrotask(() => {
        document.getElementById(memberIssueFieldId(person.id, firstIssue ?? ""))?.focus();
      });
      return;
    }
    const spreadsheetId = extractIdFromUrl(person.taskLogUrl);
    if (!spreadsheetId) {
      setError("The selected Task-log workbook does not have a valid spreadsheet ID.");
      return;
    }
    if (!session.accessToken) {
      setError("Reconnect Google so the selected workbook and tab can be analyzed before saving.");
      return;
    }
    setSavingPersonId(person.id);
    setError("");
    setNotice("");
    try {
      const headerAnalysis = await analyzeEmployeeSheetHeaders(
        {
          taskLogUrl: person.taskLogUrl,
          activeSheetName: person.activeSheetName
        },
        session.accessToken
      );
      if (
        headerAnalysis.spreadsheetId !== spreadsheetId ||
        headerAnalysis.sheetTitle !== person.activeSheetName.trim()
      ) {
        throw new Error(
          "The analyzed workbook and tab no longer match this draft. Refresh the tabs and choose the exact tab again."
        );
      }
      const proposedColumnMap = buildProposedColumnMap(headerAnalysis);
      const api = new OnboardingApi({ idToken: session.idToken });
      const roles = (["employee", "manager", "pi"] as const).filter(
        (role) => person.roles[role]
      );
      const common = {
        displayName: person.name.trim(),
        roles,
        spreadsheetId,
        taskLogUrl: person.taskLogUrl.trim(),
        activeSheetName: person.activeSheetName.trim(),
        proposedColumnMap
      };
      let member: Member;
      let memberConfig: MemberConfig;
      let invitation: Invitation | undefined;

      if (person.invitationId && person.invitationRevision) {
        const result = await api.updateInvitation(
          membership.lab.id,
          person.invitationId,
          person.invitationRevision,
          common
        );
        member = result.member;
        memberConfig = result.config;
        invitation = result.invitation;
      } else if (person.memberRevision && person.configRevision) {
        const result = await api.updateMemberSetup(
          membership.lab.id,
          person.id,
          person.memberRevision,
          person.configRevision,
          {
            displayName: common.displayName,
            roles: common.roles,
            active: person.active
          },
          {
            spreadsheetId,
            taskLogUrl: common.taskLogUrl,
            activeSheetName: common.activeSheetName,
            proposedColumnMap: common.proposedColumnMap
          }
        );
        member = result.member;
        memberConfig = result.config;
      } else {
        const result = await api.createInvitation(membership.lab.id, {
          email: person.email.trim(),
          ...common,
          expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
        });
        member = result.member;
        memberConfig = result.config;
        invitation = result.invitation;
      }

      const saved = personFromRecords(member, memberConfig, invitation);
      setPeople((rows) => rows.map((row) => (row.id === person.id ? saved : row)));
      setSavedPeople((rows) => [
        ...rows.filter((row) => row.id !== person.id && row.id !== saved.id),
        saved
      ]);
      invalidateDatasetCaches(
        authoritativeAdminSpreadsheetId,
        `Team configuration changed for ${saved.name}.`
      );
      const mirrorWarning = await mirrorCompatibility(saved, member.revision);
      setNotice(
        `Authoritative onboarding record updated. Current readiness: ${member.onboarding.status}.${mirrorWarning}`
      );
      await onSaved();
    } catch (saveError) {
      setError(apiMessage(saveError));
    } finally {
      setSavingPersonId(null);
    }
  };

  const confirmRemoval = async (person: PersonDraft) => {
    setPendingRemovalId(null);
    if (!person.memberRevision) {
      setPeople((rows) => rows.filter((row) => row.id !== person.id));
      setSavedPeople((rows) => rows.filter((row) => row.id !== person.id));
      return;
    }
    if (!membership || !session.idToken) {
      setError("Backend membership and a Google ID token are required.");
      return;
    }
    setSavingPersonId(person.id);
    setError("");
    setNotice("");
    try {
      const result = await new OnboardingApi({
        idToken: session.idToken
      }).deactivateMember(
        membership.lab.id,
        person.id,
        person.memberRevision,
        person.invitationId && person.invitationRevision
          ? { id: person.invitationId, revision: person.invitationRevision }
          : undefined
      );
      const deactivated = {
        ...person,
        active: false,
        memberRevision: result.member.revision,
        onboarding: result.member.onboarding
      };
      replacePerson(setPeople, person.id, deactivated);
      replacePerson(setSavedPeople, person.id, deactivated);
      invalidateDatasetCaches(
        authoritativeAdminSpreadsheetId,
        `${person.name} was deactivated.`
      );
      const mirrorWarning = await mirrorCompatibility(
        deactivated,
        result.member.revision,
        true
      );
      setNotice(
        `${person.name} was deactivated in the authoritative backend.${mirrorWarning}`
      );
      setUndoDeactivation(deactivated);
      await onSaved();
    } catch (removeError) {
      setError(apiMessage(removeError));
    } finally {
      setSavingPersonId(null);
    }
  };

  const undoMemberDeactivation = async () => {
    const person = undoDeactivation;
    if (!person?.memberRevision || !membership || !session.idToken) return;
    setSavingPersonId(person.id);
    setError("");
    try {
      const result = await new OnboardingApi({
        idToken: session.idToken
      }).reactivateMember(membership.lab.id, person.id, person.memberRevision);
      const reactivated = {
        ...person,
        active: true,
        memberRevision: result.member.revision,
        onboarding: result.member.onboarding
      };
      replacePerson(setPeople, person.id, reactivated);
      replacePerson(setSavedPeople, person.id, reactivated);
      setUndoDeactivation(null);
      invalidateDatasetCaches(
        authoritativeAdminSpreadsheetId,
        `${person.name} was reactivated.`
      );
      const mirrorWarning = await mirrorCompatibility(
        reactivated,
        result.member.revision
      );
      setNotice(
        `${person.name} was reactivated in the authoritative backend.${mirrorWarning}`
      );
      await onSaved();
    } catch (undoError) {
      setError(apiMessage(undoError));
    } finally {
      setSavingPersonId(null);
    }
  };

  const provision = async (person: PersonDraft) => {
    if (
      !membership ||
      !session.idToken ||
      !session.accessToken ||
      person.memberRevision === undefined
    ) {
      setError("Reconnect Google before provisioning exact Drive file sharing.");
      return;
    }
    setSavingPersonId(person.id);
    setError("");
    try {
      const result = await new OnboardingApi({
        idToken: session.idToken,
        driveAccessToken: session.accessToken
      }).provisionDrive(membership.lab.id, person.id, person.memberRevision);
      const updateLifecycle = (row: PersonDraft) =>
        row.id === person.id
          ? {
              ...row,
              memberRevision: result.member.revision,
              onboarding: result.member.onboarding
            }
          : row;
      setPeople((rows) => rows.map(updateLifecycle));
      setSavedPeople((rows) => rows.map(updateLifecycle));
      setNotice(
        `Exact required files were provisioned. Current readiness: ${result.member.onboarding.status}.`
      );
    } catch (provisionError) {
      setError(apiMessage(provisionError));
    } finally {
      setSavingPersonId(null);
    }
  };

  const retryMirror = () => {
    if (!mirrorRetry) return;
    if (mirrorRetry.conflict) {
      setMirrorRetry(null);
      void reloadPeople();
      return;
    }
    void mirrorCompatibility(
      mirrorRetry.person,
      mirrorRetry.revision,
      mirrorRetry.deactivate
    ).then((warning) =>
      setNotice(warning ? warning.trim() : "Compatibility Sheets mirror is current.")
    );
  };

  return {
    savePerson,
    confirmRemoval,
    undoMemberDeactivation,
    provision,
    retryMirror
  };
}

function replacePerson(
  setter: Dispatch<SetStateAction<PersonDraft[]>>,
  id: string,
  replacement: PersonDraft
) {
  setter((rows) => rows.map((row) => (row.id === id ? replacement : row)));
}
