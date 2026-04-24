function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Lab Automation")
    .addItem("Run Now", "weeklyComplianceRun")
    .addItem("Create Weekly Trigger", "createWeeklyTrigger")
    .addItem("Delete Weekly Trigger", "deleteWeeklyTrigger")
    .addSeparator()
    .addItem("Clear RunLog", "clearRunLog")
    .addToUi();
}

function parsePossibleDate(value) {
  if (value === null || value === undefined || value === "") return null;

  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value.getTime())) {
    const d = new Date(value);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  if (typeof value === "number") {
    const d = new Date(Math.round((value - 25569) * 86400 * 1000));
    if (!isNaN(d.getTime())) {
      d.setHours(0, 0, 0, 0);
      return d;
    }
  }

  const str = String(value).trim();
  if (!str) return null;

  const shortMdMatch = str.match(/^(\d{1,2})[./](\d{1,2})$/);
  if (shortMdMatch) {
    const month = parseInt(shortMdMatch[1], 10);
    const day = parseInt(shortMdMatch[2], 10);
    const year = new Date().getFullYear();

    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const d = new Date(year, month - 1, day);
      if (
        d.getFullYear() === year &&
        d.getMonth() === month - 1 &&
        d.getDate() === day
      ) {
        d.setHours(0, 0, 0, 0);
        return d;
      }
    }
  }

  const fullMdYMatch = str.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (fullMdYMatch) {
    const month = parseInt(fullMdYMatch[1], 10);
    const day = parseInt(fullMdYMatch[2], 10);
    let year = parseInt(fullMdYMatch[3], 10);

    if (year < 100) year += 2000;

    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const d = new Date(year, month - 1, day);
      if (
        d.getFullYear() === year &&
        d.getMonth() === month - 1 &&
        d.getDate() === day
      ) {
        d.setHours(0, 0, 0, 0);
        return d;
      }
    }
  }

  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    parsed.setHours(0, 0, 0, 0);
    return parsed;
  }

  return null;
}

