#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const VALID_ROLES = new Set(["employee", "manager", "pi"]);

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalized(value) {
  return text(value).toLowerCase();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function personKey(person, index) {
  return text(person.legacyKey) || `person-${index + 1}`;
}

function duplicateGroups(entries) {
  const groups = new Map();
  for (const entry of entries) {
    if (!entry.value) continue;
    const keys = groups.get(entry.value) ?? [];
    keys.push(entry.key);
    groups.set(entry.value, keys);
  }
  return [...groups.entries()]
    .filter(([, keys]) => keys.length > 1)
    .map(([value, keys]) => ({ value, people: keys.sort() }))
    .sort((left, right) => left.value.localeCompare(right.value));
}

function classifyLifecycle(person, taskLogId) {
  if (person.active === false) {
    return {
      state: "blocked",
      nextActor: "manager",
      nextAction: "Confirm whether the inactive legacy person should be migrated."
    };
  }
  if (person.blocked) {
    return {
      state: "blocked",
      nextActor: text(person.blocked.owner) || "operator",
      nextAction: text(person.blocked.nextAction) || "Resolve the recorded blocker."
    };
  }
  if (!text(person.invitationId)) {
    return {
      state: "invited",
      nextActor: "manager",
      nextAction: "Create or reconcile the authoritative invitation."
    };
  }
  if (person.driveShared !== true) {
    return {
      state: "needsSharing",
      nextActor: "manager",
      nextAction: "Provision the exact Firestore-derived Drive file set."
    };
  }
  if (!taskLogId || text(person.pickerSpreadsheetId) !== taskLogId) {
    return {
      state: "needsPicker",
      nextActor: "member",
      nextAction: "Select the exact configured task-log spreadsheet through Picker."
    };
  }
  if (person.columnMapAccepted !== true) {
    return {
      state: "needsColumnReview",
      nextActor: "member",
      nextAction: "Review and accept the proposed shared column map."
    };
  }
  return {
    state: "ready",
    nextActor: "none",
    nextAction: "No onboarding action is proposed by this dry run."
  };
}

function countFindings(findings) {
  return Object.values(findings).reduce((total, value) => {
    if (!Array.isArray(value)) return total;
    return total + value.length;
  }, 0);
}

export function buildPilotMigrationInventory(fixture, options = {}) {
  if (!fixture || typeof fixture !== "object" || Array.isArray(fixture)) {
    throw new Error("Pilot fixture must be a JSON object.");
  }
  if (fixture.schemaVersion !== 1) {
    throw new Error("Pilot fixture schemaVersion must be 1.");
  }
  if (fixture.redacted !== true) {
    throw new Error("Pilot fixture must explicitly declare redacted: true.");
  }
  if (!Array.isArray(fixture.people)) {
    throw new Error("Pilot fixture people must be an array.");
  }

  const people = fixture.people;
  const adminWorkbookId = text(fixture.lab?.adminWorkbookId);
  const activeTaskLogIds = [
    ...new Set(
      people
        .filter((person) => person.active !== false)
        .map((person) => text(person.taskLog?.spreadsheetId))
        .filter(Boolean)
    )
  ].sort();

  const duplicateEmails = duplicateGroups(
    people.map((person, index) => ({
      key: personKey(person, index),
      value: normalized(person.email)
    }))
  );
  const duplicatePeople = duplicateGroups(
    people.map((person, index) => ({
      key: personKey(person, index),
      value: normalized(person.displayName)
    }))
  );
  const duplicateTaskLogIds = duplicateGroups(
    people.map((person, index) => ({
      key: personKey(person, index),
      value: text(person.taskLog?.spreadsheetId)
    }))
  );

  const missingStableIds = [];
  if (!text(fixture.lab?.labId)) {
    missingStableIds.push({ entity: "lab", person: null });
  }

  const missingTaskLogIds = [];
  const tabIssues = [];
  const mapIssues = [];
  const taskMetadataIssues = [];
  const invalidRoles = [];
  const lifecycle = [];
  const roleFileSets = [];

  people.forEach((person, index) => {
    const key = personKey(person, index);
    const roles = [...new Set(list(person.roles).map(normalized).filter(Boolean))].sort();
    const taskLogId = text(person.taskLog?.spreadsheetId);
    const activeTab = text(person.taskLog?.activeTab);
    const availableTabs = list(person.taskLog?.availableTabs).map(text).filter(Boolean);
    const headers = new Set(list(person.taskLog?.headers).map(text).filter(Boolean));
    const columnMap =
      person.taskLog?.columnMap && typeof person.taskLog.columnMap === "object"
        ? person.taskLog.columnMap
        : {};

    if (!text(person.memberId)) missingStableIds.push({ entity: "member", person: key });
    if (!text(person.invitationId)) {
      missingStableIds.push({ entity: "invitation", person: key });
    }
    if (!taskLogId && person.active !== false) {
      missingTaskLogIds.push({ person: key });
      missingStableIds.push({ entity: "taskLog", person: key });
    }

    for (const role of roles) {
      if (!VALID_ROLES.has(role)) invalidRoles.push({ person: key, role });
    }

    if (!activeTab) {
      tabIssues.push({ person: key, code: "ACTIVE_TAB_MISSING", activeTab: null });
    } else if (!availableTabs.includes(activeTab)) {
      tabIssues.push({ person: key, code: "ACTIVE_TAB_STALE", activeTab });
    }

    const mappings = Object.entries(columnMap)
      .map(([field, header]) => ({ field: text(field), header: text(header) }))
      .filter(({ field, header }) => field && header);
    if (
      ![...headers].some(
        (header) => header.toLowerCase().replace(/[^a-z0-9]/g, "") === "taskid"
      )
    ) {
      taskMetadataIssues.push({ person: key, code: "TASK_ID_COLUMN_MISSING" });
    }
    if (mappings.length === 0) {
      mapIssues.push({ person: key, code: "COLUMN_MAP_MISSING" });
    }
    for (const mapping of mappings) {
      if (!headers.has(mapping.header)) {
        mapIssues.push({
          person: key,
          code: "MAPPED_HEADER_MISSING",
          field: mapping.field,
          header: mapping.header
        });
      }
    }

    const tasks = list(person.taskLog?.tasks);
    const taskIdGroups = new Map();
    for (const [taskIndex, task] of tasks.entries()) {
      const taskId = text(task?.taskId);
      const row = Number.isInteger(task?.row) ? task.row : taskIndex + 2;
      if (!taskId) {
        taskMetadataIssues.push({ person: key, code: "TASK_ID_MISSING", row });
        continue;
      }
      const rows = taskIdGroups.get(taskId) ?? [];
      rows.push(row);
      taskIdGroups.set(taskId, rows);
      if (text(task?.source) === "external") {
        taskMetadataIssues.push({
          person: key,
          code: "TASK_ID_EXTERNALLY_GENERATED",
          row,
          taskId
        });
      }
    }
    for (const [taskId, rows] of taskIdGroups) {
      if (rows.length > 1) {
        taskMetadataIssues.push({
          person: key,
          code: "TASK_ID_DUPLICATE",
          taskId,
          rows: rows.sort((left, right) => left - right)
        });
      }
    }

    const classification = classifyLifecycle(person, taskLogId);
    lifecycle.push({ person: key, ...classification });

    const requiredFiles = new Set();
    if (roles.includes("employee") && taskLogId) requiredFiles.add(taskLogId);
    if (roles.includes("manager") || roles.includes("pi")) {
      if (adminWorkbookId) requiredFiles.add(adminWorkbookId);
      for (const id of activeTaskLogIds) requiredFiles.add(id);
    }
    roleFileSets.push({
      person: key,
      roles,
      requiredSpreadsheetIds: [...requiredFiles].sort()
    });
  });

  const findings = {
    duplicateEmails,
    duplicatePeople,
    duplicateTaskLogIds,
    missingStableIds,
    missingTaskLogIds,
    tabIssues,
    mapIssues,
    taskMetadataIssues,
    invalidRoles
  };
  const findingCount = countFindings(findings);

  return {
    schemaVersion: "pilot-migration-inventory/v1",
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    mutationMode: "none",
    source: {
      fixture: options.sourceName ?? "in-memory",
      fixtureSchemaVersion: fixture.schemaVersion,
      redacted: fixture.redacted === true
    },
    summary: {
      people: people.length,
      activePeople: people.filter((person) => person.active !== false).length,
      findingCount,
      status: findingCount === 0 ? "readyForOperatorReview" : "reviewRequired"
    },
    findings,
    lifecycle,
    roleFileSets
  };
}

function parseArguments(arguments_) {
  let fixturePath = "";
  let outputPath = "";
  let pretty = false;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--pretty") {
      pretty = true;
    } else if (argument === "--output") {
      outputPath = arguments_[index + 1] ?? "";
      index += 1;
    } else if (argument.startsWith("--")) {
      throw new Error(`Unknown option: ${argument}`);
    } else if (!fixturePath) {
      fixturePath = argument;
    } else {
      throw new Error(`Unexpected argument: ${argument}`);
    }
  }
  if (!fixturePath) {
    throw new Error(
      "Usage: node scripts/pilot-migration-inventory.mjs FIXTURE.json [--output EVIDENCE.json] [--pretty]"
    );
  }
  if (arguments_.includes("--output") && !outputPath) {
    throw new Error("--output requires a file path.");
  }
  return { fixturePath, outputPath, pretty };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const absoluteFixturePath = path.resolve(options.fixturePath);
  const fixture = JSON.parse(await readFile(absoluteFixturePath, "utf8"));
  const evidence = buildPilotMigrationInventory(fixture, {
    sourceName: path.basename(absoluteFixturePath)
  });
  const json = `${JSON.stringify(evidence, null, options.pretty ? 2 : 0)}\n`;
  if (options.outputPath) {
    await writeFile(path.resolve(options.outputPath), json, { flag: "w" });
  } else {
    process.stdout.write(json);
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
