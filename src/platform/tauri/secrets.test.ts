import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionSecretVaultError } from "../contracts";
import {
  tauriSessionSecretVault,
  verifyRealCredentialVaultRoundTrip
} from "./secrets";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

beforeEach(() => {
  invoke.mockReset();
});

describe("Tauri session secret adapter", () => {
  it("converts command failures into typed vault errors", async () => {
    invoke.mockRejectedValue("macOS Keychain is locked");

    const error = await tauriSessionSecretVault
      .load("member@example.com")
      .catch((caught) => caught);

    expect(error).toBeInstanceOf(SessionSecretVaultError);
    expect(error).toMatchObject({ operation: "load" });
    expect(error.message).toMatch(/keychain is locked/i);
  });

  it("requires an explicit call to invoke the isolated vault verifier", async () => {
    invoke.mockResolvedValue({
      schemaVersion: 1,
      accountLabel: "vault-verification-disposable@invalid",
      roundTripVerified: true,
      credentialDeleted: true
    });

    await expect(verifyRealCredentialVaultRoundTrip()).resolves.toMatchObject({
      roundTripVerified: true,
      credentialDeleted: true
    });
    expect(invoke).toHaveBeenCalledWith("verify_session_secret_vault", {
      optIn: true
    });
  });
});
