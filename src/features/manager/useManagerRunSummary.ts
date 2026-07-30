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
  labId: string,
  onRefresh: () => Promise<DashboardDataset | null>
) {
  const [previousSnapshot, setPreviousSnapshot] = useState<ManagerSnapshot | null>(() =>
    labId ? readManagerSnapshot(sessionEmail, labId) : null
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

    if (labId) {
      const snapshot = buildSnapshotFromExperiments(refreshedDataset.experiments);
      setPreviousSnapshot(snapshot);
      writeManagerSnapshot(sessionEmail, labId, snapshot);
    }
  };

  return { previousSnapshot, lastRun, runSummary };
}
