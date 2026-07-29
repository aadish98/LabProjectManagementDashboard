import { FormField } from "../../components/ui";

interface SheetOption {
  sheetId: number;
  title: string;
}

interface WorkbookTabPickerProps {
  taskLogUrl: string;
  spreadsheetTitle: string;
  activeSheetName: string;
  sheetOptions: SheetOption[];
  picking: boolean;
  loadingSheets: boolean;
  validating: boolean;
  onPickSpreadsheet: () => void;
  onTabChange: (title: string) => void;
}

export function WorkbookTabPicker({
  taskLogUrl,
  spreadsheetTitle,
  activeSheetName,
  sheetOptions,
  picking,
  loadingSheets,
  validating,
  onPickSpreadsheet,
  onTabChange
}: WorkbookTabPickerProps) {
  const hasSelectedSpreadsheet = !!taskLogUrl.trim();
  const hasSelectedSheet = !!activeSheetName.trim();
  const fileCardModifier = hasSelectedSpreadsheet
    ? " source-card--selected"
    : " source-card--empty";
  const tabCardModifier = hasSelectedSheet
    ? " source-card--selected"
    : hasSelectedSpreadsheet
      ? " source-card--needs"
      : " source-card--empty";

  return (
    <>
      <article className={`source-card${fileCardModifier}`}>
        <div className="source-card__row">
          <div className="source-card__body">
            <p className="source-card__eyebrow">Step 1 — Task-log workbook</p>
            <h2 className="source-card__title">
              {hasSelectedSpreadsheet
                ? spreadsheetTitle || "Selected spreadsheet"
                : "No spreadsheet selected"}
            </h2>
            <p className="source-card__detail">
              {hasSelectedSpreadsheet
                ? taskLogUrl
                : "Open Drive in your browser to pick the file. The picker opens in a new tab."}
            </p>
          </div>
          <button
            className="button button--secondary source-card__action"
            type="button"
            onClick={onPickSpreadsheet}
            disabled={picking || validating}
          >
            {picking
              ? "Opening Drive..."
              : hasSelectedSpreadsheet
                ? "Change file"
                : "Choose from Drive"}
          </button>
        </div>
      </article>

      <article className={`source-card${tabCardModifier}`}>
        <div className="source-card__body">
          <p className="source-card__eyebrow">Step 2 — Active task tab</p>
          <h2 className="source-card__title">
            {hasSelectedSheet
              ? activeSheetName
              : hasSelectedSpreadsheet
                ? "Tab not selected yet"
                : "Pick a workbook first"}
          </h2>
          <p className="source-card__detail">
            {hasSelectedSheet
              ? "This tab will be loaded for you. Open the menu below to change it."
              : hasSelectedSpreadsheet
                ? "Open the menu and choose the correct tab. There is no default."
                : "After you pick the spreadsheet, the tab list will appear here."}
          </p>
        </div>
        <FormField
          id="onboarding-active-task-tab"
          label="Active task tab"
          className="field source-card__field"
          required
        >
          <select
            value={activeSheetName}
            onChange={(event) => onTabChange(event.target.value)}
            disabled={sheetOptions.length === 0 || loadingSheets || validating}
          >
            <option value="">
              {loadingSheets
                ? "Loading tabs..."
                : hasSelectedSpreadsheet
                  ? "— Choose a tab —"
                  : "Choose a spreadsheet first"}
            </option>
            {sheetOptions.map((sheet) => (
              <option key={sheet.sheetId} value={sheet.title}>
                {sheet.title}
              </option>
            ))}
          </select>
        </FormField>
      </article>
    </>
  );
}
