import { useEffect, useState } from "react";
import type { UserSession } from "../../domain/app";
import {
  readEmployeeProfileCache,
  writeEmployeeProfileCache
} from "../../services/cache";
import { extractIdFromUrl } from "../../services/sheets/helpers";
import {
  readEmployeeProfile,
  writeEmployeeProfile
} from "../../services/sheets/profile";
import { processProfileImageFile } from "../../utils/profileImage";
import type { ProfileChoice } from "./ProfileStep";

interface EmployeeProfileOptions {
  session: UserSession;
  taskLogUrl: string;
  activeSheetName: string;
  fallbackSheetName?: string;
}

export function useEmployeeProfile({
  session,
  taskLogUrl,
  activeSheetName,
  fallbackSheetName = ""
}: EmployeeProfileOptions) {
  const [choice, setChoice] = useState<ProfileChoice>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const spreadsheetId = extractIdFromUrl(taskLogUrl);
    if (!spreadsheetId || !session.accessToken) {
      setChoice({ kind: "noPhoto" });
      return;
    }
    let cancelled = false;
    const cached = readEmployeeProfileCache(session.email, spreadsheetId);
    if (cached?.profilePictureDataUrl) {
      setChoice({
        kind: "existing",
        dataUrl: cached.profilePictureDataUrl,
        updatedAt: cached.updatedAt
      });
    }
    readEmployeeProfile(taskLogUrl, session.accessToken)
      .then((profile) => {
        if (cancelled) return;
        if (profile?.profilePictureDataUrl) {
          setChoice({
            kind: "existing",
            dataUrl: profile.profilePictureDataUrl,
            updatedAt: profile.updatedAt
          });
        } else {
          setChoice({ kind: "noPhoto" });
        }
      })
      .catch(() => {
        if (!cancelled && !cached) setChoice({ kind: "noPhoto" });
      });
    return () => {
      cancelled = true;
    };
  }, [session.accessToken, session.email, taskLogUrl]);

  const saveFile = async (file: File) => {
    if (!session.accessToken || !taskLogUrl) return;
    setBusy(true);
    setError("");
    try {
      const processed = await processProfileImageFile(file);
      const written = await writeEmployeeProfile(
        {
          taskLogUrl,
          activeSheetName: activeSheetName || fallbackSheetName
        },
        session,
        {
          displayName: session.name || session.email,
          profilePictureDataUrl: processed.dataUrl,
          updatedAt: new Date().toISOString()
        }
      );
      const spreadsheetId = extractIdFromUrl(taskLogUrl);
      if (spreadsheetId) {
        writeEmployeeProfileCache(session.email, spreadsheetId, {
          profilePictureDataUrl: written.profilePictureDataUrl,
          displayName: written.displayName,
          updatedAt: written.updatedAt,
          cachedAt: new Date().toISOString()
        });
      }
      setChoice({
        kind: "existing",
        dataUrl: written.profilePictureDataUrl,
        updatedAt: written.updatedAt
      });
    } catch (profileWriteError) {
      setError(
        `${messageFor(profileWriteError)} Profile changes can be retried independently; onboarding is not blocked.`
      );
    } finally {
      setBusy(false);
    }
  };

  const useInitials = async () => {
    if (!session.accessToken || !taskLogUrl) {
      setChoice({ kind: "noPhoto" });
      return;
    }
    setBusy(true);
    setError("");
    try {
      await writeEmployeeProfile(
        {
          taskLogUrl,
          activeSheetName: activeSheetName || fallbackSheetName
        },
        session,
        {
          displayName: session.name || session.email,
          profilePictureDataUrl: "",
          updatedAt: new Date().toISOString()
        }
      );
      const spreadsheetId = extractIdFromUrl(taskLogUrl);
      if (spreadsheetId) {
        writeEmployeeProfileCache(session.email, spreadsheetId, null);
      }
      setChoice({ kind: "noPhoto" });
    } catch (profileDeleteError) {
      setError(
        `${messageFor(profileDeleteError)} Profile deletion can be retried independently.`
      );
    } finally {
      setBusy(false);
    }
  };

  return {
    choice,
    busy,
    error,
    clearError: () => setError(""),
    saveFile,
    useInitials
  };
}

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : "The operation failed.";
}
