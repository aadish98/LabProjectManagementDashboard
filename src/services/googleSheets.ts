/**
 * Compatibility facade for existing callers.
 *
 * Google Sheets behavior is implemented in cohesive modules under
 * `services/sheets`. New application code should import the focused module;
 * this facade remains for compatibility with external and incremental callers.
 */
export {
  ADMIN_REGISTRY_HEADERS,
  ADMIN_ROLES_HEADERS,
  RUN_LOG_HEADERS,
  appendRunLogEntry,
  backfillMemberIds,
  ensureAdminWorkbookSkeleton,
  mirrorMemberCompatibilityRows,
  readAdminWorkbookOverview,
  syncMemberRoleRows,
  upsertRegistryRow,
  writeRegistryRows,
  writeRolesRows,
  type AdminWorkbookOverview,
  type MemberCompatibilityMirrorUpdate,
  type MemberRoleMirrorUpdate,
  type RegistryWriteRow,
  type RoleWriteRow,
  type RunLogAuditWrite
} from "./sheets/admin";
export {
  GOOGLE_WORKSPACE_SCOPES,
} from "./sheets/client";
export {
  AdminWorkbookSchemaError,
  GoogleSheetsAuthError,
  GoogleSheetsFileAccessError,
  isAdminWorkbookSchemaError,
  isGoogleSheetsAuthError,
  isGoogleSheetsFileAccessError,
  isSheetsError,
  isStaleTabError,
  sheetsErrorMessage,
  sheetsErrorStatusFields,
  SheetRevisionConflictError,
  SheetsError,
  type MissingSpreadsheetAccess,
  type SheetsErrorCode,
  type SheetsErrorContext
} from "./sheets/errors";
export { loadGoogleSheetsDataset } from "./sheets/dataset";
export { extractIdFromUrl } from "./sheets/helpers";
export {
  analyzeEmployeeSheetHeaders,
  fetchSpreadsheetMetadata,
  insertHeadersInSheet,
  validateEmployeeSheet,
  type AppendedHeader,
  type InsertHeaderRequest,
  type SheetHeaderAnalysis,
  type SheetMetadata,
  type ValidatedSheet
} from "./sheets/metadata";
export {
  PROFILE_TAB_NAME,
  readEmployeeProfile,
  readEmployeeProfileForManager,
  writeEmployeeProfile
} from "./sheets/profile";
export {
  backfillTaskIdsInSheet,
  buildChangedTaskCellUpdates,
  buildTaskIdBackfill,
  buildTaskMetadataBackfill,
  completeTaskInSheet,
  createTaskInSheet,
  loadEmployeeDataset,
  resolveOverdueTaskInSheet,
  resolveTaskRowById,
  TASK_ID_HEADER,
  TASK_REVISION_HEADER,
  updateTaskInSheet,
  type CompletionPayload,
  type OverdueResolution
} from "./sheets/taskLog";
