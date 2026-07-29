import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent
} from "react";
import type {
  AppConfig,
  EmployeeSheetPrefs,
  TaskFieldKey,
  UserSession
} from "../../domain/app";
import type {
  Invitation,
  Membership
} from "../../domain/onboarding";
import { membershipPrefs } from "../../domain/onboarding";
import { invalidateDatasetCaches } from "../../services/cache";
import { openSpreadsheetPicker } from "../../services/googleDrivePicker";
import {
  OnboardingApi,
  OnboardingApiError
} from "../../services/onboardingApi";
import { extractIdFromUrl } from "../../services/sheets/helpers";
import {
  analyzeEmployeeSheetHeaders,
  fetchSpreadsheetMetadata,
  insertHeadersInSheet
} from "../../services/sheets/metadata";
import {
  buildColumnMap,
  buildHeaderInsertions,
  validateSelections,
  type FieldChoice
} from "./columnMapping";
import { useEmployeeProfile } from "./useEmployeeProfile";
import { useEmployeeWorkbookState } from "./useEmployeeWorkbookState";

interface EmployeeConnectControllerOptions {
  session: UserSession;
  config: AppConfig;
  membership: Membership | null;
  invitations: Invitation[];
  initialPrefs?: EmployeeSheetPrefs | null;
  onValidated: (prefs: EmployeeSheetPrefs) => void;
  onAccessChanged?: () => void;
}

