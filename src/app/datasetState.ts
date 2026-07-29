import type { DashboardDataset } from "../domain/experiment";

export function markDatasetStale(
  dataset: DashboardDataset,
  reason: string,
  invalidatedAt = new Date().toISOString()
): DashboardDataset {
  return {
    ...dataset,
    cacheStaleReason: reason,
    cacheInvalidatedAt: invalidatedAt
  };
}
