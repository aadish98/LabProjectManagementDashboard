/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ADMIN_SPREADSHEET_ID?: string;
  readonly VITE_BACKEND_BASE_URL?: string;
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_GOOGLE_API_KEY?: string;
  readonly VITE_GOOGLE_APP_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

type GooglePickerDocument = Record<string, unknown>;
type GooglePickerResponse = Record<string, unknown>;

declare global {
  interface Window {
    gapi?: {
      load: (
        library: string,
        callbackOrConfig:
          | (() => void)
          | {
              callback?: () => void;
              onerror?: () => void;
              timeout?: number;
              ontimeout?: () => void;
            }
      ) => void;
    };
    google?: {
      picker?: {
        Action: {
          PICKED: string;
          CANCEL: string;
        };
        Document: {
          ID: string;
          NAME: string;
          URL: string;
        };
        DocsView: new (viewId?: string) => {
          setIncludeFolders?: (includeFolders: boolean) => unknown;
          setMimeTypes?: (mimeTypes: string) => unknown;
          setMode?: (mode: string) => unknown;
          setQuery?: (query: string) => unknown;
          setSelectFolderEnabled?: (enabled: boolean) => unknown;
        };
        DocsViewMode: {
          LIST: string;
        };
        Feature: {
          MULTISELECT_ENABLED: string;
          NAV_HIDDEN: string;
        };
        PickerBuilder: new () => {
          addView: (view: unknown) => unknown;
          enableFeature: (feature: string) => unknown;
          setAppId: (appId: string) => unknown;
          setCallback: (callback: (data: GooglePickerResponse) => void) => unknown;
          setDeveloperKey: (developerKey: string) => unknown;
          setOAuthToken: (token: string) => unknown;
          setOrigin?: (origin: string) => unknown;
          setTitle?: (title: string) => unknown;
          build: () => {
            setVisible: (visible: boolean) => void;
          };
        };
        Response: {
          ACTION: string;
          DOCUMENTS: string;
        };
        ViewId: {
          SPREADSHEETS: string;
        };
      };
    };
  }
}

export {};
