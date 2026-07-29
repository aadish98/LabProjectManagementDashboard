import { ApiError } from "../http/errors.js";

export interface EmptyRolesVerifier {
  verify(accessToken: string, spreadsheetId: string): Promise<void>;
}

export class GoogleSheetsEmptyRolesVerifier implements EmptyRolesVerifier {
  async verify(accessToken: string, spreadsheetId: string): Promise<void> {
    const range = encodeURIComponent("'Roles'!A:Z");
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${range}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const text = await response.text();
    if (!response.ok) throw sheetsVerificationError(response.status, text);

    const body = parseJson(text) as { values?: unknown[][] };
    const rows = body.values ?? [];
    const headers = (rows[0] ?? []).map((value) => normalizeHeader(String(value ?? "")));
    const required = ["email", "role", "labmember"];
    if (!required.every((header, index) => headers[index] === header)) {
      throw new ApiError({
        status: 409,
        code: "ROLES_SHEET_NOT_CANONICAL",
        message: "The Roles sheet does not have the canonical Email, Role, Lab Member headers.",
        action: "Repair the Roles sheet headers, then restart bootstrap verification."
      });
    }
    const hasRoleData = rows
      .slice(1)
      .some((row) => row.some((value) => String(value ?? "").trim().length > 0));
    if (hasRoleData) {
      throw new ApiError({
        status: 409,
        code: "LAB_ALREADY_INITIALIZED",
        message: "The canonical Roles sheet is not empty.",
        action: "Do not bootstrap a new lab. Migrate or use the existing lab authorization record."
      });
    }
  }
}

function sheetsVerificationError(status: number, body: string): ApiError {
  const lower = body.toLowerCase();
  if (status === 401) {
    return new ApiError({
      status: 401,
      code: "GOOGLE_ACCESS_TOKEN_EXPIRED",
      message: "Google rejected the delegated access token used for bootstrap verification.",
      action: "Reconnect Google and retry with a fresh short-lived token."
    });
  }
  if (status === 403) {
    return new ApiError({
      status: 403,
      code: "ADMIN_WORKBOOK_FORBIDDEN",
      message: "The signed-in account cannot read the admin workbook's Roles sheet.",
      action: "Use the workbook owner account and select the exact admin workbook first."
    });
  }
  if (status === 404 || lower.includes("unable to parse range")) {
    return new ApiError({
      status: 409,
      code: "ROLES_SHEET_MISSING",
      message: "The admin workbook does not contain a readable canonical Roles sheet.",
      action: "Create or repair the Roles sheet before claiming the lab."
    });
  }
  return new ApiError({
    status: 502,
    code: "ROLES_VERIFICATION_FAILED",
    message: "The service could not verify that the Roles sheet is empty.",
    action: "Retry with a fresh token; if it persists, verify Sheets API access.",
    retryable: status >= 500
  });
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseJson(text: string): unknown {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}
