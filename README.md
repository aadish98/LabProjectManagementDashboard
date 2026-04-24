# Lab Workflow Desktop

This project turns the existing Google Apps Script workflow in `Code.gs` into a role-based desktop-ready application:

- Employees get a submission-form GUI for creating and updating experiment records, plus Kanban and Gantt views of their task log.
- Managers get Kanban, Gantt, compliance, feedback, and RunLog views across active lab members.
- Google Sheets remains the source of truth, with the current Apps Script rules reused in the app.
- The supported runtime target is a local desktop app on macOS and Windows.

## What is included

- `Code.gs`: the original Apps Script reference implementation.
- `src/domain/`: typed workflow models and the compliance rules ported from Apps Script.
- `src/services/googleSheets.ts`: live Google Sheets read/write plus local caching.
- `src/features/employee/`: employee submission workspace.
- `src/features/manager/`: manager Kanban dashboard and operational rollups.
- `src/features/gantt/`: shared employee/manager Gantt chart, custom date-range controls, and PNG/print export.
- `src-tauri/`: Tauri packaging scaffold for macOS and Windows.

## Quick start

```bash
npm install
npm run dev
```

`npm run dev` launches the Tauri desktop app in development mode.

## Production setup

The app supports two sign-in roles, and they have completely independent setup paths.

### Manager setup

1. Create one shared Google OAuth client ID (Web application type) for the desktop app.
2. In `.env` (or the in-app Setup screen) set:
   - `VITE_GOOGLE_CLIENT_ID`
   - `VITE_ADMIN_SPREADSHEET_ID` — the admin workbook only managers can read.
   - `VITE_MANAGER_EMAILS` — comma-separated list of emails that should be treated as managers.
   - `VITE_EMPLOYEE_EMAILS` — comma-separated list of emails that should be treated as employees.
3. Ensure the admin spreadsheet contains:
   - `SheetRegistry`
   - `RunLog`
   - `Feedback`
4. Optionally add a `Roles` sheet with columns `Email`, `Role`, `Lab Member`.

When a manager signs in, the app loads the admin sheet and every per-employee task log it references.

### Lab member (employee) setup

Lab members do **not** need access to the admin spreadsheet. They only need:

1. To sign in with the same shared Google OAuth client ID.
2. Read/write access to their own task-log spreadsheet (the manager keeps this sheet's URL in `SheetRegistry`, and shares it with the lab member directly in Drive).
3. To be listed in `VITE_EMPLOYEE_EMAILS` or in the locally overridden employee allow-list.
4. To enter their task-log spreadsheet URL and active tab name in the employee setup screen on first use. The app remembers those preferences locally per device and email.

When a lab member signs in, the app loads only their own task log. The admin sheet is never touched.

## Gantt view

Employees and managers can switch from Kanban to Gantt. The Gantt view defaults to the current quarter and lets users choose any start and end date to inspect an arbitrary date range. Managers can select all or any subset of employees independently of the Kanban employee tabs. The chart can be downloaded as PNG or printed/saved as PDF through the system print dialog.

Tasks with non-standard or unparseable dates are flagged on cards and collected in a Gantt repair queue outside the positioned timeline so date problems are visible instead of silently treated as valid schedule data. Those exception cards include a Fix task action that opens the edit flow for the affected task.

The UI uses a calm, task-first visual system centered on Avenir Next, with IBM Plex Sans used for compact labels and controls. Required or non-compliant edit fields are highlighted next to the affected inputs rather than hidden in a separate compliance preview box.

The app uses the live Google Sheets workflow only. There is no bundled mock/demo data path.
If the `Roles` sheet does not exist (manager mode), the app falls back to the configured manager emails and best-effort identity matching against `SheetRegistry`.

For full setup, access, spreadsheet, and compliance requirements, see `GUI_ACCESS_REQUIREMENTS.md`.

## Desktop packaging

The repo includes a Tauri 2 desktop shell and scripts:

```bash
npm run dev
npm run build
```

Internally, Tauri uses the React/Vite frontend build, but the intended way to run the project is through the desktop commands above.

Before those commands will work locally, install the Rust toolchain and platform-native build prerequisites:

- macOS: Xcode Command Line Tools + Rust
- Windows: Visual Studio Build Tools + Rust

Code signing and notarization still require your own platform certificates and secrets. The packaging scaffold is ready, but signing cannot be completed automatically without those credentials.