function weeklyComplianceRun() {
  const adminSs = SpreadsheetApp.getActiveSpreadsheet();
  const registrySheet = adminSs.getSheetByName("SheetRegistry");
  const runLogSheet = adminSs.getSheetByName("RunLog");
  const feedbackSheet = getOrCreateSheet(adminSs, "Feedback");

  if (!registrySheet) throw new Error("SheetRegistry tab not found.");
  if (!runLogSheet) throw new Error("RunLog tab not found.");

  const registryValues = registrySheet.getDataRange().getValues();
  if (registryValues.length < 2) {
    logRun(runLogSheet, "", "", "ERROR", "No lab member rows found in SheetRegistry.");
    return;
  }

  const registryHeaders = registryValues[0];
  const registryIdx = getHeaderMap(registryHeaders, [
    "Lab Member",
    "Task Log URL",
    "Active Sheet",
    "Active"
  ]);

  const activeLabMembers = [];
  const feedbackByLabMember = {};
  const runTimestamp = new Date();
  const runHeader = formatRunTimestamp(runTimestamp);

  for (let i = 1; i < registryValues.length; i++) {
    const row = registryValues[i];

    const labMember = safeString(row[registryIdx["Lab Member"]]);
    const taskLogUrl = safeString(row[registryIdx["Task Log URL"]]);
    const activeSheetName = safeString(row[registryIdx["Active Sheet"]]);
    const active = row[registryIdx["Active"]];

    if (!isTruthy(active)) continue;
    if (!labMember) continue;

    activeLabMembers.push(labMember);

    try {
      const taskLogSs = SpreadsheetApp.openByUrl(taskLogUrl);
      const logSheet = taskLogSs.getSheetByName(activeSheetName);

      if (!logSheet) {
        throw new Error(`Sheet "${activeSheetName}" not found in task log.`);
      }

      const values = logSheet.getDataRange().getValues();
      if (values.length === 0) {
        throw new Error(`Sheet "${activeSheetName}" is empty.`);
      }

      const headers = values[0];
      const idx = getHeaderMap(headers, [
        "Project",
        "Experiment",
        "Schematic",
        "Time Estimate",
        "Start Date",
        "Projected End Date",
        "Status",
        "Result",
        "Link to Data",
        "Notebook Location"
      ]);

      const complianceOutput = [[
        "Row",
        "Project",
        "Experiment",
        "Status",
        "Missing Fields",
        "Overdue",
        "Completed Missing Result",
        "Completed Missing Data Link",
        "Feedback"
      ]];

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let totalExperiments = 0;
      let compliantCount = 0;
      let missingFieldsCount = 0;
      let overdueCount = 0;
      let completedMissingResultCount = 0;
      let completedMissingDataLinkCount = 0;
      const flaggedExperimentSummaries = [];

      for (let r = 1; r < values.length; r++) {
        const dataRow = values[r];

        if (isEntireRowBlank(dataRow)) continue;

        totalExperiments++;

        const project = safeString(dataRow[idx["Project"]]);
        const experiment = safeString(dataRow[idx["Experiment"]]);
        const schematic = safeString(dataRow[idx["Schematic"]]);
        const timeEstimate = safeString(dataRow[idx["Time Estimate"]]);
        const startDate = dataRow[idx["Start Date"]];
        const projectedEndDate = dataRow[idx["Projected End Date"]];
        const statusRaw = safeString(dataRow[idx["Status"]]);
        const result = safeString(dataRow[idx["Result"]]);
        const dataLink = safeString(dataRow[idx["Link to Data"]]);
        const notebookLocation = safeString(dataRow[idx["Notebook Location"]]);

        const status = statusRaw ? statusRaw.toLowerCase() : "";

        const parsedStartDate = parsePossibleDate(startDate);
        const parsedProjectedEndDate = parsePossibleDate(projectedEndDate);

        let missing = [];
        if (!project) missing.push("Project");
        if (!experiment) missing.push("Experiment");
        if (!schematic) missing.push("Schematic");
        if (!timeEstimate) missing.push("Time Estimate");
        if (!parsedStartDate) missing.push("Start Date");
        if (!parsedProjectedEndDate) missing.push("Projected End Date");
        if (!status) missing.push("Status");
        if (!notebookLocation) missing.push("Notebook Location");

        let overdue = "No";
        if (
          parsedProjectedEndDate &&
          parsedProjectedEndDate < today &&
          (status === "ongoing" || status === "planned" || status === "in progress")
        ) {
          overdue = "Yes";
        }

        let completedMissingResult = "No";
        let completedMissingDataLink = "No";

        if (status === "completed" || status === "complete") {
          if (!result) completedMissingResult = "Yes";
          if (!dataLink) completedMissingDataLink = "Yes";
        }

        let feedbackParts = [];

        if (missing.length > 0) {
          feedbackParts.push("Missing required fields: " + missing.join(", ") + ".");
        }
        if (overdue === "Yes") {
          feedbackParts.push(
            "Projected end date has passed, but experiment is still marked " + status + "."
          );
        }
        if (completedMissingResult === "Yes") {
          feedbackParts.push("Completed experiment is missing a result summary.");
        }
        if (completedMissingDataLink === "Yes") {
          feedbackParts.push("Completed experiment is missing a data link.");
        }
        if (feedbackParts.length === 0) {
          feedbackParts.push("Compliant.");
          compliantCount++;
        } else {
          if (missing.length > 0) missingFieldsCount++;
          if (overdue === "Yes") overdueCount++;
          if (completedMissingResult === "Yes") completedMissingResultCount++;
          if (completedMissingDataLink === "Yes") completedMissingDataLinkCount++;

          flaggedExperimentSummaries.push(
            `- ${experiment || "(Unnamed experiment)"}: ${feedbackParts.join(" ")}`
          );
        }

        complianceOutput.push([
          r + 1,
          project,
          experiment,
          statusRaw,
          missing.join(", "),
          overdue,
          completedMissingResult,
          completedMissingDataLink,
          feedbackParts.join(" ")
        ]);
      }

      writeOutputSheet(taskLogSs, "Compliance", complianceOutput);

      const fullFeedback = buildPersonLevelFeedback({
        labMember,
        totalExperiments,
        compliantCount,
        missingFieldsCount,
        overdueCount,
        completedMissingResultCount,
        completedMissingDataLinkCount,
        flaggedExperimentSummaries
      });

      let shortFeedback;
      try {
        shortFeedback = summarizeFeedbackWithOpenAI(fullFeedback);
      } catch (apiErr) {
        shortFeedback = fullFeedback;
        logRun(runLogSheet, labMember, taskLogUrl, "ERROR", `OpenAI summarization failed: ${apiErr.message}`);
      }

      feedbackByLabMember[labMember] = shortFeedback;

      logRun(
        runLogSheet,
        labMember,
        taskLogUrl,
        "SUCCESS",
        `Processed ${complianceOutput.length - 1} experiments from "${activeSheetName}".`
      );
    } catch (err) {
      feedbackByLabMember[labMember] =
        `Weekly summary for ${labMember}\n\nAutomation failed for this run.\nError: ${err.message}`;

      logRun(runLogSheet, labMember, taskLogUrl, "ERROR", err.message);
    }
  }

  writeAdminFeedbackSheet(feedbackSheet, activeLabMembers, runHeader, feedbackByLabMember);
}

