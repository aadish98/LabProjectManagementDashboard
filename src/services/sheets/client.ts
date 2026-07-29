import {
  GoogleSheetsAuthError,
  GoogleSheetsFileAccessError,
  isGoogleSheetsAuthError,
  isSheetsError,
  SheetsError,
  type SheetsErrorContext
} from "./errors";
import {
  encodeSheetRange,
  extractSpreadsheetIdFromApiUrl
} from "./helpers";

export const SHEETS_API_ROOT =
  "https://sheets.googleapis.com/v4/spreadsheets";

export const GOOGLE_WORKSPACE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/drive.file"
].join(" ");

export type SheetsValueResponse = {
  values?: string[][];
};

function parseGoogleError(body: string): {
  message: string;
  status?: string;
  reason?: string;
} {
  try {
    const parsed = JSON.parse(body) as {
      error?: {
        message?: string;
        status?: string;
        errors?: Array<{ reason?: string }>;
        details?: Array<{ reason?: string }>;
      };
    };
    return {
      message: parsed.error?.message?.trim() || body,
      status: parsed.error?.status,
      reason:
        parsed.error?.errors?.find((entry) => entry.reason)?.reason ??
        parsed.error?.details?.find((entry) => entry.reason)?.reason
    };
  } catch {
    return { message: body };
  }
}

function hasPickerGrantEvidence(
  apiReason: string | undefined,
  message: string
): boolean {
  const evidence = `${apiReason ?? ""} ${message}`.toLowerCase();
  return (
    evidence.includes("appnotauthorizedtofile") ||
    evidence.includes("not been granted access to this file") ||
    evidence.includes("opened or created by this app")
  );
}

export async function requestSheets<T>(
  url: string,
  accessToken: string,
  init?: RequestInit,
  context: SheetsErrorContext = {}
): Promise<T> {
  const requestContext: SheetsErrorContext = {
    spreadsheetId: extractSpreadsheetIdFromApiUrl(url),
    url,
    ...context
  };
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {})
      }
    });
  } catch (error) {
    throw new SheetsError(
      "network",
      "Could not reach Google Sheets. Check the network connection and try again.",
      { context: requestContext, cause: error }
    );
  }

  if (!response.ok) {
    const body = await response.text();
    const apiError = parseGoogleError(body);
    const options = {
      status: response.status,
      context: requestContext,
      apiStatus: apiError.status,
      apiReason: apiError.reason
    };
    if (
      response.status === 401 ||
      body.includes('"status": "UNAUTHENTICATED"') ||
      body.toLowerCase().includes("invalid authentication credentials")
    ) {
      throw new GoogleSheetsAuthError(requestContext);
    }
    if (
      response.status === 403 &&
      hasPickerGrantEvidence(apiError.reason, apiError.message)
    ) {
      const spreadsheetId = requestContext.spreadsheetId ?? "";
      throw new GoogleSheetsFileAccessError([
        { spreadsheetId, taskLogUrl: spreadsheetId }
      ]);
    }
    if (response.status === 403) {
      throw new SheetsError(
        "forbidden",
        apiError.message || "This account is not allowed to access this spreadsheet.",
        options
      );
    }
    if (response.status === 404) {
      throw new SheetsError(
        "notFound",
        apiError.message || "The requested spreadsheet, tab, or range was not found.",
        options
      );
    }
    if (response.status === 409 || response.status === 412) {
      throw new SheetsError(
        "conflict",
        apiError.message ||
          "The spreadsheet changed while this operation was in progress.",
        options
      );
    }
    throw new SheetsError(
      "unknown",
      apiError.message || `Sheets request failed with status ${response.status}`,
      options
    );
  }

  if (response.status === 204) {
    return {} as T;
  }

  return (await response.json()) as T;
}

export async function getValuesForSheet(
  spreadsheetId: string,
  sheetName: string,
  range: string,
  accessToken: string
): Promise<string[][]> {
  const response = await requestSheets<SheetsValueResponse>(
    `${SHEETS_API_ROOT}/${spreadsheetId}/values/${encodeSheetRange(
      sheetName,
      range
    )}`,
    accessToken,
    undefined,
    {
      operation: "readValues",
      spreadsheetId,
      sheetName,
      range
    }
  );
  return response.values ?? [];
}

export async function getOptionalValuesForSheet(
  spreadsheetId: string,
  sheetName: string,
  range: string,
  accessToken: string
): Promise<string[][]> {
  try {
    return await getValuesForSheet(
      spreadsheetId,
      sheetName,
      range,
      accessToken
    );
  } catch (error) {
    if (
      isGoogleSheetsAuthError(error) ||
      (isSheetsError(error) &&
        ["network", "forbidden", "pickerGrant", "conflict"].includes(error.code))
    ) {
      throw error;
    }
    return [];
  }
}
