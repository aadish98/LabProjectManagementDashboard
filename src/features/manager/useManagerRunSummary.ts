import { useState } from "react";
import type { DashboardDataset } from "../../domain/experiment";
import {
  readManagerLastRun,
  readManagerSnapshot,
  writeManagerLastRun,
  writeManagerSnapshot,
  type ManagerLastRun,
  type ManagerSnapshot
} from "../../services/cache";
import { buildSnapshotFromExperiments } from "./ChangeLogPanel";

export function useManagerRunSummary(
  sessionEmail: string,
  adminSpreadsheetId: string,
  onRefresh: () => Promise<DashboardDataset | null>
) {
  const [previousSnapshot, setPreviousSnapshot] = useState<ManagerSnapshot | null>(() =>
    adminSpreadsheetId ? readManagerSnapshot(sessionEmail, adminSpreadsheetId) : null
  );
  const [lastRun, setLastRun] = useState<ManagerLastRun | null>(() =>
    readManagerLastRun(sessionEmail)
  );

  const runSummary = async () => {
    const start = Date.now();
    const refreshedDataset = await onRefresh();
    if (!refreshedDataset) return;

    const next: ManagerLastRun = {
      ranAt: new Date().toISOString(),
      durationMs: Date.now() - start
    };
    setLastRun(next);
    writeManagerLastRun(sessionEmail, next);

    if (adminSpreadsheetId) {
      const snapshot = buildSnapshotFromExperiments(refreshedDataset.experiments);
      setPreviousSnapshot(snapshot);
      writeManagerSnapshot(sessionEmail, adminSpreadsheetId, snapshot);
    }
  };

  return { previousSnapshot, lastRun, runSummary };
}
