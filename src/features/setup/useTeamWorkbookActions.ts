import type { AppConfig, UserSession } from "../../domain/app";
import { openSpreadsheetPicker } from "../../services/googleDrivePicker";
import { sheetsErrorMessage } from "../../services/sheets/errors";
import { fetchSpreadsheetMetadata } from "../../services/sheets/metadata";
import type { PersonDraft } from "./teamSetupState";

interface TeamWorkbookActionsOptions {
  config: AppConfig;
  session: UserSession;
  people: PersonDraft[];
  updatePerson: (id: string, patch: Partial<PersonDraft>) => void;
  setError: (message: string) => void;
}

export function useTeamWorkbookActions({
  config,
  session,
  people,
  updatePerson,
  setError
}: TeamWorkbookActionsOptions) {
  const pickWorkbook = async (id: string) => {
    const person = people.find((row) => row.id === id);
    if (!person || !session.accessToken) {
      setError("Reconnect Google before choosing a Task-log workbook.");
      return;
    }
    updatePerson(id, { tabError: "" });
    try {
      const [picked] = await openSpreadsheetPicker({
        accessToken: session.accessToken,
        apiKey: config.googleApiKey,
        appId: config.googleAppId,
        query: person.taskLogTitle.trim(),
        title: person.name.trim()
          ? `Choose Task-log workbook for ${person.name.trim()}`
          : "Choose this member's Task-log workbook"
      });
      if (!picked) return;
      updatePerson(id, {
        taskLogUrl: picked.url,
        taskLogTitle: picked.name ?? "",
        activeSheetName: "",
        availableTabs: [],
        loadingTabs: true
      });
      const metadata = await fetchSpreadsheetMetadata(picked.id, session.accessToken);
      updatePerson(id, {
        taskLogTitle: metadata.spreadsheetTitle || picked.name || "",
        availableTabs: metadata.sheets,
        loadingTabs: false
      });
    } catch (pickError) {
      updatePerson(id, {
        loadingTabs: false,
        tabError: sheetsErrorMessage(pickError)
      });
    }
  };

  const refreshTabs = async (id: string) => {
    const person = people.find((row) => row.id === id);
    if (!person?.taskLogUrl || !session.accessToken) return;
    updatePerson(id, { loadingTabs: true, tabError: "" });
    try {
      const metadata = await fetchSpreadsheetMetadata(person.taskLogUrl, session.accessToken);
      updatePerson(id, {
        taskLogTitle: metadata.spreadsheetTitle,
        availableTabs: metadata.sheets,
        loadingTabs: false
      });
    } catch (refreshError) {
      updatePerson(id, {
        loadingTabs: false,
        tabError: sheetsErrorMessage(refreshError)
      });
    }
  };

  return { pickWorkbook, refreshTabs };
}
