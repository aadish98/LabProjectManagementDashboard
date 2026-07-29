import type { EmployeeSheetColumnMap } from "../domain/app";
import type {
  BootstrapClaim,
  Invitation,
  Lab,
  ManagerFileProgress,
  Member,
  MemberConfig,
  Membership
} from "../domain/onboarding";
import type { RoleCapability } from "../domain/access";

export const BACKEND_BASE_URL = (import.meta.env.VITE_BACKEND_BASE_URL ?? "").trim().replace(/\/+$/, "");

type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
    action?: string;
    retryable?: boolean;
    requestId?: string;
    details?: Record<string, unknown>;
  };
};

export class OnboardingApiError extends Error {
  readonly kind: "configuration" | "identity" | "transport" | "http";
  readonly status?: number;
  readonly code: string;
  readonly action: string;
  readonly retryable: boolean;
  readonly requestId?: string;
  readonly details?: Record<string, unknown>;

  constructor(input: {
    kind: OnboardingApiError["kind"];
    message: string;
    code: string;
    action: string;
    status?: number;
    retryable?: boolean;
    requestId?: string;
    details?: Record<string, unknown>;
  }) {
    super(input.message);
    this.name = "OnboardingApiError";
    this.kind = input.kind;
    this.code = input.code;
    this.action = input.action;
    this.retryable = input.retryable ?? false;
    if (input.status !== undefined) this.status = input.status;
    if (input.requestId) this.requestId = input.requestId;
    if (input.details) this.details = input.details;
  }
}

export interface OnboardingApiOptions {
  baseUrl?: string;
  idToken?: string;
  driveAccessToken?: string;
  fetchImpl?: typeof fetch;
}

export interface MemberConfigInput {
  email: string;
  displayName: string;
  roles: RoleCapability[];
  spreadsheetId: string;
  taskLogUrl?: string;
  activeSheetName: string;
  proposedColumnMap: EmployeeSheetColumnMap;
}

export interface InvitationInput extends MemberConfigInput {
  expiresAt: string;
}

