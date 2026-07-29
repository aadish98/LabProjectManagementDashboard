export interface OAuthRedirectRequest {
  authorizationUrl: string;
  port: number;
  timeoutMs: number;
}

export interface DesktopAuthPlatform {
  waitForOAuthRedirect(request: OAuthRedirectRequest): Promise<string>;
}

export interface PickedSpreadsheet {
  id: string;
  name: string;
  url: string;
}

export interface SpreadsheetPickerOptions {
  accessToken: string;
  apiKey: string;
  appId: string;
  multiselect?: boolean;
  query?: string;
  title?: string;
}

export interface DesktopPickerPlatform {
  pickSpreadsheets(options: SpreadsheetPickerOptions): Promise<PickedSpreadsheet[]>;
}

export interface SessionSecretVault {
  store(account: string, secret: string): Promise<void>;
  load(account: string): Promise<string | null>;
  delete(account: string): Promise<void>;
}

export class SessionSecretVaultError extends Error {
  readonly operation: "store" | "load" | "delete";

  constructor(operation: SessionSecretVaultError["operation"], cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`Credential vault ${operation} failed${detail ? `: ${detail}` : "."}`);
    this.name = "SessionSecretVaultError";
    this.operation = operation;
  }
}

export type UpdateDownloadProgress =
  | { event: "Started"; contentLength?: number }
  | { event: "Progress"; chunkLength: number }
  | { event: "Finished" };

export interface AvailableAppUpdate {
  version: string;
  currentVersion: string;
  body?: string;
  downloadAndInstall(
    onProgress?: (progress: UpdateDownloadProgress) => void
  ): Promise<void>;
  close(): Promise<void>;
}

export interface DesktopUpdaterPlatform {
  isSupported(): boolean;
  check(): Promise<AvailableAppUpdate | null>;
  relaunch(): Promise<void>;
}