function buildPersonLevelFeedback(summary) {
  const {
    labMember,
    totalExperiments,
    compliantCount,
    missingFieldsCount,
    overdueCount,
    completedMissingResultCount,
    completedMissingDataLinkCount,
    flaggedExperimentSummaries
  } = summary;

  const flaggedCount = totalExperiments - compliantCount;

  const lines = [
    `Weekly summary for ${labMember}`,
    "",
    `Experiments reviewed: ${totalExperiments}`,
    `Fully compliant: ${compliantCount}`,
    `Need attention: ${flaggedCount}`,
    "",
    `Experiments with missing required fields: ${missingFieldsCount}`,
    `Overdue experiments: ${overdueCount}`,
    `Completed experiments missing result summary: ${completedMissingResultCount}`,
    `Completed experiments missing data link: ${completedMissingDataLinkCount}`
  ];

  if (flaggedExperimentSummaries.length > 0) {
    lines.push("");
    lines.push("Flagged experiments:");
    lines.push(flaggedExperimentSummaries.join("\n"));
  } else {
    lines.push("");
    lines.push("All reviewed experiments were compliant.");
  }

  return lines.join("\n");
}

function writeAdminFeedbackSheet(feedbackSheet, activeLabMembers, runHeader, feedbackByLabMember) {
  const lastRow = feedbackSheet.getLastRow();
  const lastCol = feedbackSheet.getLastColumn();

  let existingHeaders = ["Lab Member"];
  let existingData = [];

  if (lastRow > 0 && lastCol > 0) {
    existingHeaders = feedbackSheet.getRange(1, 1, 1, lastCol).getValues()[0];
    if (lastRow > 1) {
      existingData = feedbackSheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
    }
  }

  if (existingHeaders.length === 0) existingHeaders = ["Lab Member"];
  if (existingHeaders[0] !== "Lab Member") existingHeaders[0] = "Lab Member";

  const oldMap = {};
  for (let i = 0; i < existingData.length; i++) {
    const row = existingData[i];
    const member = safeString(row[0]);
    if (member) oldMap[member] = row;
  }

  const headers = ["Lab Member", runHeader, ...existingHeaders.slice(1)];
  const output = [headers];

  for (let i = 0; i < activeLabMembers.length; i++) {
    const labMember = activeLabMembers[i];
    const oldRow = oldMap[labMember] || new Array(existingHeaders.length).fill("");

    const newRow = [labMember, feedbackByLabMember[labMember] || "", ...oldRow.slice(1)];

    while (newRow.length < headers.length) {
      newRow.push("");
    }

    output.push(newRow);
  }

  feedbackSheet.clear();
  feedbackSheet.getRange(1, 1, output.length, headers.length).setValues(output);
  feedbackSheet.autoResizeColumns(1, headers.length);
  feedbackSheet.setFrozenRows(1);
  feedbackSheet.setFrozenColumns(1);
  formatOutputSheet(feedbackSheet);
}

function createWeeklyTrigger() {
  const existingTriggers = ScriptApp.getProjectTriggers();
  const alreadyExists = existingTriggers.some(
    t => t.getHandlerFunction() === "weeklyComplianceRun"
  );

  if (alreadyExists) {
    SpreadsheetApp.getUi().alert("A weeklyComplianceRun trigger already exists.");
    return;
  }

  ScriptApp.newTrigger("weeklyComplianceRun")
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(9)
    .create();

  SpreadsheetApp.getUi().alert("Weekly Monday trigger created.");
}

