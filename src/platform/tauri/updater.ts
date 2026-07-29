import { isTauri } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";
import type {
  AvailableAppUpdate,
  DesktopUpdaterPlatform,
  UpdateDownloadProgress
} from "../contracts";

function toProgress(event: DownloadEvent): UpdateDownloadProgress {
  switch (event.event) {
    case "Started":
      return { event: "Started", contentLength: event.data.contentLength };
    case "Progress":
      return { event: "Progress", chunkLength: event.data.chunkLength };
    case "Finished":
      return { event: "Finished" };
  }
}

function wrapUpdate(update: Update): AvailableAppUpdate {
  let closed = false;

  return {
    version: update.version,
    currentVersion: update.currentVersion,
    body: update.body,
    async downloadAndInstall(onProgress) {
      await update.downloadAndInstall((event) => {
        onProgress?.(toProgress(event));
      });
    },
    async close() {
      if (closed) {
        return;
      }
      closed = true;
      await update.close();
    }
  };
}

export const tauriUpdaterPlatform: DesktopUpdaterPlatform = {
  isSupported() {
    return isTauri();
  },

  async check() {
    if (!isTauri()) {
      return null;
    }
    const update = await check();
    return update ? wrapUpdate(update) : null;
  },

  async relaunch() {
    if (!isTauri()) {
      return;
    }
    await relaunch();
  }
};
