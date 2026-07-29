import { ApiError } from "../http/errors.js";
import type { DriveResource } from "../domain/types.js";

export interface DrivePermissionResult {
  fileId: string;
  purpose: DriveResource["purpose"];
  status: "created" | "alreadyGranted";
  permissionId?: string;
}

export interface DrivePermissionClient {
  createUserPermission(
    accessToken: string,
    resource: DriveResource,
    targetEmail: string
  ): Promise<DrivePermissionResult>;
  deletePermission(accessToken: string, fileId: string, permissionId: string): Promise<void>;
}

export class GoogleDrivePermissionClient implements DrivePermissionClient {
  async createUserPermission(
    accessToken: string,
    resource: DriveResource,
    targetEmail: string
  ): Promise<DrivePermissionResult> {
    const url = new URL(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(resource.fileId)}/permissions`
    );
    url.searchParams.set("sendNotificationEmail", "true");
    url.searchParams.set("supportsAllDrives", "true");
    url.searchParams.set("fields", "id");

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        type: "user",
        role: "writer",
        emailAddress: targetEmail
      })
    });

    const text = await response.text();
    if (response.ok) {
      const body = safeJson(text) as { id?: string };
      return {
        fileId: resource.fileId,
        purpose: resource.purpose,
        status: "created",
        ...(body.id ? { permissionId: body.id } : {})
      };
    }

    const reason = googleReason(text);
    if (response.status === 409 || reason === "duplicatePermission") {
      return {
        fileId: resource.fileId,
        purpose: resource.purpose,
        status: "alreadyGranted"
      };
    }
    throw driveError(response.status, reason);
  }

  async deletePermission(
    accessToken: string,
    fileId: string,
    permissionId: string
  ): Promise<void> {
    const url = new URL(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions/${encodeURIComponent(permissionId)}`
    );
    url.searchParams.set("supportsAllDrives", "true");
    const response = await fetch(url, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!response.ok && response.status !== 404) {
      const reason = googleReason(await response.text());
      throw driveError(response.status, reason);
    }
  }
}

function driveError(status: number, reason: string): ApiError {
  if (status === 401) {
    return new ApiError({
      status: 401,
      code: "DRIVE_TOKEN_EXPIRED",
      message: "Google rejected the delegated Drive access token.",
      action: "Request a fresh Drive token and retry. The service does not retain tokens."
    });
  }
  if (reason === "insufficientPermissions" || reason === "insufficientFilePermissions") {
    return new ApiError({
      status: 403,
      code: "DRIVE_SCOPE_OR_FILE_PERMISSION_MISSING",
      message: "The manager token lacks the required Drive scope or permission on a file.",
      action: "Reconnect Google with Drive consent and confirm the manager can share the file."
    });
  }
  if (reason === "domainPolicy" || reason === "sharingOutsideDomainNotAllowed") {
    return new ApiError({
      status: 403,
      code: "DRIVE_DOMAIN_POLICY_BLOCKED",
      message: "Google Workspace policy blocked this sharing operation.",
      action: "Ask the Workspace administrator to allow the share or use an approved account."
    });
  }
  if (reason === "cannotShareAcrossDomains" || reason === "ownershipRequired") {
    return new ApiError({
      status: 403,
      code: "DRIVE_OWNERSHIP_REQUIRED",
      message: "The signed-in manager is not allowed to create this file permission.",
      action: "Use the file owner or an organizer with sharing rights."
    });
  }
  if (status === 404) {
    return new ApiError({
      status: 404,
      code: "DRIVE_FILE_NOT_FOUND",
      message: "Google Drive could not find one of the authoritative files.",
      action: "Confirm the workbook still exists and the manager can access it."
    });
  }
  if (status === 429 || status >= 500) {
    return new ApiError({
      status: 503,
      code: "DRIVE_TEMPORARILY_UNAVAILABLE",
      message: "Google Drive could not process the permission request right now.",
      action: "Wait briefly and retry with a fresh access token.",
      retryable: true
    });
  }
  return new ApiError({
    status: 502,
    code: "DRIVE_PERMISSION_FAILED",
    message: "Google Drive rejected the permission request.",
    action: "Check file ownership, target account policy, and requested Drive scopes.",
    details: { googleReason: reason || "unknown" }
  });
}

function googleReason(text: string): string {
  const body = safeJson(text) as {
    error?: { errors?: Array<{ reason?: string }>; status?: string };
  };
  return body.error?.errors?.[0]?.reason ?? body.error?.status ?? "";
}

function safeJson(text: string): unknown {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}