export function useEmployeeConnectController({
  session,
  config,
  membership,
  invitations,
  initialPrefs,
  onValidated,
  onAccessChanged
}: EmployeeConnectControllerOptions) {
  const [current, setCurrent] = useState<Membership | null>(membership);
  const [taskLogUrl, setTaskLogUrl] = useState(
    membership?.config?.taskLogUrl ?? initialPrefs?.taskLogUrl ?? ""
  );
  const [activeSheetName, setActiveSheetName] = useState(
    membership?.config?.activeSheetName ?? initialPrefs?.activeSheetName ?? ""
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setCurrent(membership);
    if (membership?.config) {
      setTaskLogUrl(membership.config.taskLogUrl ?? "");
      setActiveSheetName(membership.config.activeSheetName);
    }
  }, [membership]);

  const onboarding = current?.member.onboarding;
  const authoritativeConfig = current?.config;
  const profile = useEmployeeProfile({
    session,
    taskLogUrl,
    activeSheetName,
    fallbackSheetName: authoritativeConfig?.activeSheetName
  });
  const invitation = invitations[0];
  const hasSelectedSpreadsheet = !!taskLogUrl.trim();
  const hasSelectedSheet = !!activeSheetName.trim();
  const showColumnReview =
    onboarding?.status === "needsColumnReview" && hasSelectedSpreadsheet && hasSelectedSheet;
  const reportError = useCallback((nextError: unknown) => {
    setError(messageFor(nextError));
  }, []);
  const clearError = useCallback(() => setError(""), []);
  const {
    spreadsheetTitle,
    setSpreadsheetTitle,
    sheetOptions,
    setSheetOptions,
    analysis,
    setAnalysis,
    selections,
    setSelections,
    analyzing
  } = useEmployeeWorkbookState({
    accessToken: session.accessToken,
    taskLogUrl,
    activeSheetName,
    showColumnReview,
    authoritativeConfig,
    initialColumnMap: initialPrefs?.columnMap,
    reportError,
    clearError
  });
  const validation = useMemo(() => validateSelections(selections), [selections]);
  const hasDuplicates = validation.duplicates.size > 0;
  const hasMissingRequired = validation.missingFields.length > 0;
  const matchedCount = Object.values(selections).filter(
    (choice) => choice?.kind === "existing"
  ).length;
  const willAddCount = Object.values(selections).filter(
    (choice) => choice?.kind === "add"
  ).length;

  const acceptInvitation = async () => {
    if (!invitation || !session.idToken) return;
    setBusy(true);
    setError("");
    try {
      const api = new OnboardingApi({ idToken: session.idToken });
      await api.acceptInvitation(invitation);
      const { memberships } = await api.getMemberships();
      const accepted = memberships.find(
        (entry) => entry.member.id === invitation.memberId
      );
      if (!accepted) {
        throw new Error("The accepted membership could not be reloaded.");
      }
      setCurrent(accepted);
      setTaskLogUrl(accepted.config?.taskLogUrl ?? "");
      setActiveSheetName(accepted.config?.activeSheetName ?? "");
      setNotice("Invitation accepted. A manager must now complete exact Drive sharing.");
      onAccessChanged?.();
    } catch (acceptError) {
      setError(messageFor(acceptError));
    } finally {
      setBusy(false);
    }
  };

  const pickSpreadsheet = async () => {
    if (!session.accessToken || !session.idToken) {
      setError("Reconnect Google to obtain both Drive and identity tokens.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const [picked] = await openSpreadsheetPicker({
        accessToken: session.accessToken,
        apiKey: config.googleApiKey,
        appId: config.googleAppId,
        query: spreadsheetTitle.trim(),
        title:
          onboarding?.status === "needsPicker"
            ? "Select the exact invited Task-log workbook"
            : "Request a different Task-log workbook"
      });
      if (!picked) return;
      if (onboarding?.status === "needsPicker" && current?.config) {
        if (picked.id !== current.config.spreadsheetId) {
          throw new Error(
            "That is not the invited workbook. Select the exact prefilled task-log file."
          );
        }
      }
      const metadata = await fetchSpreadsheetMetadata(picked.id, session.accessToken);

      if (onboarding?.status === "needsPicker" && current?.config) {
        const result = await new OnboardingApi({
          idToken: session.idToken
        }).recordPickerProof(
          current.lab.id,
          current.member.id,
          current.config.revision,
          picked.id
        );
        setCurrent({ ...current, member: result.member, config: result.config });
        setNotice("Exact-file Picker proof recorded centrally.");
      }
      setTaskLogUrl(picked.url);
      setSpreadsheetTitle(metadata.spreadsheetTitle || picked.name);
      setSheetOptions(metadata.sheets);
      setActiveSheetName(
        picked.id === authoritativeConfig?.spreadsheetId
          ? authoritativeConfig.activeSheetName
          : ""
      );
    } catch (pickError) {
      setError(messageFor(pickError));
    } finally {
      setBusy(false);
    }
  };

  const updateSelection = (key: TaskFieldKey, choice: FieldChoice | undefined) => {
    setSelections((currentSelections) => ({
      ...currentSelections,
      [key]: choice
    }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!current?.config || !session.idToken || !session.accessToken) {
      setError("A verified backend membership and Google session are required.");
      return;
    }
    if (showColumnReview && (hasMissingRequired || hasDuplicates)) {
      const firstInvalidKey =
        validation.missingFields[0] ??
        Array.from(validation.duplicates.values())[0]?.[0];
      setError(
        hasMissingRequired
          ? "Map every required field. Optional fields may remain unmapped."
          : "Each mapped field must use a different column."
      );
      if (firstInvalidKey) {
        queueMicrotask(() =>
          document.getElementById(`column-map-${firstInvalidKey}`)?.focus()
        );
      }
      return;
    }
    setBusy(true);
    setError("");
    try {
      const pickedId = extractIdFromUrl(taskLogUrl);
      if (!pickedId || !activeSheetName) {
        throw new Error("Choose a workbook and an explicit tab.");
      }
      const api = new OnboardingApi({ idToken: session.idToken });

      if (onboarding?.status === "ready") {
        if (
          pickedId === current.config.spreadsheetId &&
          activeSheetName === current.config.activeSheetName
        ) {
          onValidated(membershipPrefs(current) as EmployeeSheetPrefs);
          return;
        }
        const changedAnalysis = await analyzeEmployeeSheetHeaders(
          { taskLogUrl, activeSheetName },
          session.accessToken
        );
        const changed = await api.updateConfig(
          current.lab.id,
          current.member.id,
          current.config.revision,
          {
            spreadsheetId: pickedId,
            taskLogUrl,
            activeSheetName,
            proposedColumnMap: changedAnalysis.inferredMap
          }
        );
        setCurrent({ ...current, member: changed.member, config: changed.config });
        invalidateDatasetCaches(
          extractIdFromUrl(current.lab.adminSpreadsheetId),
          `Task-log mapping changed for ${current.member.displayName}.`
        );
        setNotice(
          `The authoritative configuration was updated. Current readiness: ${changed.member.onboarding.status}.`
        );
        onAccessChanged?.();
        return;
      }

      if (!analysis) throw new Error("Wait for the column analysis to finish.");
      if (hasMissingRequired) {
        throw new Error("Map every required field. Optional fields may remain unmapped.");
      }
      if (hasDuplicates) {
        throw new Error("Each mapped field must use a different column.");
      }
      const insertions = buildHeaderInsertions(selections);
      const inserted =
        insertions.length > 0
          ? await insertHeadersInSheet(
              analysis.spreadsheetId,
              analysis.sheetId,
              analysis.sheetTitle,
              session.accessToken,
              insertions
            )
          : { appended: [] };
      const acceptedColumnMap = buildColumnMap(
        selections,
        inserted.appended.map((entry) => ({
          field: entry.field,
          header: entry.header
        }))
      );
      const result = await api.updateConfig(
        current.lab.id,
        current.member.id,
        current.config.revision,
        {
          activeSheetName: analysis.sheetTitle,
          acceptedColumnMap,
          columnReviewComplete: true
        }
      );
      const prefs: EmployeeSheetPrefs = {
        taskLogUrl: result.config.taskLogUrl ?? taskLogUrl,
        activeSheetName: result.config.activeSheetName,
        columnMap: result.config.acceptedColumnMap,
        strictColumnMap: true
      };
      setCurrent({ ...current, member: result.member, config: result.config });
      invalidateDatasetCaches(
        extractIdFromUrl(current.lab.adminSpreadsheetId),
        `Column mapping changed for ${current.member.displayName}.`
      );
      onValidated(prefs);
      onAccessChanged?.();
    } catch (submitError) {
      setError(messageFor(submitError));
    } finally {
      setBusy(false);
    }
  };

  const retryAnalysis = () => {
    setAnalysis(null);
    setActiveSheetName((value) => `${value} `);
    queueMicrotask(() => setActiveSheetName((value) => value.trim()));
  };

  return {
    session,
    current,
    invitation,
    onboarding,
    profile,
    taskLogUrl,
    activeSheetName,
    spreadsheetTitle,
    sheetOptions,
    analysis,
    selections,
    validation,
    busy,
    analyzing,
    error,
    notice,
    hasSelectedSpreadsheet,
    hasSelectedSheet,
    showColumnReview,
    hasDuplicates,
    hasMissingRequired,
    matchedCount,
    willAddCount,
    actions: {
      acceptInvitation,
      pickSpreadsheet,
      submit,
      updateSelection,
      retryAnalysis,
      setActiveSheetName,
      clearError,
      clearNotice: () => setNotice("")
    }
  };
}

export type EmployeeConnectController = ReturnType<typeof useEmployeeConnectController>;

function messageFor(error: unknown): string {
  if (error instanceof OnboardingApiError) {
    return `${error.message} ${error.action}`;
  }
  return error instanceof Error ? error.message : "The operation failed.";
}
