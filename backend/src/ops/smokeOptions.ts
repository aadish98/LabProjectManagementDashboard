import { z } from "zod";

export const DRIVE_ROLLBACK_MODE = "remove-created-permission-and-deactivate-member";

export interface DriveSmokeOptions {
  accessToken: string;
  labId: string;
  memberId: string;
  fileId: string;
  targetEmail: string;
  expectedMemberRevision: number;
  rollback: typeof DRIVE_ROLLBACK_MODE;
}

export interface SmokeOptions {
  baseUrl: string;
  timeoutMs: number;
  idToken?: string;
  drive?: DriveSmokeOptions;
}

const uuid = z.string().uuid();
const email = z.string().email().transform((value) => value.trim().toLowerCase());
const fileId = z.string().trim().min(1).max(300);

export function disposableContextConfirmation(input: {
  labId: string;
  memberId: string;
  fileId: string;
  targetEmail: string;
}): string {
  return `PROVISION_DISPOSABLE:${input.labId}:${input.memberId}:${input.fileId}:${input.targetEmail}`;
}

export function parseSmokeOptions(
  argv: string[],
  environment: NodeJS.ProcessEnv = process.env
): SmokeOptions {
  const parsedArgs = parseArgs(argv);
  rejectSecretArguments(parsedArgs);

  const baseUrl = parseBaseUrl(required(parsedArgs, "base-url"));
  const timeoutMs = parseTimeout(parsedArgs.get("timeout-ms") ?? "10000");
  const idToken = optionalSecret(environment.SMOKE_GOOGLE_ID_TOKEN);
  const accessToken = optionalSecret(environment.SMOKE_DRIVE_ACCESS_TOKEN);
  const driveEnabled = parsedArgs.get("drive-provision") === "true";
  const driveKeys = [
    "lab-id",
    "member-id",
    "file-id",
    "target-email",
    "expected-member-revision",
    "confirm-disposable-context",
    "rollback"
  ];

  if (!driveEnabled) {
    const unexpected = driveKeys.filter((key) => parsedArgs.has(key));
    if (unexpected.length > 0 || accessToken) {
      throw new Error(
        "Drive smoke options require the explicit --drive-provision flag; mutation is disabled by default."
      );
    }
    return {
      baseUrl,
      timeoutMs,
      ...(idToken ? { idToken } : {})
    };
  }

  if (!idToken || !accessToken) {
    throw new Error(
      "Drive smoke mode requires SMOKE_GOOGLE_ID_TOKEN and SMOKE_DRIVE_ACCESS_TOKEN."
    );
  }

  const labId = uuid.parse(required(parsedArgs, "lab-id"));
  const memberId = uuid.parse(required(parsedArgs, "member-id"));
  const expectedFileId = fileId.parse(required(parsedArgs, "file-id"));
  const targetEmail = email.parse(required(parsedArgs, "target-email"));
  const expectedMemberRevision = z.coerce
    .number()
    .int()
    .positive()
    .parse(required(parsedArgs, "expected-member-revision"));
  const rollback = required(parsedArgs, "rollback");
  if (rollback !== DRIVE_ROLLBACK_MODE) {
    throw new Error(`--rollback must equal ${DRIVE_ROLLBACK_MODE}.`);
  }

  const expectedConfirmation = disposableContextConfirmation({
    labId,
    memberId,
    fileId: expectedFileId,
    targetEmail
  });
  if (required(parsedArgs, "confirm-disposable-context") !== expectedConfirmation) {
    throw new Error(
      `--confirm-disposable-context must exactly identify the disposable context as ${expectedConfirmation}.`
    );
  }

  return {
    baseUrl,
    timeoutMs,
    idToken,
    drive: {
      accessToken,
      labId,
      memberId,
      fileId: expectedFileId,
      targetEmail,
      expectedMemberRevision,
      rollback
    }
  };
}

function parseArgs(argv: string[]): Map<string, string> {
  const parsed = new Map<string, string>();
  for (const argument of argv) {
    if (argument === "--drive-provision") {
      setOnce(parsed, "drive-provision", "true");
      continue;
    }
    const match = argument.match(/^--([a-z0-9-]+)=(.*)$/);
    if (!match?.[1]) {
      throw new Error(`Unknown smoke argument: ${argument}`);
    }
    setOnce(parsed, match[1], match[2] ?? "");
  }
  const allowed = new Set([
    "base-url",
    "timeout-ms",
    "drive-provision",
    "lab-id",
    "member-id",
    "file-id",
    "target-email",
    "expected-member-revision",
    "confirm-disposable-context",
    "rollback",
    "id-token",
    "drive-access-token"
  ]);
  for (const key of parsed.keys()) {
    if (!allowed.has(key)) throw new Error(`Unknown smoke option: --${key}`);
  }
  return parsed;
}

function setOnce(target: Map<string, string>, key: string, value: string): void {
  if (target.has(key)) throw new Error(`Duplicate smoke option: --${key}`);
  target.set(key, value);
}

function rejectSecretArguments(args: Map<string, string>): void {
  if (args.has("id-token") || args.has("drive-access-token")) {
    throw new Error(
      "Tokens are accepted only through SMOKE_GOOGLE_ID_TOKEN and SMOKE_DRIVE_ACCESS_TOKEN, never command-line arguments."
    );
  }
}

function required(args: Map<string, string>, key: string): string {
  const value = args.get(key)?.trim();
  if (!value) throw new Error(`Missing required smoke option: --${key}=...`);
  return value;
}

function parseBaseUrl(value: string): string {
  const url = new URL(value);
  const isLoopback =
    url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback)) {
    throw new Error("Smoke base URL must use HTTPS, except for an explicit loopback URL.");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("Smoke base URL cannot contain credentials, a query, or a fragment.");
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString().replace(/\/$/, "");
}

function parseTimeout(value: string): number {
  return z.coerce.number().int().min(1000).max(60000).parse(value);
}

function optionalSecret(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}
