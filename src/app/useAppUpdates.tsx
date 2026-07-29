import { useEffect, useRef, useState } from "react";
import { ConfirmDialog, StatusBanner } from "../components/ui";
import type { AvailableAppUpdate } from "../platform/contracts";
import { tauriUpdaterPlatform } from "../platform/tauri/updater";

type UpdatePhase = "idle" | "available" | "downloading" | "error";

async function closeUpdateQuietly(update: AvailableAppUpdate) {
  try {
    await update.close();
  } catch {
    // Closing a native updater resource must not surface as an app-level failure.
  }
}

export function useAppUpdates() {
  const [update, setUpdate] = useState<AvailableAppUpdate | null>(null);
  const [phase, setPhase] = useState<UpdatePhase>("idle");
  const [progressLabel, setProgressLabel] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const checkedRef = useRef(false);

  useEffect(() => {
    if (checkedRef.current || !tauriUpdaterPlatform.isSupported()) {
      return;
    }
    checkedRef.current = true;
    let active = true;
    let checkedUpdate: AvailableAppUpdate | null = null;

    void tauriUpdaterPlatform
      .check()
      .then((available) => {
        if (!available) {
          return;
        }
        checkedUpdate = available;
        if (!active) {
          void closeUpdateQuietly(available);
          return;
        }
        setUpdate(available);
        setPhase("available");
      })
      .catch(() => {
        // Never block sign-in or workspace use when the update check fails.
      });

    return () => {
      active = false;
      if (checkedUpdate) {
        void closeUpdateQuietly(checkedUpdate);
      }
    };
  }, []);

  const dismiss = () => {
    if (phase === "downloading") {
      return;
    }
    if (update) {
      void closeUpdateQuietly(update);
    }
    setDialogOpen(false);
    setPhase("idle");
    setUpdate(null);
    setErrorMessage("");
    setProgressLabel("");
  };

  const installAndRestart = async () => {
    if (!update || phase === "downloading") {
      return;
    }

    setPhase("downloading");
    setErrorMessage("");
    setProgressLabel("Starting download…");

    let downloaded = 0;
    let contentLength = 0;

    let installed = false;

    try {
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          contentLength = event.contentLength ?? 0;
          setProgressLabel(
            contentLength > 0
              ? `Downloading update (0 of ${contentLength} bytes)…`
              : "Downloading update…"
          );
          return;
        }
        if (event.event === "Progress") {
          downloaded += event.chunkLength;
          setProgressLabel(
            contentLength > 0
              ? `Downloading update (${downloaded} of ${contentLength} bytes)…`
              : `Downloading update (${downloaded} bytes)…`
          );
          return;
        }
        setProgressLabel("Installing update…");
      });
      installed = true;
      await closeUpdateQuietly(update);
      setUpdate(null);
      setDialogOpen(false);
      await tauriUpdaterPlatform.relaunch();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setPhase("error");
      setErrorMessage(
        installed
          ? "The update was installed, but the app could not restart automatically. Close and reopen the app to finish."
          : detail || "Could not install the update."
      );
      setProgressLabel("");
    }
  };

  const banner =
    phase === "available" && update ? (
      <StatusBanner
        tone="info"
        title="Update available"
        className="app-update-banner"
        onDismiss={dismiss}
        dismissLabel="Dismiss update notification"
      >
        <p>
          Version {update.version} is ready
          {update.currentVersion ? ` (you have ${update.currentVersion})` : ""}.
        </p>
        <button
          type="button"
          className="app-update-banner__action"
          onClick={() => setDialogOpen(true)}
        >
          Install and restart
        </button>
      </StatusBanner>
    ) : phase === "downloading" ? (
      <StatusBanner tone="info" title="Updating" className="app-update-banner">
        <p>{progressLabel || "Downloading update…"}</p>
      </StatusBanner>
    ) : phase === "error" ? (
      <StatusBanner
        tone="error"
        title="Update failed"
        className="app-update-banner"
        onDismiss={dismiss}
      >
        <p>{errorMessage}</p>
        {update ? (
          <button
            type="button"
            className="app-update-banner__action"
            onClick={() => {
              setPhase("available");
              setErrorMessage("");
              setDialogOpen(true);
            }}
          >
            Try again
          </button>
        ) : null}
      </StatusBanner>
    ) : null;

  const dialog = (
    <ConfirmDialog
      open={dialogOpen && Boolean(update)}
      title="Install update?"
      message={
        update
          ? `Install version ${update.version} and restart Lab Workflow Desktop?${
              update.body ? `\n\n${update.body}` : ""
            }`
          : ""
      }
      confirmLabel="Install and restart"
      confirmingLabel="Installing…"
      cancelLabel="Later"
      busy={phase === "downloading"}
      onConfirm={() => void installAndRestart()}
      onCancel={() => setDialogOpen(false)}
    />
  );

  return { banner, dialog };
}
