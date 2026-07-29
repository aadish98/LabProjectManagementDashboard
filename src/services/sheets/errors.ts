export type SheetsErrorCode =
  | "auth"
  | "network"
  | "forbidden"
  | "pickerGrant"
  | "notFound"
  | "schema"
  | "conflict"
  | "unknown";

export interface SheetsErrorContext {
  operation?: string;
  spreadsheetId?: string;
  sheetName?: string;
  range?: string;
  labMember?: string;
  taskId?: string;
  memberId?: string;
  expectedRevision?: number;
  currentRevision?: number;
  currentRecord?: Record<string, unknown>;
  url?: string;
}

export class SheetsError extends Error {
  readonly code: SheetsErrorCode;
  readonly status?: number;
  readonly context: SheetsErrorContext;
  readonly apiStatus?: string;
  readonly apiReason?: string;

  constructor(
    code: SheetsErrorCode,
    message: string,
    options: {
      status?: number;
      context?: SheetsErrorContext;
      apiStatus?: string;
      apiReason?: string;
      cause?: unknown;
    } = {}
  ) {
    super(message);
    this.name = "SheetsError";
    this.code = code;
    this.status = options.status;
    this.context = options.context ?? {};
    this.apiStatus = options.apiStatus;
    this.apiReason = options.apiReason;
    if (options.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

export class GoogleSheetsAuthError extends SheetsError {
  constructor(context: SheetsErrorContext = {}, cause?: unknown) {
    super("auth", "Google needs a fresh sign-in to continue.", {
      status: 401,
      context,
      cause
    });
    this.name = "GoogleSheetsAuthError";
  }
}

export class SheetRevisionConflictError extends SheetsError {
  readonly conflictCode = "REVISION_CONFLICT" as const;

  constructor(message: string, context: SheetsErrorContext) {
    super("conflict", message, { status: 409, context });
    this.name = "SheetRevisionConflictError";
  }
}

export interface MissingSpreadsheetAccess {
  spreadsheetId: string;
  taskLogUrl: string;
  labMember?: string;
  activeSheetName?: string;
}

export class GoogleSheetsFileAccessError extends SheetsError {
  missingSpreadsheets: MissingSpreadsheetAccess[];

  constructor(
    missingSpreadsheets: MissingSpreadsheetAccess[],
    message?: string
  ) {
    const count = missingSpreadsheets.length;
    const text =
      message ??
      (count === 1
        ? "Choose this spreadsheet from Google Drive so the app can access it."
        : `Choose ${count} spreadsheets from Google Drive so the app can access them.`);
    super("pickerGrant", text, {
      status: 403,
      context: {
        spreadsheetId: missingSpreadsheets[0]?.spreadsheetId,
        labMember: missingSpreadsheets[0]?.labMember
      }
    });
    this.name = "GoogleSheetsFileAccessError";
    this.missingSpreadsheets = missingSpreadsheets;
  }
}

export class AdminWorkbookSchemaError extends SheetsError {
  missingTabs: string[];

  constructor(missingTabs: string[]) {
    const list = missingTabs.join(", ");
    super("schema", `Admin workbook is missing required setup data: ${list}.`, {
      context: { operation: "verifyAdminWorkbook" }
    });
    this.name = "AdminWorkbookSchemaError";
    this.missingTabs = missingTabs;
  }
}

export function isGoogleSheetsAuthError(
  error: unknown
): error is GoogleSheetsAuthError {
  return error instanceof GoogleSheetsAuthError;
}

export function isSheetsError(error: unknown): error is SheetsError {
  return error instanceof SheetsError;
}

export function isGoogleSheetsFileAccessError(
  error: unknown
): error is GoogleSheetsFileAccessError {
  return error instanceof GoogleSheetsFileAccessError;
}

export function isAdminWorkbookSchemaError(
  error: unknown
): error is AdminWorkbookSchemaError {
  return error instanceof AdminWorkbookSchemaError;
}

export function isStaleTabError(error: unknown): boolean {
  if (error instanceof SheetsError) {
    if (error.code !== "notFound" || !error.context.sheetName) return false;
    const message = error.message.toLowerCase();
    return (
      message.includes("unable to parse range") ||
      message.includes("range not found") ||
      (message.includes("tab") && message.includes("not found"))
    );
  }
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("unable to parse range") ||
    message.includes("requested entity was not found") ||
    message.includes("range not found")
  );
}

export function sheetsErrorMessage(error: unknown): string {
  if (!(error instanceof SheetsError)) {
    return error instanceof Error ? error.message : "Unknown Google Sheets error.";
  }
  const details = [
    error.status ? `HTTP ${error.status}` : "",
    error.context.operation ? `operation ${error.context.operation}` : "",
    error.context.labMember ? `member ${error.context.labMember}` : "",
    error.context.sheetName ? `tab ${error.context.sheetName}` : ""
  ].filter(Boolean);
  return details.length > 0
    ? `${error.message} (${details.join(", ")})`
    : error.message;
}

export function sheetsErrorStatusFields(error: unknown): {
  errorCode?: string;
  httpStatus?: number;
  operation?: string;
} {
  if (!(error instanceof SheetsError)) return {};
  return {
    errorCode: error.code,
    httpStatus: error.status,
    operation: error.context.operation
  };
}
