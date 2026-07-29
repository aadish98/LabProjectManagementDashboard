import { describe, expect, it } from "vitest";
import {
  DRIVE_ROLLBACK_MODE,
  disposableContextConfirmation,
  parseSmokeOptions
} from "../src/ops/smokeOptions.js";

const labId = "9f62dce9-752e-4c39-91b3-98e35fffd1e9";
const memberId = "ad0de8ec-6bce-4c26-9f3a-b5ca56e70c86";
const fileId = "disposable-file-id";
const targetEmail = "disposable@example.com";

function driveArgs(): string[] {
  return [
    "--base-url=https://lab-workflow.example.run.app",
    "--drive-provision",
    `--lab-id=${labId}`,
    `--member-id=${memberId}`,
    `--file-id=${fileId}`,
    `--target-email=${targetEmail}`,
    "--expected-member-revision=3",
    `--rollback=${DRIVE_ROLLBACK_MODE}`,
    `--confirm-disposable-context=${disposableContextConfirmation({
      labId,
      memberId,
      fileId,
      targetEmail
    })}`
  ];
}

describe("smoke option parsing", () => {
  it("defaults to non-mutating checks without tokens", () => {
    expect(
      parseSmokeOptions(["--base-url=https://lab-workflow.example.run.app/"], {})
    ).toEqual({
      baseUrl: "https://lab-workflow.example.run.app",
      timeoutMs: 10000
    });
  });

  it("enables authenticated discovery only when the ID token is explicitly supplied", () => {
    expect(
      parseSmokeOptions(["--base-url=http://127.0.0.1:8080"], {
        SMOKE_GOOGLE_ID_TOKEN: "short-lived-id-token"
      })
    ).toMatchObject({
      baseUrl: "http://127.0.0.1:8080",
      idToken: "short-lived-id-token"
    });
  });

  it("rejects secrets passed in process-visible command arguments", () => {
    expect(() =>
      parseSmokeOptions(
        [
          "--base-url=https://lab-workflow.example.run.app",
          "--id-token=must-not-appear-in-process-list"
        ],
        {}
      )
    ).toThrow(/only through SMOKE_GOOGLE_ID_TOKEN/);
  });

  it("rejects Drive context unless mutation is explicitly enabled", () => {
    expect(() =>
      parseSmokeOptions(
        [
          "--base-url=https://lab-workflow.example.run.app",
          `--lab-id=${labId}`
        ],
        {}
      )
    ).toThrow(/mutation is disabled by default/);
  });

  it("requires both short-lived tokens for Drive smoke mode", () => {
    expect(() =>
      parseSmokeOptions(driveArgs(), {
        SMOKE_GOOGLE_ID_TOKEN: "short-lived-id-token"
      })
    ).toThrow(/SMOKE_GOOGLE_ID_TOKEN and SMOKE_DRIVE_ACCESS_TOKEN/);
  });

  it("requires exact disposable lab, member, file, and email confirmation", () => {
    const args = driveArgs().map((argument) =>
      argument.startsWith("--confirm-disposable-context=")
        ? "--confirm-disposable-context=PROVISION_DISPOSABLE:wrong"
        : argument
    );
    expect(() =>
      parseSmokeOptions(args, {
        SMOKE_GOOGLE_ID_TOKEN: "short-lived-id-token",
        SMOKE_DRIVE_ACCESS_TOKEN: "short-lived-drive-token"
      })
    ).toThrow(/must exactly identify the disposable context/);
  });

  it("parses the fully confirmed disposable Drive mode", () => {
    expect(
      parseSmokeOptions(driveArgs(), {
        SMOKE_GOOGLE_ID_TOKEN: "short-lived-id-token",
        SMOKE_DRIVE_ACCESS_TOKEN: "short-lived-drive-token"
      })
    ).toMatchObject({
      drive: {
        labId,
        memberId,
        fileId,
        targetEmail,
        expectedMemberRevision: 3,
        rollback: DRIVE_ROLLBACK_MODE
      }
    });
  });

  it("requires HTTPS except on loopback", () => {
    expect(() =>
      parseSmokeOptions(["--base-url=http://lab-workflow.example.run.app"], {})
    ).toThrow(/must use HTTPS/);
  });
});
