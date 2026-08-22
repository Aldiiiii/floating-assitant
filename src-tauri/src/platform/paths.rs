//! Path penyimpanan cross-platform. Semua data besar (model, binary sidecar,
//! cache audio) berada di bawah app data directory Tauri:
//!   Windows: %APPDATA%/<identifier>/...
//!   Linux:   ~/.local/share/<identifier>/...

use std::path::PathBuf;
use tauri::{AppHandle, Manager};

fn base_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
}

pub fn models_dir(app: &AppHandle) -> PathBuf {
    base_dir(app).join("models")
}

pub fn bin_dir(app: &AppHandle) -> PathBuf {
    base_dir(app).join("bin")
}

pub fn cache_dir(app: &AppHandle) -> PathBuf {
    base_dir(app).join("cache")
}

/// Buat direktori bila belum ada.
pub fn ensure_dir(path: &PathBuf) -> Result<(), String> {
    std::fs::create_dir_all(path).map_err(|e| format!("Gagal membuat folder {}: {e}", path.display()))
}
