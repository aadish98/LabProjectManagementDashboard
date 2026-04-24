# TODO

## OAuth Verification Video Script

- Record and submit a YouTube video using this script:

```text
This is Lab Workflow Desktop. In Google Cloud, this is the OAuth client ID used by the app to request Google sign-in. The app uses this client for the local web app at localhost.

Now I’m opening the app and clicking Sign in with Google. This shows the OAuth grant process where the user chooses their Google account and grants access.

The app requests Google profile and email so it can identify the signed-in user and route them as a manager or employee.

The app also requests Google Sheets access because Sheets are the source of truth for lab workflow tasks. Managers read the admin SheetRegistry and employee task logs. Employees read and update their own task log.

Here is the manager dashboard loaded from Google Sheets. I will make a test task update, then show the corresponding Google Sheet row changing.

The app only writes user-initiated workflow updates, like creating, editing, completing, or resolving overdue tasks. It does not access Gmail, Calendar, contacts, or unrelated files.
```
