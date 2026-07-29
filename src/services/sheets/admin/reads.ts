import type { AppConfig } from "../../../domain/app";
import { ADMIN_TAB_NAMES } from "../../../domain/app";
import { getValuesForSheet } from "../client";
import { extractIdFromUrl } from "../helpers";
import { fetchSpreadsheetMetadata } from "../metadata";
import { parseRegistry, parseRoles } from "./parsing";
import {
  describeAdminTabRepair,
  ensureHeaderRowMatches,
  findAdminTab
} from "./tabs";
import {
  ADMIN_REGISTRY_HEADERS,
  ADMIN_ROLES_HEADERS,
  type AdminWorkbookOverview
} from "./types";

export async function readAdminWorkbookOverview(
  config: AppConfig,
  accessToken: string
): Promise<AdminWorkbookOverview> {
  const spreadsheetId = extractIdFromUrl(config.adminSpreadsheetId);
  if (!spreadsheetId) {
    throw new Error(
      "Choose the Admin workbook in Team setup before managing Members."
    );
  }

  const metadata = await fetchSpreadsheetMetadata(spreadsheetId, accessToken);
  const registryTab = findAdminTab(metadata, ADMIN_TAB_NAMES.registry);
  const rolesTab = findAdminTab(metadata, ADMIN_TAB_NAMES.roles);
  const [registryRows, rolesRows] = await Promise.all([
    registryTab
      ? getValuesForSheet(
          spreadsheetId,
          registryTab.title,
          "A:Z",
          accessToken
        )
      : Promise.resolve([]),
    rolesTab
      ? getValuesForSheet(spreadsheetId, rolesTab.title, "A:Z", accessToken)
      : Promise.resolve([])
  ]);

  const parsedRegistry = parseRegistry(registryRows);
  const roles = parseRoles(rolesRows);
  const rolesHeadersCanonical =
    !!rolesTab &&
    ensureHeaderRowMatches(
      rolesRows[0] ?? [],
      ADMIN_ROLES_HEADERS.slice(0, 3)
    );
  const rolesHasDataRows = rolesRows
    .slice(1)
    .some((row) => row.some((cell) => String(cell ?? "").trim()));
  const rolesState: AdminWorkbookOverview["rolesState"] = !rolesTab
    ? "missing"
    : !rolesHeadersCanonical
      ? "invalid"
      : rolesHasDataRows
        ? "canonicalNonEmpty"
        : "canonicalEmpty";
  const setupRepairIssues = [
    describeAdminTabRepair(
      ADMIN_TAB_NAMES.registry,
      registryTab,
      registryRows,
      ADMIN_REGISTRY_HEADERS
    ),
    describeAdminTabRepair(
      ADMIN_TAB_NAMES.roles,
      rolesTab,
      rolesRows,
      ADMIN_ROLES_HEADERS
    )
  ].filter((issue): issue is string => !!issue);

  return {
    spreadsheetId: metadata.spreadsheetId,
    spreadsheetTitle: metadata.spreadsheetTitle,
    setupRepairIssues,
    registry: parsedRegistry.entries,
    registryProblems: parsedRegistry.problems,
    roles,
    rolesState
  };
}
