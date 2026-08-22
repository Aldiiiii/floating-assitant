//! Manajemen model voice: manifest, download streaming dengan progress,
//! verifikasi sha256 (opsional), atomic rename, dan ekstraksi arsip.

use std::collections::{BTreeMap, HashSet};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::platform::paths;

const MANIFEST_JSON: &str = include_str!("models.manifest.json");

#[derive(Deserialize)]
struct Manifest {
    #[serde(flatten)]
    entries: BTreeMap<String, ModelEntry>,
}

#[derive(Deserialize, Clone)]
pub struct ModelEntry {
    #[serde(rename = "type")]
    pub kind: String,
    pub url: String,
    pub sha256: Option<String>,
    pub size: Option<u64>,
    pub dest: String,
}

#[derive(Clone, Serialize)]
struct ProgressPayload {
    key: String,
    downloaded: u64,
    total: Option<u64>,
}

/// Registry download aktif untuk mencegah duplikasi paralel.
#[derive(Default)]
pub struct DownloadRegistry(pub Mutex<HashSet<String>>);

fn manifest() -> Result<Manifest, String> {
    serde_json::from_str(MANIFEST_JSON).map_err(|e| format!("Manifest model rusak: {e}"))
}

pub fn entry(key: &str) -> Result<ModelEntry, String> {
    manifest()?
        .entries
        .get(key)
        .cloned()
        .ok_or_else(|| format!("Model \"{key}\" tidak dikenal."))
}

/// Path final artefak, relatif terhadap app data dir
/// (dest di manifest sudah memuat prefix "models/" atau "bin/").
pub fn dest_path(app: &AppHandle, entry: &ModelEntry) -> PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join(&entry.dest)
}

pub fn is_installed(app: &AppHandle, key: &str) -> bool {
    match entry(key) {
        Ok(e) => dest_path(app, &e).exists(),
        Err(_) => false,
    }
}

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn verify_sha256(path: &PathBuf, expected: &Option<String>) -> Result<(), String> {
    let Some(expected) = expected.as_deref().map(str::trim).filter(|s| !s.is_empty()) else {
        return Ok(());
    };
    let bytes = std::fs::read(path).map_err(|e| format!("Gagal membaca file: {e}"))?;
    let hash = hex_encode(&Sha256::digest(&bytes));
    if !hash.eq_ignore_ascii_case(expected) {
        let _ = std::fs::remove_file(path);
        return Err(format!(
            "Verifikasi sha256 gagal untuk {}.\n\nFile dihapus agar tidak dipakai \
             dalam kondisi korup.",
            path.display()
        ));
    }
    Ok(())
}

async fn download_to(
    app: &AppHandle,
    key: &str,
    url: &str,
    target: &PathBuf,
    expected_sha: Option<String>,
    fallback_size: Option<u64>,
) -> Result<(), String> {
    if let Some(parent) = target.parent() {
        paths::ensure_dir(&parent.to_path_buf())?;
    }
    let part = target.with_extension("part");

    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let mut resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Download gagal: {e}\n\nPeriksa koneksi internet."))?;

    if !resp.status().is_success() {
        return Err(format!(
            "Download gagal: server merespons {}.\n\nURL: {url}",
            resp.status()
        ));
    }

    let total = resp.content_length().or(fallback_size);
    let mut file = std::fs::File::create(&part).map_err(|e| e.to_string())?;
    let mut downloaded: u64 = 0;
    let mut last_emit: u64 = 0;

    while let Some(chunk) = resp
        .chunk()
        .await
        .map_err(|e| format!("Koneksi terputus saat download: {e}"))?
    {
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        downloaded += chunk.len() as u64;
        if downloaded - last_emit > 512 * 1024 {
            last_emit = downloaded;
            let _ = app.emit(
                "model-progress",
                ProgressPayload {
                    key: key.to_string(),
                    downloaded,
                    total,
                },
            );
        }
    }
    file.flush().ok();
    drop(file);

    let _ = app.emit(
        "model-progress",
        ProgressPayload {
            key: key.to_string(),
            downloaded,
            total,
        },
    );

    verify_sha256(&part, &expected_sha)?;
    // Atomic move dalam volume yang sama; file .part tidak pernah dianggap valid.
    std::fs::rename(&part, target).map_err(|e| {
        let _ = std::fs::remove_file(&part);
        format!("Gagal memfinalisasi file: {e}")
    })?;

    Ok(())
}

fn extract_zip(archive_path: &PathBuf, out_dir: &PathBuf) -> Result<(), String> {
    let file = std::fs::File::open(archive_path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i).map_err(|e| e.to_string())?;
        let Some(name) = entry.enclosed_name() else { continue };
        let out = out_dir.join(name);
        if entry.is_dir() {
            std::fs::create_dir_all(&out).map_err(|e| e.to_string())?;
        } else {
            if let Some(parent) = out.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut out_file = std::fs::File::create(&out).map_err(|e| e.to_string())?;
            std::io::copy(&mut entry, &mut out_file).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn extract_targz(archive_path: &PathBuf, out_dir: &PathBuf) -> Result<(), String> {
    let file = std::fs::File::open(archive_path).map_err(|e| e.to_string())?;
    let gz = flate2::read::GzDecoder::new(file);
    let mut archive = tar::Archive::new(gz);
    archive.unpack(out_dir).map_err(|e| e.to_string())
}

/// Unduh + pasang satu entri manifest. Emit event "model-progress".
pub async fn install_entry(
    app: AppHandle,
    registry: State<'_, DownloadRegistry>,
    key: String,
) -> Result<(), String> {
    let already_running = registry
        .0
        .lock()
        .map(|mut s| !s.insert(key.clone()))
        .unwrap_or(true);
    if already_running {
        return Err("Download sedang berjalan untuk model ini.".into());
    }

    let result = async {
        let entry = entry(&key)?;
        let dest = dest_path(&app, &entry);
        if dest.exists() {
            return Ok(());
        }

        match entry.kind.as_str() {
            "file" => download_to(&app, &key, &entry.url, &dest, entry.sha256.clone(), entry.size).await,
            "archive-zip" | "archive-targz" => {
                let tmp_archive = dest.with_extension("download");
                let dl =
                    download_to(&app, &key, &entry.url, &tmp_archive, entry.sha256.clone(), entry.size).await;
                if let Err(e) = dl {
                    let _ = std::fs::remove_file(&tmp_archive);
                    return Err(e);
                }
                let extract_result = match entry.kind.as_str() {
                    "archive-zip" => extract_zip(&tmp_archive, &dest),
                    _ => extract_targz(&tmp_archive, &dest),
                };
                let _ = std::fs::remove_file(&tmp_archive);
                extract_result?;
                Ok(())
            }
            other => Err(format!("Tipe artefak tidak dikenal: {other}")),
        }
    }
    .await;

    if let Ok(mut set) = registry.0.lock() {
        set.remove(&key);
    }
    result
}
