import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  DesktopPickerPlatform,
  PickedSpreadsheet,
  SpreadsheetPickerOptions
} from "../contracts";

const PICKER_INTERACTION_TIMEOUT_MS = 5 * 60_000;

type DrivePickerResult = {
  requestId: string;
  documents: PickedSpreadsheet[];
  error?: string | null;
};

function createRequestId(): string {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const tauriPickerPlatform: DesktopPickerPlatform = {
  async pickSpreadsheets(options: SpreadsheetPickerOptions): Promise<PickedSpreadsheet[]> {
    const requestId = createRequestId();
    let timeoutId = 0;
    let unlisten: (() => void) | null = null;
    let resolveResult!: (documents: PickedSpreadsheet[]) => void;
    let rejectResult!: (error: Error) => void;

    const resultPromise = new Promise<PickedSpreadsheet[]>((resolve, reject) => {
      resolveResult = resolve;
      rejectResult = reject;
      timeoutId = window.setTimeout(() => {
        reject(
          new Error("Drive Picker did not respond. Close any stale Picker browser tabs and try again.")
        );
      }, PICKER_INTERACTION_TIMEOUT_MS);
    });

    try {
      unlisten = await listen<DrivePickerResult>("drive-picker://result", (event) => {
        const payload = event.payload;
        if (payload.requestId !== requestId) return;
        if (payload.error) {
          rejectResult(new Error(payload.error));
          return;
        }
        resolveResult(payload.documents ?? []);
      });

      await invoke<number>("open_drive_picker", {
        options: {
          requestId,
          accessToken: options.accessToken,
          apiKey: options.apiKey.trim(),
          appId: options.appId.trim(),
          multiselect: !!options.multiselect,
          query: options.query?.trim() || null,
          title: options.title ?? null
        }
      });

      return await resultPromise;
    } finally {
      window.clearTimeout(timeoutId);
      unlisten?.();
    }
  }
};
