import { afterEach, describe, expect, it, vi } from "vitest";
import { GoogleSheetsEmptyRolesVerifier } from "../src/drive/bootstrapVerifier.js";

describe("GoogleSheetsEmptyRolesVerifier", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("accepts only canonical headers with no role rows", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ values: [["Email", "Role", "Lab Member"]] }),
          { status: 200 }
        )
      )
    );

    await expect(
      new GoogleSheetsEmptyRolesVerifier().verify("drive-token", "admin-id")
    ).resolves.toBeUndefined();
  });

  it("rejects malformed Roles headers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ values: [["Name", "Permission", "Member"]] }),
          { status: 200 }
        )
      )
    );

    await expect(
      new GoogleSheetsEmptyRolesVerifier().verify("drive-token", "admin-id")
    ).rejects.toMatchObject({
      status: 409,
      code: "ROLES_SHEET_NOT_CANONICAL"
    });
  });
});
