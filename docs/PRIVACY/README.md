# Privacy Policy

Last updated: July 29, 2026

Lab Project Management Dashboard is a desktop application for managing lab workflow data stored in Google Sheets. This policy explains what information the application accesses, how it is used, and how users can control it.

## Information We Access

The application uses Google sign-in and may request access to:

- Your Google account profile information, such as your stable Google subject, name, verified email address, and picture, to identify the signed-in user and look up Firestore membership or invitations.
- Google Sheets files that you explicitly select with Google Picker or that are selected by a manager for this app, including task logs, compliance records, feedback records, and related workflow spreadsheets.
- Spreadsheet metadata, such as sheet names and spreadsheet titles, so the application can find the correct worksheet tabs.

The application uses per-file Google Drive access and only accesses Google Sheets data needed to provide the workflow features shown in the app.

Google Picker authorization is specific to both the Google account and the selected file. A file selected by one manager is not automatically authorized for another manager, PI, or employee.

## How We Use Information

Information accessed through Google APIs is used to:

- Sign users in and load authoritative Firestore memberships, roles, invitations, and onboarding state.
- Display lab task logs, dashboards, compliance summaries, feedback, and related workflow views.
- Create, update, or organize task-log records at the user's request.
- Validate spreadsheet setup and show helpful error messages when required sheets or columns are missing.
- Authenticate requests to the Cloud Run API by verifying a short-lived Google ID token.

Google user data is not used for advertising, unrelated analytics, or profiling.

## Data Storage and Processing

The supported desktop application uses a Cloud Run API and Firestore. Cloud Run verifies Google ID tokens. Firestore stores labs, stable member/invitation IDs, normalized emails, roles, workbook IDs, tabs, proposed/accepted shared column maps, onboarding status, revisions, idempotency records, and onboarding audit events. Workflow task contents remain in Google Sheets controlled by the user or the user's organization. Compatibility rows in `SheetRegistry` and `Roles` are not authorization sources.

Google Drive access tokens are supplied to Cloud Run only when needed for a requested operation, processed in memory, and discarded when that operation finishes. Drive access tokens and refresh tokens are not stored in Firestore.

Some non-secret setup preferences and visibly stale caches may be stored locally on the user's device. Desktop refresh tokens are stored in the operating system credential vault, not in WebView local storage. Access and ID tokens are held in memory only. None of those OAuth tokens are intentionally written to application logs. Startup does not expose a signed-in workspace until vault hydration and token refresh complete.

## Data Sharing

The application does not sell, rent, or use Google user data for advertising. Google Cloud processes data as the infrastructure provider for Cloud Run and Firestore.

Data may be visible to other people only through the user's existing Google Drive or Google Sheets sharing settings. Users and administrators are responsible for managing access to their spreadsheets in Google Drive.

## Google API Limited Use

The application's use and transfer of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements.

## Data Retention and Deletion

Workflow data in Google Sheets can be deleted or modified directly in the relevant spreadsheet. Firestore application records and account metadata are retained while the account or lab uses the service; most records do not have an automatic expiry. Invitations have application expiry fields, but cleanup/retention must still be operated and verified.

The current application supports member deactivation and invitation revocation, not a self-service hard-delete endpoint for an entire account or lab. An authorized deletion request therefore requires a controlled operator procedure to remove the relevant Firestore records and verify the result. This is an external/manual release obligation and must not be represented as automatic deletion.

Google Drive tokens have no server-side retention period because Cloud Run processes them transiently and does not write them to Firestore. Cloud provider backup and operational-log lifecycle settings may delay complete removal from managed recovery systems; tokens and spreadsheet contents must not be included in application logs.

Users can also revoke the application's Google access at any time from their Google Account permissions page:

https://myaccount.google.com/permissions

Signing out attempts Google token revocation and always clears in-memory tokens and local session metadata; it then deletes the app's credential-vault entry even when network revocation fails. A credential-vault error is reported because the operating system may require manual removal. Other local preferences can be removed by clearing application data or uninstalling.

## Security

The Tauri desktop application is a public OAuth client using Google's authorization-code flow with PKCE, an exact loopback callback and state validation, and least-privilege scopes (`openid`, `email`, `profile`, `drive.file`). It does not configure or bundle an OAuth client secret. The backend verifies Google ID tokens before accepting authenticated requests. Desktop refresh tokens are protected by macOS Keychain, Windows Credential Manager, or Linux Secret Service; Drive access tokens are used only during authorized operations.

Users should only sign in on devices they trust and should manage spreadsheet sharing permissions carefully in Google Drive.

## Contact

For questions about this privacy policy or the application, contact the project maintainer through the GitHub repository:

https://github.com/aadish98/LabProjectManagementDashboard

Use of the application is also subject to the [Terms of Service](../TERMS/README.md).
