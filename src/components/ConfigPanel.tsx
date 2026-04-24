import type { AppConfig } from "../domain/app";

interface ConfigPanelProps {
  config: AppConfig;
  onChange: (nextConfig: AppConfig) => void;
  onReload: () => void;
  onClose: () => void;
}

export function ConfigPanel({ config, onChange, onReload, onClose }: ConfigPanelProps) {
  const updateField = <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => {
    onChange({ ...config, [key]: value });
  };

  return (
    <section className="panel stack-md">
      <div className="panel__header">
        <div>
          <h2>Manager setup</h2>
          <p>
            These values default to the build-time environment variables and override locally on
            this device.
          </p>
        </div>
        <div className="button-row">
          <button className="button button--secondary" type="button" onClick={onReload}>
            Reload data
          </button>
          <button className="button button--ghost" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      <div className="form-grid">
        <label className="field field--wide">
          <span>Admin spreadsheet ID or URL</span>
          <input
            type="text"
            placeholder="https://docs.google.com/spreadsheets/d/..."
            value={config.adminSpreadsheetId}
            onChange={(event) => updateField("adminSpreadsheetId", event.target.value)}
          />
        </label>

        <label className="field field--wide">
          <span>Google OAuth client ID</span>
          <input
            type="text"
            placeholder="1234567890-abc.apps.googleusercontent.com"
            value={config.googleClientId}
            onChange={(event) => updateField("googleClientId", event.target.value)}
          />
        </label>

        <label className="field field--wide">
          <span>Manager emails</span>
          <textarea
            rows={2}
            placeholder="manager@example.com, lead@example.com"
            value={config.managerEmails}
            onChange={(event) => updateField("managerEmails", event.target.value)}
          />
        </label>

        <label className="field field--wide">
          <span>Employee emails</span>
          <textarea
            rows={3}
            placeholder="employee1@example.com, employee2@example.com"
            value={config.employeeEmails}
            onChange={(event) => updateField("employeeEmails", event.target.value)}
          />
        </label>

        <label className="field">
          <span>Registry sheet</span>
          <input
            type="text"
            value={config.sheetRegistryName}
            onChange={(event) => updateField("sheetRegistryName", event.target.value)}
          />
        </label>

        <label className="field">
          <span>RunLog sheet</span>
          <input
            type="text"
            value={config.runLogSheetName}
            onChange={(event) => updateField("runLogSheetName", event.target.value)}
          />
        </label>

        <label className="field">
          <span>Feedback sheet</span>
          <input
            type="text"
            value={config.feedbackSheetName}
            onChange={(event) => updateField("feedbackSheetName", event.target.value)}
          />
        </label>

        <label className="field">
          <span>Roles sheet</span>
          <input
            type="text"
            value={config.rolesSheetName}
            onChange={(event) => updateField("rolesSheetName", event.target.value)}
          />
        </label>
      </div>
    </section>
  );
}
