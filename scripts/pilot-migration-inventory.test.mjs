import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildPilotMigrationInventory } from "./pilot-migration-inventory.mjs";

describe("pilot migration dry-run inventory", () => {
  it("classifies redacted legacy metadata without mutating the fixture", async () => {
    const fixture = JSON.parse(
      await readFile(path.resolve("scripts/pilot-migration.sample.json"), "utf8")
    );
    const before = structuredClone(fixture);

    const evidence = buildPilotMigrationInventory(fixture, {
      generatedAt: "2026-07-15T12:30:00.000Z",
      sourceName: "pilot-migration.sample.json"
    });

    expect(fixture).toEqual(before);
    expect(evidence).toMatchObject({
      schemaVersion: "pilot-migration-inventory/v1",
      mutationMode: "none",
      source: { redacted: true },
      summary: {
        people: 2,
        activePeople: 2,
        status: "reviewRequired"
      }
    });
    expect(evidence.findings.duplicateEmails).toHaveLength(1);
    expect(evidence.findings.duplicatePeople).toHaveLength(1);
    expect(evidence.findings.duplicateTaskLogIds).toHaveLength(1);
    expect(evidence.findings.missingStableIds).toEqual(
      expect.arrayContaining([
        { entity: "member", person: "legacy-person-duplicate" },
        { entity: "invitation", person: "legacy-person-duplicate" }
      ])
    );
    expect(evidence.findings.tabIssues).toContainEqual({
      person: "legacy-person-duplicate",
      code: "ACTIVE_TAB_STALE",
      activeTab: "Old Tasks"
    });
    expect(evidence.findings.mapIssues).toContainEqual({
      person: "legacy-person-duplicate",
      code: "MAPPED_HEADER_MISSING",
      field: "status",
      header: "Status"
    });
    expect(evidence.findings.taskMetadataIssues).toEqual(
      expect.arrayContaining([
        {
          person: "legacy-person-duplicate",
          code: "TASK_ID_MISSING",
          row: 2
        },
        {
          person: "legacy-person-duplicate",
          code: "TASK_ID_DUPLICATE",
          taskId: "duplicate-redacted",
          rows: [3, 4]
        }
      ])
    );
    expect(evidence.lifecycle).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ person: "legacy-manager-01", state: "ready" }),
        expect.objectContaining({
          person: "legacy-person-duplicate",
          state: "invited"
        })
      ])
    );
    expect(evidence.roleFileSets).toContainEqual({
      person: "legacy-manager-01",
      roles: ["employee", "manager"],
      requiredSpreadsheetIds: [
        "admin_workbook_redacted",
        "task_log_redacted_001"
      ]
    });
  });
});
