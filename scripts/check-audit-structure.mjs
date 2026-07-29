#!/usr/bin/env node

import { access, readFile } from "node:fs/promises";

const auditPath = new URL("../docs/ONBOARDING_AND_UX_AUDIT.md", import.meta.url);
const audit = await readFile(auditPath, "utf8");
const expectedIds = Array.from(
  { length: 56 },
  (_, index) => `UX-${String(index + 1).padStart(3, "0")}`
);
const requiredResolutionFields = [
  "Status",
  "Implemented fix",
  "Current code",
  "Automated evidence",
  "Migration/rollout implication",
  "Residual/manual limitation"
];
const failures = [];

const allIds = audit.match(/\bUX-\d{3}\b/g) ?? [];
for (const id of expectedIds) {
  const count = allIds.filter((candidate) => candidate === id).length;
  if (count !== 1) failures.push(`${id} occurs ${count} times; expected exactly once.`);
}
for (const id of new Set(allIds)) {
  if (!expectedIds.includes(id)) failures.push(`Unexpected audit ID ${id}.`);
}

const headingPattern = /^### (UX-\d{3}) — .+$/gm;
const headings = [...audit.matchAll(headingPattern)];
const headingIds = headings.map((match) => match[1]);
if (JSON.stringify(headingIds) !== JSON.stringify(expectedIds)) {
  failures.push("Finding headings are not the complete numeric UX-001…UX-056 sequence.");
}

for (let index = 0; index < headings.length; index += 1) {
  const heading = headings[index];
  const next = headings[index + 1];
  const section = audit.slice(heading.index, next?.index ?? audit.length);
  const resolutionCount = (section.match(/^\*\*Resolution\*\*$/gm) ?? []).length;
  if (resolutionCount !== 1) {
    failures.push(`${heading[1]} has ${resolutionCount} Resolution blocks; expected one.`);
  }
  for (const field of requiredResolutionFields) {
    const fieldPattern = new RegExp(`^- \\*\\*${field.replace("/", "\\/")}:\\*\\*`, "gm");
    const count = (section.match(fieldPattern) ?? []).length;
    if (count !== 1) failures.push(`${heading[1]} field "${field}" occurs ${count} times.`);
  }
  if (!/^- \*\*Residual\/manual limitation:\*\* .*\bOwner:/m.test(section)) {
    failures.push(`${heading[1]} residual/manual limitation does not name an Owner.`);
  }
  if (/^- \*\*Current code:\*\*.*src\/services\/sheets\/(?:admin|taskLog)\.ts/m.test(section)) {
    failures.push(`${heading[1]} cites a Sheets facade instead of an implementation module.`);
  }
}

const currentCodeLines = audit.match(/^- \*\*Current code:\*\*.*$/gm) ?? [];
for (const line of currentCodeLines) {
  const pathPattern =
    /`((?:(?:src|backend|scripts|docs|src-tauri|\.github)\/[^`]+)|README\.md|DISTRIBUTION_SETUP\.md)`/g;
  for (const match of line.matchAll(pathPattern)) {
    try {
      await access(new URL(`../${match[1]}`, import.meta.url));
    } catch {
      failures.push(`Current code path does not exist: ${match[1]}.`);
    }
  }
}

const expectedStatusCounts = new Map([
  ["Resolved—automated.", 49],
  ["Resolved—static/manual pending.", 5],
  ["Mitigated—platform constraint.", 2]
]);
for (const [status, expectedCount] of expectedStatusCounts) {
  const escaped = status.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const count = (audit.match(new RegExp(`^- \\*\\*Status:\\*\\* ${escaped}$`, "gm")) ?? [])
    .length;
  if (count !== expectedCount) {
    failures.push(`Status "${status}" occurs ${count} times; expected ${expectedCount}.`);
  }
}

const acceptanceSection = audit
  .split("## Acceptance criteria for the reported onboarding problem")[1]
  ?.split("## Final local verification evidence")[0] ?? "";
for (let number = 1; number <= 12; number += 1) {
  const id = `AC${String(number).padStart(2, "0")}`;
  const count = (acceptanceSection.match(new RegExp(`\\b${id}\\b`, "g")) ?? []).length;
  if (count !== 1) {
    failures.push(`${id} occurs ${count} times in the acceptance section; expected once.`);
  }
}

if (!audit.includes("src/features/onboarding/onboarding.acceptance.test.tsx")) {
  failures.push("Acceptance section does not cite the dedicated acceptance test file.");
}
if (!audit.includes("Date: 2026-07-15")) {
  failures.push("Audit closeout date is not 2026-07-15.");
}

if (failures.length > 0) {
  console.error("Audit structure violations:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  "Audit structure is complete: 56 unique numeric findings, required resolution fields, and AC01–AC12."
);
