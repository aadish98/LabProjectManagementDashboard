import type { PickedSpreadsheet, SpreadsheetPickerOptions } from "../platform/contracts";
import { tauriPickerPlatform } from "../platform/tauri/picker";

export type { PickedSpreadsheet, SpreadsheetPickerOptions } from "../platform/contracts";

export function pickerSearchQuery(query: string | undefined): string {
  const value = query?.trim() ?? "";
  if (!value) return "";
  try {
    const parsed = new URL(value);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return "";
  } catch {
    // Human-readable workbook titles are not URLs and remain useful search hints.
  }
  return value;
}

function requirePickerConfig(options: SpreadsheetPickerOptions): void {
  if (!options.accessToken) {
    throw new Error("Google needs a fresh sign-in before opening Drive Picker.");
  }
  if (!options.apiKey.trim()) {
    throw new Error(
      "Drive Picker is missing the Google API key. Set VITE_GOOGLE_API_KEY in .env and reload."
    );
  }
  if (!options.appId.trim()) {
    throw new Error(
      "Drive Picker is missing the Google app ID. Set VITE_GOOGLE_APP_ID in .env and reload."
    );
  }
}

export async function openSpreadsheetPicker(
  options: SpreadsheetPickerOptions
): Promise<PickedSpreadsheet[]> {
  requirePickerConfig(options);
  return tauriPickerPlatform.pickSpreadsheets({
    ...options,
    query: pickerSearchQuery(options.query)
  });
}
