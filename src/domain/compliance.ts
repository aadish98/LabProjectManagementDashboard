import type {
  ComplianceResult,
  EmployeeReport,
  ExperimentRecord,
  FeedbackThread,
  KanbanLane,
  NormalizedStatus
} from "./experiment";
import { parsePossibleDate, startOfToday } from "../utils/date";

const OVERDUE_GRACE_MS = 24 * 60 * 60 * 1000;

function safeString(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

export function normalizeStatus(statusRaw: string): NormalizedStatus {
  const status = safeString(statusRaw).toLowerCase();

  if (status === "completed" || status === "complete" || status === "done") {
    return "completed";
  }

  if (status === "ongoing" || status === "planned" || status === "in progress") {
    return status === "planned" ? "planned" : "inProgress";
  }

  if (status.includes("block") || status.includes("hold")) {
    return "blocked";
  }

  return "unknown";
}

function laneFor(
  normalized: NormalizedStatus,
  overdue: boolean
): KanbanLane {
  if (normalized === "completed") return "completed";
  if (overdue) return "overdue";
  if (normalized === "inProgress") return "inProgress";
  return "planned";
}

export function evaluateCompliance(
  record: ExperimentRecord,
  now: Date = new Date()
): ComplianceResult {
  const statusRaw = safeString(record.status);
  const normalized = normalizeStatus(statusRaw);
  const parsedStartDate = parsePossibleDate(record.startDateRaw);
  const parsedProjectedEndDate = parsePossibleDate(record.projectedEndDateRaw);

  const completed = normalized === "completed";

  const missingFields: string[] = [];
  if (!completed) {
    if (!safeString(record.project)) missingFields.push("Project");
    if (!safeString(record.experiment)) missingFields.push("Experiment");
    if (!safeString(record.timeEstimate)) missingFields.push("Time Estimate");
    if (!parsedStartDate) missingFields.push("Start Date");
    if (!parsedProjectedEndDate) missingFields.push("Projected End Date");
    if (!statusRaw) missingFields.push("Status");
    if (!safeString(record.schematic)) missingFields.push("Schematic");
    if (!safeString(record.dataLink)) missingFields.push("Link to Data");
  }

  const completedMissingResult = completed && !safeString(record.result);
  const completedMissingDataLink = completed && !safeString(record.dataLink);
  if (completedMissingResult) missingFields.push("Result");
  if (completedMissingDataLink) missingFields.push("Link to Data");

  const overdue =
    !completed &&
    !!parsedProjectedEndDate &&
    now.getTime() - parsedProjectedEndDate.getTime() > OVERDUE_GRACE_MS;

  const lane = laneFor(normalized, overdue);

  const feedbackParts: string[] = [];
  if (missingFields.length > 0) {
    feedbackParts.push(`Missing: ${missingFields.join(", ")}.`);
  }
  if (overdue) {
    feedbackParts.push("Overdue: projected end date is more than 24 hours behind.");
  }

  const isCompliant = feedbackParts.length === 0;
  return {
    missingFields,
    overdue,
    completedMissingResult,
    completedMissingDataLink,
    isCompliant,
    feedback: isCompliant ? "Compliant." : feedbackParts.join(" "),
    normalizedStatus: normalized,
    lane
  };
}

export function buildPersonLevelFeedback(summary: {
  labMember: string;
  totalExperiments: number;
  compliantCount: number;
  missingFieldsCount: number;
  overdueCount: number;
  completedMissingResultCount: number;
  completedMissingDataLinkCount: number;
  flaggedExperimentSummaries: string[];
}): string {
  const flaggedCount = summary.totalExperiments - summary.compliantCount;
  const lines = [
    `Weekly summary for ${summary.labMember}`,
    "",
    `Experiments reviewed: ${summary.totalExperiments}`,
    `Fully compliant: ${summary.compliantCount}`,
    `Need attention: ${flaggedCount}`,
    "",
    `Experiments with missing required fields: ${summary.missingFieldsCount}`,
    `Overdue experiments: ${summary.overdueCount}`,
    `Completed experiments missing result summary: ${summary.completedMissingResultCount}`,
    `Completed experiments missing data link: ${summary.completedMissingDataLinkCount}`
  ];

  if (summary.flaggedExperimentSummaries.length > 0) {
    lines.push("", "Flagged experiments:", summary.flaggedExperimentSummaries.join("\n"));
  } else {
    lines.push("", "All reviewed experiments were compliant.");
  }

  return lines.join("\n");
}

export function summarizeEmployeeReports(
  experiments: ExperimentRecord[],
  feedbackThreads: FeedbackThread[]
): EmployeeReport[] {
  void startOfToday();
  const uniqueMembers = Array.from(new Set(experiments.map((record) => record.labMember))).sort();

  return uniqueMembers.map((labMember) => {
    const memberExperiments = experiments.filter((record) => record.labMember === labMember);
    let compliantCount = 0;
    let missingFieldsCount = 0;
    let overdueCount = 0;
    let completedMissingResultCount = 0;
    let completedMissingDataLinkCount = 0;
    const flaggedExperimentSummaries: string[] = [];

    for (const record of memberExperiments) {
      const compliance = evaluateCompliance(record);
      if (compliance.isCompliant) {
        compliantCount += 1;
        continue;
      }

      if (compliance.missingFields.length > 0) missingFieldsCount += 1;
      if (compliance.overdue) overdueCount += 1;
      if (compliance.completedMissingResult) completedMissingResultCount += 1;
      if (compliance.completedMissingDataLink) completedMissingDataLinkCount += 1;

      flaggedExperimentSummaries.push(
        `- ${record.experiment || "(Unnamed experiment)"}: ${compliance.feedback}`
      );
    }

    const generatedFeedback = buildPersonLevelFeedback({
      labMember,
      totalExperiments: memberExperiments.length,
      compliantCount,
      missingFieldsCount,
      overdueCount,
      completedMissingResultCount,
      completedMissingDataLinkCount,
      flaggedExperimentSummaries
    });

    const latestFeedback = feedbackThreads.find((thread) => thread.labMember === labMember)?.entries[0]
      ?.message;

    return {
      labMember,
      totalExperiments: memberExperiments.length,
      compliantCount,
      flaggedCount: memberExperiments.length - compliantCount,
      missingFieldsCount,
      overdueCount,
      completedMissingResultCount,
      completedMissingDataLinkCount,
      generatedFeedback,
      latestFeedback
    };
  });
}