function clearRunLog() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const runLogSheet = ss.getSheetByName("RunLog");

  if (!runLogSheet) {
    SpreadsheetApp.getUi().alert("RunLog tab not found.");
    return;
  }

  runLogSheet.clear();
  runLogSheet.getRange(1, 1, 1, 5).setValues([[
    "Timestamp",
    "Lab Member",
    "Task Log URL",
    "Status",
    "Note"
  ]]);

  SpreadsheetApp.getUi().alert("RunLog cleared and header reset.");
}

function writeOutputSheet(ss, sheetName, output) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  } else {
    sheet.clear();
  }

  if (output.length > 0) {
    sheet.getRange(1, 1, output.length, output[0].length).setValues(output);
    sheet.autoResizeColumns(1, output[0].length);
    sheet.setFrozenRows(1);
    formatOutputSheet(sheet);
  }
}

function logRun(runLogSheet, labMember, taskLogUrl, status, note) {
  runLogSheet.insertRowsAfter(1, 1);
  const range = runLogSheet.getRange(2, 1, 1, 5);

  range.setValues([[
    new Date(),
    labMember,
    taskLogUrl,
    status,
    note
  ]]);

  range
    .setHorizontalAlignment("left")
    .setVerticalAlignment("top")
    .setWrap(true);
}

function getOrCreateSheet(ss, sheetName) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  return sheet;
}

function getHeaderMap(headers, requiredHeaders) {
  const map = {};
  requiredHeaders.forEach(header => {
    const index = headers.indexOf(header);
    if (index === -1) {
      throw new Error(`Missing required header: ${header}`);
    }
    map[header] = index;
  });
  return map;
}

function safeString(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function isTruthy(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    return v === "true" || v === "yes" || v === "y";
  }
  if (typeof value === "number") return value !== 0;
  return false;
}

function isEntireRowBlank(row) {
  return row.every(cell => cell === "" || cell === null);
}

function deleteWeeklyTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  let deleted = false;

  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === "weeklyComplianceRun") {
      ScriptApp.deleteTrigger(trigger);
      deleted = true;
    }
  });

  SpreadsheetApp.getUi().alert(
    deleted ? "Weekly trigger deleted." : "No weeklyComplianceRun trigger found."
  );
}

function formatRunTimestamp(date) {
  return Utilities.formatDate(
    date,
    Session.getScriptTimeZone(),
    "yyyy-MM-dd HH:mm:ss"
  );
}

function formatOutputSheet(sheet) {
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  if (lastRow > 0 && lastCol > 0) {
    sheet.getRange(1, 1, lastRow, lastCol)
      .setHorizontalAlignment("left")
      .setVerticalAlignment("top")
      .setWrap(true);
  }
}

function summarizeFeedbackWithOpenAI(fullFeedback) {
  const apiKey = PropertiesService.getScriptProperties().getProperty("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not found in Script Properties.");
  }

  const payload = {
    model: "gpt-5.4",
    reasoning: { effort: "high" },
    input: [
      {
        role: "user",
        content: `You are writing a short weekly compliance email directly TO the lab member. Rules:
        - Address them by first name
        - Use "you/your", NEVER third person
        - Lead with anything positive, then what needs fixing
        - Use short bullet points for action items
        - Keep it under 150 words
        - No subject line, no sign-off, no greeting like "Dear"

        Convert this report:\n\n${fullFeedback}`
      }
    ]
  };

  const response = UrlFetchApp.fetch("https://api.openai.com/v1/responses", {
    method: "post",
    contentType: "application/json",
    headers: {
      Authorization: "Bearer " + apiKey
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const status = response.getResponseCode();
  const body = response.getContentText();

  if (status < 200 || status >= 300) {
    throw new Error(`OpenAI API error (${status}): ${body}`);
  }

  const json = JSON.parse(body);

  const outputMessage = json.output && json.output.find(o => o.type === "message");
  const textBlock = outputMessage && outputMessage.content && outputMessage.content.find(c => c.type === "output_text");
  const summary = textBlock ? textBlock.text.trim() : "";

  if (!summary) {
    throw new Error("OpenAI returned empty summary. Raw response: " + body.substring(0, 300));
  }

  return summary;
}

