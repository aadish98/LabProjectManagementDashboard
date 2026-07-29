fn main() {
    let manifest = tauri_build::AppManifest::new().commands(&[
        "open_drive_picker",
        "store_session_secret",
        "load_session_secret",
        "delete_session_secret",
        "verify_session_secret_vault",
    ]);
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(manifest))
        .expect("failed to build Tauri application permissions");
}
