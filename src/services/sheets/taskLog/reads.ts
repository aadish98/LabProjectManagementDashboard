import type { EmployeeSheetPrefs, UserSession } from "../../../domain/app";
import type {
  DashboardDataset,
  SheetRegistryEntry
} from "../../../domain/experiment";
import { getValuesForSheet } from "../client";
import { GoogleSheetsAuthError } from "../errors";
import { validateEmployeeSheet } from "../metadata";
import { parseExperimentRows } from "./parsing";

export async function loadEmployeeDataset(
  prefs: EmployeeSheetPrefs,
  labMember: string,
  session: UserSession
): Promise<DashboardDataset> {
  if (!session.accessToken) throw new GoogleSheetsAuthError();
  const validated = await validateEmployeeSheet(prefs, session.accessToken);
  const rows = await getValuesForSheet(
    validated.spreadsheetId,
    validated.sheetTitle,
    "A:ZZ",
    session.accessToken
  );
  const entry: SheetRegistryEntry = {
    labMember: labMember || session.name || session.email,
    taskLogUrl: prefs.taskLogUrl,
    activeSheetName: validated.sheetTitle,
    active: true
  };
  return {
    source: "googleSheets",
    registry: [entry],
    experiments: parseExperimentRows(
      entry,
      rows,
      prefs.columnMap,
      prefs.strictColumnMap
    ),
    runLog: [],
    feedbackThreads: [],
    roleDirectory: [],
    lastSyncedAt: new Date().toISOString()
  };
}
