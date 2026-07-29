use keyring::{Entry, Error as KeyringError};
use serde::Serialize;
use std::{
    process,
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};

const SESSION_SECRET_SERVICE: &str = "com.labworkflow.desktop.google-oauth";
const MAX_ACCOUNT_LENGTH: usize = 320;
const MAX_SECRET_LENGTH: usize = 64 * 1024;
static VERIFICATION_SEQUENCE: AtomicU64 = AtomicU64::new(0);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultVerificationEvidence {
    schema_version: u8,
    account_label: String,
    round_trip_verified: bool,
    credential_deleted: bool,
}

struct DisposableCredential {
    entry: Entry,
    armed: bool,
}

impl DisposableCredential {
    fn delete(&mut self) -> Result<(), String> {
        match self.entry.delete_credential() {
            Ok(()) | Err(KeyringError::NoEntry) => {
                self.armed = false;
                Ok(())
            }
            Err(err) => Err(format!(
                "Could not delete the disposable verification credential: {err}"
            )),
        }
    }
}

impl Drop for DisposableCredential {
    fn drop(&mut self) {
        if self.armed {
            let _ = self.entry.delete_credential();
        }
    }
}

fn normalize_account(account: &str) -> Result<String, String> {
    let normalized = account.trim().to_lowercase();
    if normalized.is_empty() {
        return Err("A session-secret account is required.".into());
    }
    if normalized.len() > MAX_ACCOUNT_LENGTH || normalized.chars().any(char::is_control) {
        return Err("The session-secret account is invalid.".into());
    }
    Ok(normalized)
}

fn credential_entry(account: &str) -> Result<Entry, String> {
    Entry::new(SESSION_SECRET_SERVICE, account)
        .map_err(|err| format!("Could not open the operating-system credential vault: {err}"))
}

fn unique_verification_material() -> Result<(String, String), String> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|err| format!("Could not create a disposable vault label: {err}"))?
        .as_nanos();
    let sequence = VERIFICATION_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    let nonce = format!("{}-{timestamp}-{sequence}", process::id());
    Ok((
        format!("vault-verification-{nonce}@invalid"),
        format!("disposable-vault-verification-value-{nonce}"),
    ))
}

pub fn verify_session_secret_vault_round_trip() -> Result<VaultVerificationEvidence, String> {
    let (account, secret) = unique_verification_material()?;
    let normalized_account = normalize_account(&account)?;
    let entry = credential_entry(&normalized_account)?;
    let mut disposable = DisposableCredential { entry, armed: true };

    let verification_result: Result<(), String> = (|| {
        disposable.entry.set_password(&secret).map_err(|err| {
            format!("Could not store the disposable verification credential: {err}")
        })?;
        let loaded = disposable.entry.get_password().map_err(|err| {
            format!("Could not reload the disposable verification credential: {err}")
        })?;
        if loaded != secret {
            return Err("The operating-system credential vault returned a different value.".into());
        }
        Ok(())
    })();

    let deletion_result = disposable.delete();
    if let Err(error) = deletion_result {
        return Err(error);
    }
    verification_result?;

    Ok(VaultVerificationEvidence {
        schema_version: 1,
        account_label: normalized_account,
        round_trip_verified: true,
        credential_deleted: true,
    })
}

#[tauri::command]
pub async fn store_session_secret(account: String, secret: String) -> Result<(), String> {
    let account = normalize_account(&account)?;
    if secret.is_empty() || secret.len() > MAX_SECRET_LENGTH {
        return Err("The session secret is empty or too large.".into());
    }

    tauri::async_runtime::spawn_blocking(move || {
        credential_entry(&account)?
            .set_password(&secret)
            .map_err(|err| format!("Could not store the session secret: {err}"))
    })
    .await
    .map_err(|err| format!("The credential-vault task failed: {err}"))?
}

#[tauri::command]
pub async fn load_session_secret(account: String) -> Result<Option<String>, String> {
    let account = normalize_account(&account)?;

    tauri::async_runtime::spawn_blocking(move || {
        let entry = credential_entry(&account)?;
        match entry.get_password() {
            Ok(secret) => Ok(Some(secret)),
            Err(KeyringError::NoEntry) => Ok(None),
            Err(err) => Err(format!("Could not load the session secret: {err}")),
        }
    })
    .await
    .map_err(|err| format!("The credential-vault task failed: {err}"))?
}

#[tauri::command]
pub async fn delete_session_secret(account: String) -> Result<(), String> {
    let account = normalize_account(&account)?;

    tauri::async_runtime::spawn_blocking(move || {
        let entry = credential_entry(&account)?;
        match entry.delete_credential() {
            Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
            Err(err) => Err(format!("Could not delete the session secret: {err}")),
        }
    })
    .await
    .map_err(|err| format!("The credential-vault task failed: {err}"))?
}

#[tauri::command]
pub async fn verify_session_secret_vault(
    opt_in: bool,
) -> Result<VaultVerificationEvidence, String> {
    if !opt_in {
        return Err("Credential-vault verification requires explicit opt-in.".into());
    }

    tauri::async_runtime::spawn_blocking(verify_session_secret_vault_round_trip)
        .await
        .map_err(|err| format!("The credential-vault verification task failed: {err}"))?
}

#[cfg(test)]
mod tests {
    use super::{normalize_account, verify_session_secret_vault_round_trip};

    #[test]
    fn normalizes_account_names() {
        assert_eq!(
            normalize_account("  Scientist@Example.COM ").unwrap(),
            "scientist@example.com"
        );
    }

    #[test]
    fn rejects_empty_or_control_character_accounts() {
        assert!(normalize_account("  ").is_err());
        assert!(normalize_account("person@example.com\nother").is_err());
    }

    #[test]
    #[ignore = "explicit opt-in: writes and deletes one disposable real OS credential"]
    fn real_os_vault_round_trip() {
        let evidence = verify_session_secret_vault_round_trip().unwrap();
        assert!(evidence.round_trip_verified);
        assert!(evidence.credential_deleted);
        assert!(evidence.account_label.starts_with("vault-verification-"));
    }
}
