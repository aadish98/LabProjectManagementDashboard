import { useState, type FormEvent } from "react";
import type { AppConfig, UserSession } from "../domain/app";
import { openSpreadsheetPicker } from "../services/googleDrivePicker";
import { ErrorSummary, FormField } from "./ui";

interface ConfigPanelProps {
  config: AppConfig;
  session?: UserSession | null;
  onChange: (nextConfig: AppConfig) => void;
  onClose: () => void;
}

/**
 * Bootstrap setup. Only contains values that have to live on the device
 * because the app needs them before it can authenticate with Google or
 * open the admin workbook:
 *
 * - Google OAuth client ID
 * - Google Picker API key
 * - Google Picker app ID / project number
 * - Admin workbook URL/ID
 *
 * Manager and employee access is intentionally not edited here. The
 * manager-facing Team Setup panel writes the Google Sheet backend for
 * routine roster and access changes.
 */
const CONFIG_FIELDS: Array<{ key: keyof AppConfig; id: string; label: string }> = [
  { key: "adminSpreadsheetId", id: "config-admin-workbook", label: "Admin workbook" },
  { key: "googleClientId", id: "config-google-client-id", label: "Google OAuth client ID" },
  { key: "googleApiKey", id: "config-google-api-key", label: "Google Picker API key" },
  { key: "googleAppId", id: "config-google-app-id", label: "Google Picker app ID / project number" }
];

export function ConfigPanel({ config, session, onChange, onClose }: ConfigPanelProps) {
  const [pickingAdmin, setPickingAdmin] = useState(false);
  const [pickerError, setPickerError] = useState("");
  const [showValidation, setShowValidation] = useState(false);
  const [pendingAdminSwitch, setPendingAdminSwitch] = useState<{
    url: string;
    name: string;
  } | null>(null);

  const updateField = <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => {
    onChange({ ...config, [key]: value });
  };

  const validationErrors = CONFIG_FIELDS.filter(({ key }) => !config[key].trim()).map(
    ({ id, label }) => ({ fieldId: id, label, message: `${label} is required.` })
  );

  const handleClose = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (validationErrors.length > 0) {
      setShowValidation(true);
      queueMicrotask(() =>
        document.getElementById(validationErrors[0].fieldId)?.focus()
      );
      return;
    }
    onClose();
  };

  const handlePickAdminSpreadsheet = async () => {
    setPickerError("");
    if (!session?.accessToken) {
      setPickerError("Sign in with Google before choosing the Admin workbook.");
      return;
    }

    setPickingAdmin(true);
    try {
      const [picked] = await openSpreadsheetPicker({
        accessToken: session.accessToken,
        apiKey: config.googleApiKey,
        appId: config.googleAppId,
        title: "Choose the Admin workbook"
      });
      if (picked) {
        if (
          config.adminSpreadsheetId.trim() &&
          picked.url !== config.adminSpreadsheetId
        ) {
          setPendingAdminSwitch({
            url: picked.url,
            name: picked.name || "the selected workbook"
          });
        } else {
          updateField("adminSpreadsheetId", picked.url);
        }
      }
    } catch (error) {
      setPickerError(error instanceof Error ? error.message : "Could not open Drive Picker.");
    } finally {
      setPickingAdmin(false);
    }
  };

  return (
    <section className="panel stack-md">
      <div className="panel__header">
        <div>
          <h2>Connection setup</h2>
          <p>
            These values connect the app to Google and the Admin workbook. Members and Access roles
            are managed from <strong>Team setup</strong>.
          </p>
        </div>
      </div>

      <form className="stack-md" onSubmit={handleClose} noValidate>
        <ErrorSummary
          title="Complete connection setup"
          errors={showValidation ? validationErrors : []}
        />
        <div className="form-grid">
          <FormField
            id="config-admin-workbook"
            label="Admin workbook"
            error={
              pickerError ||
              (showValidation && !config.adminSpreadsheetId.trim()
                ? "Admin workbook is required."
                : "")
            }
            className="field field--wide"
            required
          >
            {({ required: _required, ...controlProps }) => (
              <article
                className={`source-card${config.adminSpreadsheetId ? " source-card--selected" : " source-card--empty"}`}
              >
                <div className="source-card__row">
                  <div className="source-card__body">
                    <p className="source-card__eyebrow">Admin workbook</p>
                    <h3 className="source-card__title">
                      {config.adminSpreadsheetId
                        ? "Admin workbook selected"
                        : "No Admin workbook selected"}
                    </h3>
                    <p className="source-card__detail">
                      {config.adminSpreadsheetId ||
                        "Choose the shared Google Sheet that stores the central roster and configuration."}
                    </p>
                  </div>
                  <button
                    {...controlProps}
                    aria-label={
                      config.adminSpreadsheetId
                        ? "Change Admin workbook"
                        : "Choose from Drive"
                    }
                    className="button button--secondary source-card__action"
                    type="button"
                    onClick={() => void handlePickAdminSpreadsheet()}
                    disabled={pickingAdmin}
                  >
                    {pickingAdmin
                      ? "Opening Drive..."
                      : config.adminSpreadsheetId
                        ? "Change Admin workbook"
                        : "Choose from Drive"}
                  </button>
                </div>
              </article>
            )}
          </FormField>
          {pendingAdminSwitch ? (
            <div className="callout callout--warning stack-xs field--wide" role="alert">
              <strong>Change the Admin workbook?</strong>
              <p>
                Switching to {pendingAdminSwitch.name} changes the source used for access and
                manager data. Your current configuration remains unchanged until you confirm.
              </p>
              <div className="button-row">
                <button
                  className="button button--danger"
                  type="button"
                  onClick={() => {
                    updateField("adminSpreadsheetId", pendingAdminSwitch.url);
                    setPendingAdminSwitch(null);
                  }}
                >
                  Confirm switch
                </button>
                <button
                  className="button button--secondary"
                  type="button"
                  onClick={() => setPendingAdminSwitch(null)}
                >
                  Keep current workbook
                </button>
              </div>
            </div>
          ) : null}
          <FormField
            id="config-google-client-id"
            label="Google OAuth client ID"
            error={
              showValidation && !config.googleClientId.trim()
                ? "Google OAuth client ID is required."
                : ""
            }
            className="field field--wide"
            required
          >
            <input
              type="text"
              placeholder="1234567890-abc.apps.googleusercontent.com"
              value={config.googleClientId}
              onChange={(event) => updateField("googleClientId", event.target.value)}
            />
          </FormField>
          <FormField
            id="config-google-api-key"
            label="Google Picker API key"
            error={
              showValidation && !config.googleApiKey.trim()
                ? "Google Picker API key is required."
                : ""
            }
            className="field field--wide"
            required
          >
            <input
              type="text"
              placeholder="AIza..."
              value={config.googleApiKey}
              onChange={(event) => updateField("googleApiKey", event.target.value)}
            />
          </FormField>
          <FormField
            id="config-google-app-id"
            label="Google Picker app ID / project number"
            error={
              showValidation && !config.googleAppId.trim()
                ? "Google Picker app ID / project number is required."
                : ""
            }
            className="field field--wide"
            required
          >
            <input
              type="text"
              placeholder="1234567890"
              value={config.googleAppId}
              onChange={(event) => updateField("googleAppId", event.target.value)}
            />
          </FormField>
        </div>
        <div className="button-row">
          <button className="button button--primary" type="submit">
            Save and close
          </button>
        </div>
      </form>
    </section>
  );
}
