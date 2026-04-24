/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ADMIN_SPREADSHEET_ID?: string;
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_MANAGER_EMAILS?: string;
  readonly VITE_EMPLOYEE_EMAILS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

type GoogleTokenResponse = {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
  error?: string;
};

type GoogleTokenClient = {
  requestAccessToken: (options?: { prompt?: string }) => void;
};

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: GoogleTokenResponse) => void;
            error_callback?: (error: { type: string }) => void;
          }) => GoogleTokenClient;
        };
      };
    };
  }
}

export {};
