import type {
  EmployeeSheetPrefs,
  UserSession
} from "../../domain/app";
import type { LabMemberProfilePicture } from "../../domain/experiment";
import type { EmployeeProfile } from "../../domain/people";
import { PROFILE_PICTURE_DATA_URL_BYTE_LIMIT } from "../../domain/people";
import {
  readManagerProfileCache,
  writeManagerProfileCache,
  type ManagerProfileCacheEntry
} from "../cache";
import {
  getValuesForSheet,
  requestSheets,
  SHEETS_API_ROOT
} from "./client";
import {
  GoogleSheetsAuthError,
  isGoogleSheetsAuthError
} from "./errors";
import { encodeSheetRange, extractIdFromUrl } from "./helpers";
import { fetchSpreadsheetMetadata } from "./metadata";

export const PROFILE_TAB_NAME = "Profile";

const PROFILE_HEADERS: ReadonlyArray<string> = ["Field", "Value"];

const PROFILE_FIELD_LABELS = {
  displayName: "Display Name",
  pictureDataUrl: "Profile Picture Data URL",
  updatedAt: "Updated At"
} as const;

interface ProfileTabResolution {
  spreadsheetId: string;
  spreadsheetTitle: string;
  sheetId: number;
  title: string;
  index: number;
  created: boolean;
  wasMoved: boolean;
}

async function ensureProfileSheetLast(
  spreadsheetIdOrUrl: string,
  accessToken: string
): Promise<ProfileTabResolution> {
  const metadata = await fetchSpreadsheetMetadata(
    spreadsheetIdOrUrl,
    accessToken
  );
  const spreadsheetId = metadata.spreadsheetId;
  const totalTabs = metadata.sheets.length;
  const existingIndex = metadata.sheets.findIndex(
    (sheet) =>
      sheet.title.trim().toLowerCase() ===
      PROFILE_TAB_NAME.toLowerCase()
  );

  if (existingIndex === -1) {
    const response = await requestSheets<{
      replies?: Array<{
        addSheet?: {
          properties?: {
            sheetId?: number;
            title?: string;
            index?: number;
          };
        };
      }>;
    }>(`${SHEETS_API_ROOT}/${spreadsheetId}:batchUpdate`, accessToken, {
      method: "POST",
      body: JSON.stringify({
        requests: [
          {
            addSheet: {
              properties: { title: PROFILE_TAB_NAME, index: totalTabs }
            }
          }
        ]
      })
    });
    const created = response.replies?.[0]?.addSheet?.properties;
    if (!created || created.sheetId === undefined || !created.title) {
      throw new Error(`Could not create the "${PROFILE_TAB_NAME}" tab.`);
    }
    return {
      spreadsheetId,
      spreadsheetTitle: metadata.spreadsheetTitle,
      sheetId: created.sheetId,
      title: created.title,
      index: created.index ?? totalTabs,
      created: true,
      wasMoved: false
    };
  }

  const existing = metadata.sheets[existingIndex];
  if (existingIndex === totalTabs - 1) {
    return {
      spreadsheetId,
      spreadsheetTitle: metadata.spreadsheetTitle,
      sheetId: existing.sheetId,
      title: existing.title,
      index: existingIndex,
      created: false,
      wasMoved: false
    };
  }

  await requestSheets(
    `${SHEETS_API_ROOT}/${spreadsheetId}:batchUpdate`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({
        requests: [
          {
            updateSheetProperties: {
              properties: {
                sheetId: existing.sheetId,
                index: totalTabs
              },
              fields: "index"
            }
          }
        ]
      })
    }
  );

  return {
    spreadsheetId,
    spreadsheetTitle: metadata.spreadsheetTitle,
    sheetId: existing.sheetId,
    title: existing.title,
    index: totalTabs - 1,
    created: false,
    wasMoved: true
  };
}

export function profileRowsFromValues(
  rows: string[][]
): Partial<EmployeeProfile> {
  const map = new Map<string, string>();
  for (const row of rows) {
    if (!row || row.length === 0) continue;
    const field = String(row[0] ?? "").trim();
    const value = row.length > 1 ? String(row[1] ?? "") : "";
    if (field) map.set(field.toLowerCase(), value);
  }
  return {
    displayName: (
      map.get(PROFILE_FIELD_LABELS.displayName.toLowerCase()) ?? ""
    ).trim(),
    profilePictureDataUrl: (
      map.get(PROFILE_FIELD_LABELS.pictureDataUrl.toLowerCase()) ?? ""
    ).trim(),
    updatedAt: (
      map.get(PROFILE_FIELD_LABELS.updatedAt.toLowerCase()) ?? ""
    ).trim()
  };
}

