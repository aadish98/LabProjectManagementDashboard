export {
  backfillTaskIdsInSheet,
  resolveTaskRowById,
  verifyTaskRevisionBeforeMutation,
  type TaskMutationIdentity
} from "./taskLog/identity";
export {
  buildAppendedStruckCell,
  resolveOverdueTaskInSheet,
  type OverdueResolution
} from "./taskLog/overdue";
export {
  parseExperimentRows,
  parseFeedback,
  parseRunLog
} from "./taskLog/parsing";
export { loadEmployeeDataset } from "./taskLog/reads";
export {
  buildChangedTaskCellUpdates,
  buildRowValues,
  buildTaskIdBackfill,
  buildTaskMetadataBackfill,
  draftValueForField,
  parseTaskRevision,
  TASK_ID_HEADER,
  TASK_REVISION_HEADER,
  taskIdColumnIndex,
  taskRevisionColumnIndex,
  type ChangedTaskCell,
  type TaskMetadataBackfill
} from "./taskLog/rowMapping";
export {
  completeTaskInSheet,
  createTaskInSheet,
  updateTaskInSheet,
  type CompletionPayload
} from "./taskLog/writes";
