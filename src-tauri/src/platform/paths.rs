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

/// Bersihkan file cache audio sementara (tts-*.mp3, tts-*.wav, tts-in-*.txt)
/// yang lebih tua dari batas usia tertentu.
pub fn clean_cache_dir(app: &AppHandle, max_age: std::time::Duration) {
    clean_cache_path(&cache_dir(app), max_age);
}

/// Helper internal pembersihan direktori cache agar dapat diuji secara independen.
pub fn clean_cache_path(cache: &std::path::Path, max_age: std::time::Duration) -> usize {
    if !cache.exists() {
        return 0;
    }
    let now = std::time::SystemTime::now();
    let mut cleaned = 0;
    if let Ok(entries) = std::fs::read_dir(cache) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let name = path.file_name().and_then(|n| n.to_str()).unwrap_or_default();
            if name.starts_with("tts-") || name.starts_with("tts-in-") {
                if let Ok(meta) = entry.metadata() {
                    let mtime = meta.modified().unwrap_or(now);
                    if let Ok(age) = now.duration_since(mtime) {
                        if age >= max_age && std::fs::remove_file(&path).is_ok() {
                            cleaned += 1;
                        }
                    }
                }
            }
        }
    }
    cleaned
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_clean_cache_path_removes_old_tts_files() {
        let temp = std::env::temp_dir().join(format!("astra_test_cache_{}", std::time::UNIX_EPOCH.elapsed().unwrap().as_nanos()));
        std::fs::create_dir_all(&temp).unwrap();

        let old_tts = temp.join("tts-old.mp3");
        let new_tts = temp.join("tts-new.wav");
        let other_file = temp.join("other.txt");

        std::fs::write(&old_tts, b"old audio").unwrap();
        std::fs::write(&new_tts, b"new audio").unwrap();
        std::fs::write(&other_file, b"keep me").unwrap();

        // Bersihkan dengan max_age = 0 (hapus semua tts-*)
        let count = clean_cache_path(&temp, std::time::Duration::from_secs(0));
        assert_eq!(count, 2);
        assert!(!old_tts.exists());
        assert!(!new_tts.exists());
        assert!(other_file.exists()); // file non-tts tidak disentuh

        let _ = std::fs::remove_dir_all(&temp);
    }
}