export async function readEmployeeProfile(
  spreadsheetIdOrUrl: string,
  accessToken: string
): Promise<EmployeeProfile | null> {
  const spreadsheetId = extractIdFromUrl(spreadsheetIdOrUrl);
  if (!spreadsheetId) return null;

  let rows: string[][];
  try {
    rows = await getValuesForSheet(
      spreadsheetId,
      PROFILE_TAB_NAME,
      "A1:B4",
      accessToken
    );
  } catch (error) {
    if (isGoogleSheetsAuthError(error)) throw error;
    return null;
  }

  const parsed = profileRowsFromValues(rows);
  const displayName = parsed.displayName ?? "";
  const profilePictureDataUrl = parsed.profilePictureDataUrl ?? "";
  const updatedAt = parsed.updatedAt ?? "";
  if (!displayName && !profilePictureDataUrl && !updatedAt) return null;
  return { displayName, profilePictureDataUrl, updatedAt };
}

export async function writeEmployeeProfile(
  prefs: EmployeeSheetPrefs,
  session: UserSession,
  profile: EmployeeProfile
): Promise<EmployeeProfile> {
  if (!session.accessToken) throw new GoogleSheetsAuthError();

  const dataUrl = profile.profilePictureDataUrl ?? "";
  if (dataUrl) {
    const bytes = new TextEncoder().encode(dataUrl).byteLength;
    if (bytes > PROFILE_PICTURE_DATA_URL_BYTE_LIMIT) {
      throw new Error(
        `Profile picture is too large to store in the Profile tab (${bytes} bytes; limit ${PROFILE_PICTURE_DATA_URL_BYTE_LIMIT} bytes).`
      );
    }
  }

  const updatedAt =
    (profile.updatedAt ?? "").trim() || new Date().toISOString();
  const tab = await ensureProfileSheetLast(
    prefs.taskLogUrl,
    session.accessToken
  );
  const rows = [
    [PROFILE_HEADERS[0], PROFILE_HEADERS[1]],
    [PROFILE_FIELD_LABELS.displayName, profile.displayName ?? ""],
    [PROFILE_FIELD_LABELS.pictureDataUrl, dataUrl],
    [PROFILE_FIELD_LABELS.updatedAt, updatedAt]
  ];

  await requestSheets(
    `${SHEETS_API_ROOT}/${tab.spreadsheetId}/values/${encodeSheetRange(
      tab.title,
      "A1:B4"
    )}?valueInputOption=RAW`,
    session.accessToken,
    {
      method: "PUT",
      body: JSON.stringify({ values: rows })
    }
  );

  return {
    displayName: profile.displayName ?? "",
    profilePictureDataUrl: dataUrl,
    updatedAt
  };
}

export async function readEmployeeProfileForManager(
  managerEmail: string,
  labMember: string,
  taskLogUrl: string,
  accessToken: string
): Promise<LabMemberProfilePicture> {
  const spreadsheetId = extractIdFromUrl(taskLogUrl);
  if (!spreadsheetId) return { labMember, source: "missing" };

  const cached = readManagerProfileCache(managerEmail, spreadsheetId);
  try {
    const profile = await readEmployeeProfile(taskLogUrl, accessToken);
    if (!profile || !profile.profilePictureDataUrl) {
      return {
        labMember,
        profilePictureDataUrl: undefined,
        updatedAt: profile?.updatedAt,
        source: "missing"
      };
    }

    if (
      !cached ||
      cached.profilePictureDataUrl !== profile.profilePictureDataUrl ||
      cached.updatedAt !== profile.updatedAt
    ) {
      const next: ManagerProfileCacheEntry = {
        labMember,
        profilePictureDataUrl: profile.profilePictureDataUrl,
        updatedAt: profile.updatedAt,
        cachedAt: new Date().toISOString()
      };
      writeManagerProfileCache(managerEmail, spreadsheetId, next);
    }
    return {
      labMember,
      profilePictureDataUrl: profile.profilePictureDataUrl,
      updatedAt: profile.updatedAt,
      source: "live"
    };
  } catch (error) {
    if (isGoogleSheetsAuthError(error)) throw error;
    if (cached) {
      return {
        labMember,
        profilePictureDataUrl: cached.profilePictureDataUrl,
        updatedAt: cached.updatedAt,
        source: "cache"
      };
    }
    return { labMember, source: "error" };
  }
}
