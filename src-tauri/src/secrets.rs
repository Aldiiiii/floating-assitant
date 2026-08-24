//! Penyimpanan rahasia via OS keychain (Windows Credential Manager /
//! Linux Secret Service). API key tidak lagi tersimpan plaintext di settings.json.

use keyring::Entry;

const SERVICE: &str = "astra";

fn entry(account: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, account).map_err(|e| {
        format!(
            "Keychain OS tidak tersedia ({e}).\n\nDi Linux pastikan gnome-keyring \
             / Secret Service berjalan."
        )
    })
}

/// Baca secret utk penggunaan internal backend (mis. provider pencarian).
pub fn get(account: &str) -> Option<String> {
    entry(account).ok().and_then(|e| e.get_password().ok())
}

#[tauri::command]
pub fn search_keys_get() -> Result<serde_json::Value, String> {
    let read = |account: &str| -> Option<String> {
        match entry(account) {
            Ok(e) => e.get_password().ok(),
            Err(_) => None,
        }
    };
    Ok(serde_json::json!({
        "brave": read("brave-api-key"),
        "tavily": read("tavily-api-key"),
    }))
}

/// Some(value) = simpan/ubah; None = hapus.
#[tauri::command]
pub fn search_keys_set(
    brave: Option<String>,
    tavily: Option<String>,
) -> Result<(), String> {
    if let Some(v) = brave.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        set_secret("brave-api-key", v)?;
    } else {
        delete_secret("brave-api-key")?;
    }
    if let Some(v) = tavily.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        set_secret("tavily-api-key", v)?;
    } else {
        delete_secret("tavily-api-key")?;
    }
    Ok(())
}

fn set_secret(account: &str, value: &str) -> Result<(), String> {
    entry(account)?
        .set_password(value)
        .map_err(|e| format!("Gagal menyimpan secret '{account}': {e}"))
}

fn delete_secret(account: &str) -> Result<(), String> {
    match entry(account) {
        Ok(e) => match e.delete_credential() {
            Ok(_) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(err) => Err(format!("Gagal menghapus secret '{account}': {err}")),
        },
        Err(_) => Ok(()), // keychain tak tersedia = tidak ada yang perlu dihapus
    }
}
