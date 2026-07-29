import {
  disposableContextConfirmation,
  parseSmokeOptions,
  type DriveSmokeOptions,
  type SmokeOptions
} from "../src/ops/smokeOptions.js";

interface CheckEvidence {
  check: string;
  outcome: "passed";
  httpStatus: number;
  requestId?: string;
  details?: Record<string, string | number | boolean>;
}

interface SmokeEvidence {
  schemaVersion: 1;
  checkedAt: string;
  baseUrl: string;
  mutationMode: "disabled" | "disposable-drive-provisioning";
  checks: CheckEvidence[];
}

async function main(): Promise<void> {
  const options = parseSmokeOptions(process.argv.slice(2));
  const evidence: SmokeEvidence = {
    schemaVersion: 1,
    checkedAt: new Date().toISOString(),
    baseUrl: options.baseUrl,
    mutationMode: options.drive ? "disposable-drive-provisioning" : "disabled",
    checks: []
  };

  await checkHealth(options, evidence);
  await checkReadiness(options, evidence);
  await checkUnauthenticatedBoundary(options, evidence);
  if (options.idToken) await checkAuthenticatedDiscovery(options, evidence);
  if (options.drive) await checkDisposableDriveProvisioning(options, options.drive, evidence);

  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

async function checkHealth(options: SmokeOptions, evidence: SmokeEvidence): Promise<void> {
  const result = await requestJson(options, "/healthz");
  assertStatus(result, 200, "health");
  assertProtectionHeaders(result, "health");
  assert(
    object(result.body).status === "ok" && object(result.body).check === "process",
    "Health response did not contain the expected process check."
  );
  evidence.checks.push(checkEvidence("health", result));
}

async function checkReadiness(options: SmokeOptions, evidence: SmokeEvidence): Promise<void> {
  const result = await requestJson(options, "/readyz");
  assertStatus(result, 200, "Firestore readiness");
  assertProtectionHeaders(result, "Firestore readiness");
  const body = object(result.body);
  assert(
    body.status === "ready" && object(body.checks).firestore === "ok",
    "Readiness response did not prove Firestore access."
  );
  evidence.checks.push(checkEvidence("firestore-readiness", result));
}

async function checkUnauthenticatedBoundary(
  options: SmokeOptions,
  evidence: SmokeEvidence
): Promise<void> {
  const result = await requestJson(options, "/v1/me/invitations");
  assertStatus(result, 401, "unauthenticated /v1 boundary");
  assertProtectionHeaders(result, "unauthenticated /v1 boundary");
  assert(
    object(object(result.body).error).code === "ID_TOKEN_REQUIRED",
    "Unauthenticated /v1 request did not return ID_TOKEN_REQUIRED."
  );
  evidence.checks.push(checkEvidence("unauthenticated-v1-rejected", result));
}

async function checkAuthenticatedDiscovery(
  options: SmokeOptions & { idToken?: string },
  evidence: SmokeEvidence
): Promise<void> {
  const headers = { Authorization: `Bearer ${options.idToken}` };
  const [memberships, invitations] = await Promise.all([
    requestJson(options, "/v1/me/memberships", { headers }),
    requestJson(options, "/v1/me/invitations", { headers })
  ]);
  assertStatus(memberships, 200, "authenticated membership discovery");
  assertStatus(invitations, 200, "authenticated invitation discovery");
  assertProtectionHeaders(memberships, "authenticated membership discovery");
  assertProtectionHeaders(invitations, "authenticated invitation discovery");
  const membershipList = object(memberships.body).memberships;
  const invitationList = object(invitations.body).invitations;
  assert(Array.isArray(membershipList), "Membership discovery response was not an array.");
  assert(Array.isArray(invitationList), "Invitation discovery response was not an array.");
  evidence.checks.push({
    ...checkEvidence("authenticated-membership-discovery", memberships),
    details: { resultCount: membershipList.length }
  });
  evidence.checks.push({
    ...checkEvidence("authenticated-invitation-discovery", invitations),
    details: { resultCount: invitationList.length }
  });
}

async function checkDisposableDriveProvisioning(
  options: SmokeOptions & { idToken?: string },
  drive: DriveSmokeOptions,
  evidence: SmokeEvidence
): Promise<void> {
  const authorization = { Authorization: `Bearer ${options.idToken}` };
  const basePath = `/v1/labs/${encodeURIComponent(drive.labId)}/members/${encodeURIComponent(drive.memberId)}`;
  const [memberResult, configResult] = await Promise.all([
    requestJson(options, basePath, { headers: authorization }),
    requestJson(options, `${basePath}/config`, { headers: authorization })
  ]);
  assertStatus(memberResult, 200, "disposable member preflight");
  assertStatus(configResult, 200, "disposable config preflight");

  const member = object(object(memberResult.body).member);
  const config = object(object(configResult.body).config);
  assert(member.id === drive.memberId && member.labId === drive.labId, "Member context mismatch.");
  assert(
    member.normalizedEmail === drive.targetEmail &&
      member.email === drive.targetEmail,
    "Disposable target email does not exactly match the authoritative member."
  );
  assert(member.active === true, "Disposable member must be active before provisioning.");
  assert(member.revision === drive.expectedMemberRevision, "Disposable member revision changed.");
  assert(
    object(member.onboarding).status === "needsSharing",
    "Disposable member must be in needsSharing."
  );
  assert(
    Array.isArray(member.roles) &&
      member.roles.includes("employee") &&
      !member.roles.includes("manager") &&
      !member.roles.includes("pi"),
    "Controlled Drive smoke permits an employee-only disposable member."
  );
  assert(
    config.memberId === drive.memberId &&
      config.labId === drive.labId &&
      config.spreadsheetId === drive.fileId,
    "Disposable file context does not exactly match the authoritative member config."
  );

  const provisionResult = await requestJson(options, `${basePath}/drive-permissions`, {
    method: "POST",
    headers: {
      ...authorization,
      "Content-Type": "application/json",
      "X-Google-Drive-Access-Token": drive.accessToken
    },
    body: JSON.stringify({ expectedRevision: drive.expectedMemberRevision })
  });
  assertStatus(provisionResult, 200, "controlled Drive provisioning");
  const body = object(provisionResult.body);
  const results = body.results;
  const nextMember = object(body.member);
  assert(Array.isArray(results) && results.length === 1, "Expected exactly one Drive result.");
  const permission = object(results[0]);
  assert(permission.fileId === drive.fileId, "Provisioned Drive file did not match confirmation.");
  assert(
    nextMember.id === drive.memberId && typeof nextMember.revision === "number",
    "Provisioning response did not include the expected member revision."
  );

  let driveRollback = "preexisting-permission-not-deleted";
  let rollbackFailure: Error | undefined;
  if (permission.status === "created") {
    const permissionId = stringValue(permission.permissionId, "Created permission ID is missing.");
    try {
      await deleteDrivePermission(options, drive, permissionId);
      driveRollback = "created-permission-removed";
    } catch (error) {
      rollbackFailure = new Error(
        `Drive rollback failed for file ${drive.fileId}, permission ${permissionId}: ${toError(error).message}`
      );
      driveRollback = "created-permission-removal-failed";
    }
  } else if (permission.status !== "alreadyGranted") {
    rollbackFailure = new Error("Drive provisioning returned an unknown permission status.");
    driveRollback = "unknown-permission-status";
  }

  const deactivateResult = await requestJson(
    options,
    `${basePath}?revision=${encodeURIComponent(String(nextMember.revision))}`,
    { method: "DELETE", headers: authorization }
  );
  assertStatus(deactivateResult, 200, "disposable member deactivation rollback");
  assert(
    object(object(deactivateResult.body).member).active === false,
    "Disposable member rollback did not deactivate the member."
  );

  evidence.checks.push({
    ...checkEvidence("controlled-drive-provisioning", provisionResult),
    details: {
      labId: drive.labId,
      memberId: drive.memberId,
      fileId: drive.fileId,
      confirmation: disposableContextConfirmation(drive),
      permissionStatus: String(permission.status),
      driveRollback,
      memberRollback: "deactivated"
    }
  });

  if (permission.status === "alreadyGranted") {
    throw new Error(
      "Disposable context already had the Drive permission. The member was deactivated, but the pre-existing permission was not removed."
    );
  }
  if (rollbackFailure) throw rollbackFailure;
}

async function deleteDrivePermission(
  options: SmokeOptions,
  drive: DriveSmokeOptions,
  permissionId: string
): Promise<void> {
  const url = new URL(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(drive.fileId)}/permissions/${encodeURIComponent(permissionId)}`
  );
  url.searchParams.set("supportsAllDrives", "true");
  const response = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${drive.accessToken}` },
    signal: AbortSignal.timeout(options.timeoutMs)
  });
  if (!response.ok) {
    throw new Error(`Drive permission rollback failed with HTTP ${response.status}.`);
  }
}

