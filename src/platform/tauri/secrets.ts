import { invoke } from "@tauri-apps/api/core";
import {
  SessionSecretVaultError,
  type SessionSecretVault
} from "../contracts";

export interface VaultVerificationEvidence {
  schemaVersion: 1;
  accountLabel: string;
  roundTripVerified: true;
  credentialDeleted: true;
}

/**
 * Explicit diagnostic entry point only. Nothing in application startup calls
 * this function; packaged/debug release verification uses the Tauri binary's
 * --verify-credential-vault flag so the disposable value never enters JS.
 */
export async function verifyRealCredentialVaultRoundTrip(): Promise<VaultVerificationEvidence> {
  return invoke<VaultVerificationEvidence>("verify_session_secret_vault", {
    optIn: true
  });
}

export const tauriSessionSecretVault: SessionSecretVault = {
  async store(account: string, secret: string): Promise<void> {
    try {
      await invoke("store_session_secret", { account, secret });
    } catch (error) {
      throw new SessionSecretVaultError("store", error);
    }
  },

  async load(account: string): Promise<string | null> {
    try {
      return await invoke<string | null>("load_session_secret", { account });
    } catch (error) {
      throw new SessionSecretVaultError("load", error);
    }
  },

  async delete(account: string): Promise<void> {
    try {
      await invoke("delete_session_secret", { account });
    } catch (error) {
      throw new SessionSecretVaultError("delete", error);
    }
  }
};
