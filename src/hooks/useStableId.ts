import { useId } from "react";

function normalizeId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "");
}

/**
 * Returns a hydration-safe ID while allowing consumers to provide their own.
 */
export function useStableId(providedId?: string, prefix = "ui") {
  const reactId = useId();
  return providedId ?? `${prefix}-${normalizeId(reactId)}`;
}