interface HttpResult {
  status: number;
  headers: Headers;
  body: unknown;
}

async function requestJson(
  options: SmokeOptions,
  path: string,
  init: RequestInit = {}
): Promise<HttpResult> {
  const response = await fetch(`${options.baseUrl}${path}`, {
    ...init,
    redirect: "error",
    signal: AbortSignal.timeout(options.timeoutMs)
  });
  const text = await response.text();
  let body: unknown = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`${path} returned a non-JSON response with HTTP ${response.status}.`);
    }
  }
  return { status: response.status, headers: response.headers, body };
}

function checkEvidence(check: string, result: HttpResult): CheckEvidence {
  const requestId = result.headers.get("x-request-id") ?? undefined;
  return {
    check,
    outcome: "passed",
    httpStatus: result.status,
    ...(requestId ? { requestId } : {})
  };
}

function assertProtectionHeaders(result: HttpResult, label: string): void {
  assert(result.headers.get("cache-control") === "no-store", `${label} is missing no-store.`);
  assert(
    result.headers.get("x-content-type-options") === "nosniff",
    `${label} is missing nosniff.`
  );
  assert(Boolean(result.headers.get("x-request-id")), `${label} is missing a request ID.`);
}

function assertStatus(result: HttpResult, expected: number, label: string): void {
  assert(
    result.status === expected,
    `${label} returned HTTP ${result.status}; expected ${expected}.`
  );
}

function object(value: unknown): Record<string, any> {
  return value !== null && typeof value === "object" ? (value as Record<string, any>) : {};
}

function stringValue(value: unknown, message: string): string {
  if (typeof value !== "string" || !value) throw new Error(message);
  return value;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error("Unknown smoke failure.");
}

void main().catch((error: unknown) => {
  const safeMessage = toError(error).message;
  process.stderr.write(`Smoke test failed: ${safeMessage}\n`);
  process.exitCode = 1;
});