export class OnboardingApi {
  private readonly baseUrl: string;
  private readonly idToken: string;
  private readonly driveAccessToken?: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OnboardingApiOptions) {
    this.baseUrl = (options.baseUrl ?? BACKEND_BASE_URL).trim().replace(/\/+$/, "");
    this.idToken = options.idToken?.trim() ?? "";
    this.driveAccessToken = options.driveAccessToken?.trim() || undefined;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  getMemberships(): Promise<{ memberships: Membership[] }> {
    return this.request("/v1/me/memberships");
  }

  createBootstrapClaim(
    labName: string,
    adminSpreadsheetId: string,
    idempotencyKey = crypto.randomUUID()
  ): Promise<{ claim: BootstrapClaim; replayed: boolean }> {
    if (!this.driveAccessToken) {
      throw new OnboardingApiError({
        kind: "identity",
        code: "DRIVE_ACCESS_TOKEN_REQUIRED",
        message: "A fresh Google Drive token is required to verify the bootstrap workbook.",
        action: "Reconnect Google and retry the explicit lab claim."
      });
    }
    return this.request("/v1/labs/bootstrap", {
      method: "POST",
      body: { labName, adminSpreadsheetId },
      idempotencyKey,
      includeDriveToken: true
    });
  }

  claimBootstrap(
    claimId: string,
    idempotencyKey = crypto.randomUUID()
  ): Promise<{ lab: Lab; member: Member; replayed: boolean }> {
    return this.request(`/v1/labs/bootstrap/${encodeURIComponent(claimId)}/claim`, {
      method: "POST",
      body: {},
      idempotencyKey
    });
  }

  getMyInvitations(): Promise<{ invitations: Invitation[] }> {
    return this.request("/v1/me/invitations");
  }

  listMembers(labId: string): Promise<{ members: Member[] }> {
    return this.request(`/v1/labs/${encodeURIComponent(labId)}/members`);
  }

  listInvitations(labId: string): Promise<{ invitations: Invitation[] }> {
    return this.request(`/v1/labs/${encodeURIComponent(labId)}/invitations`);
  }

  getConfig(labId: string, memberId: string): Promise<{ config: MemberConfig }> {
    return this.request(
      `/v1/labs/${encodeURIComponent(labId)}/members/${encodeURIComponent(memberId)}/config`
    );
  }

  createInvitation(
    labId: string,
    input: InvitationInput,
    idempotencyKey = crypto.randomUUID()
  ): Promise<{ invitation: Invitation; member: Member; config: MemberConfig; replayed: boolean }> {
    return this.request(`/v1/labs/${encodeURIComponent(labId)}/invitations`, {
      method: "POST",
      body: input,
      idempotencyKey
    });
  }

  updateInvitation(
    labId: string,
    invitationId: string,
    expectedRevision: number,
    patch: Partial<Omit<InvitationInput, "email">>
  ): Promise<{ invitation: Invitation; member: Member; config: MemberConfig }> {
    return this.request(
      `/v1/labs/${encodeURIComponent(labId)}/invitations/${encodeURIComponent(invitationId)}`,
      { method: "PATCH", body: { expectedRevision, ...patch } }
    );
  }

  acceptInvitation(
    invitation: Pick<Invitation, "labId" | "id" | "revision">
  ): Promise<{ invitation: Invitation; member: Member }> {
    return this.request(
      `/v1/labs/${encodeURIComponent(invitation.labId)}/invitations/${encodeURIComponent(
        invitation.id
      )}/accept`,
      { method: "POST", body: { expectedRevision: invitation.revision } }
    );
  }

  updateMember(
    labId: string,
    memberId: string,
    expectedRevision: number,
    patch: Partial<Pick<Member, "displayName" | "roles" | "active">>
  ): Promise<{ member: Member }> {
    return this.request(
      `/v1/labs/${encodeURIComponent(labId)}/members/${encodeURIComponent(memberId)}`,
      { method: "PATCH", body: { expectedRevision, ...patch } }
    );
  }

  reactivateMember(
    labId: string,
    memberId: string,
    expectedRevision: number
  ): Promise<{ member: Member }> {
    return this.updateMember(labId, memberId, expectedRevision, { active: true });
  }

  updateMemberSetup(
    labId: string,
    memberId: string,
    expectedMemberRevision: number,
    expectedConfigRevision: number,
    member: Pick<Member, "displayName" | "roles" | "active">,
    config: Pick<
      MemberConfig,
      "spreadsheetId" | "taskLogUrl" | "activeSheetName" | "proposedColumnMap"
    >
  ): Promise<{ member: Member; config: MemberConfig }> {
    return this.request(
      `/v1/labs/${encodeURIComponent(labId)}/members/${encodeURIComponent(memberId)}/setup`,
      {
        method: "PATCH",
        body: {
          expectedMemberRevision,
          expectedConfigRevision,
          member,
          config
        }
      }
    );
  }

  deactivateMember(
    labId: string,
    memberId: string,
    expectedRevision: number,
    invitation?: Pick<Invitation, "id" | "revision">
  ): Promise<{ member: Member }> {
    const query = new URLSearchParams({ revision: String(expectedRevision) });
    if (invitation) {
      query.set("invitationId", invitation.id);
      query.set("invitationRevision", String(invitation.revision));
    }
    return this.request(
      `/v1/labs/${encodeURIComponent(labId)}/members/${encodeURIComponent(
        memberId
      )}?${query.toString()}`,
      { method: "DELETE" }
    );
  }

  updateConfig(
    labId: string,
    memberId: string,
    expectedRevision: number,
    patch: Partial<
      Pick<
        MemberConfig,
        | "spreadsheetId"
        | "taskLogUrl"
        | "activeSheetName"
        | "proposedColumnMap"
        | "acceptedColumnMap"
      >
    > & { columnReviewComplete?: boolean }
  ): Promise<{ config: MemberConfig; member: Member }> {
    return this.request(
      `/v1/labs/${encodeURIComponent(labId)}/members/${encodeURIComponent(memberId)}/config`,
      { method: "PATCH", body: { expectedRevision, ...patch } }
    );
  }

  recordPickerProof(
    labId: string,
    memberId: string,
    expectedRevision: number,
    spreadsheetId: string
  ): Promise<{ config: MemberConfig; member: Member }> {
    return this.request(
      `/v1/labs/${encodeURIComponent(labId)}/members/${encodeURIComponent(memberId)}/picker-proof`,
      { method: "POST", body: { expectedRevision, spreadsheetId } }
    );
  }

  getManagerFileProgress(
    labId: string,
    memberId: string
  ): Promise<{ member: Member; progress: ManagerFileProgress }> {
    return this.request(
      `/v1/labs/${encodeURIComponent(labId)}/members/${encodeURIComponent(
        memberId
      )}/manager-file-proof`
    );
  }

  recordManagerFileProof(
    labId: string,
    memberId: string,
    expectedRevision: number,
    selectedFileIds: string[]
  ): Promise<{ member: Member; progress: ManagerFileProgress }> {
    return this.request(
      `/v1/labs/${encodeURIComponent(labId)}/members/${encodeURIComponent(
        memberId
      )}/manager-file-proof`,
      {
        method: "POST",
        body: { expectedRevision, selectedFileIds }
      }
    );
  }

  provisionDrive(
    labId: string,
    memberId: string,
    expectedRevision: number
  ): Promise<{ config?: MemberConfig; member: Member; replayed: boolean }> {
    if (!this.driveAccessToken) {
      throw new OnboardingApiError({
        kind: "identity",
        code: "DRIVE_ACCESS_TOKEN_REQUIRED",
        message: "A fresh Google Drive token is required to provision exact file sharing.",
        action: "Reconnect Google, then retry Drive provisioning."
      });
    }
    return this.request(
      `/v1/labs/${encodeURIComponent(labId)}/members/${encodeURIComponent(
        memberId
      )}/drive-permissions`,
      { method: "POST", body: { expectedRevision }, includeDriveToken: true }
    );
  }

  private async request<T>(
    path: string,
    options: {
      method?: "GET" | "POST" | "PATCH" | "DELETE";
      body?: unknown;
      idempotencyKey?: string;
      includeDriveToken?: boolean;
    } = {}
  ): Promise<T> {
    if (!this.baseUrl) {
      throw new OnboardingApiError({
        kind: "configuration",
        code: "BACKEND_BASE_URL_REQUIRED",
        message: "The authoritative onboarding service is not configured.",
        action: "Set VITE_BACKEND_BASE_URL and restart the app."
      });
    }
    if (!this.idToken) {
      throw new OnboardingApiError({
        kind: "identity",
        code: "ID_TOKEN_REQUIRED",
        message: "The Google session has no ID token for backend authorization.",
        action: "Reconnect Google and try again."
      });
    }

    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: `Bearer ${this.idToken}`
    };
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;
    if (options.includeDriveToken && this.driveAccessToken) {
      headers["X-Google-Drive-Access-Token"] = this.driveAccessToken;
    }

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: options.method ?? "GET",
        headers,
        ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {})
      });
    } catch (cause) {
      throw new OnboardingApiError({
        kind: "transport",
        code: "BACKEND_UNREACHABLE",
        message: "The authoritative onboarding service could not be reached.",
        action: "Check the network connection and retry. Previously verified access is preserved.",
        retryable: true,
        details: { cause: cause instanceof Error ? cause.message : String(cause) }
      });
    }

    const text = await response.text();
    const payload = text ? safeJson(text) : {};
    if (!response.ok) {
      const error = (payload as ApiErrorBody).error;
      throw new OnboardingApiError({
        kind: "http",
        status: response.status,
        code: error?.code ?? "BACKEND_REQUEST_FAILED",
        message: error?.message ?? `The onboarding service returned HTTP ${response.status}.`,
        action: error?.action ?? "Retry after checking the current onboarding record.",
        retryable: error?.retryable ?? response.status >= 500,
        requestId: error?.requestId ?? response.headers.get("x-request-id") ?? undefined,
        details: error?.details
      });
    }
    return payload as T;
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}
