//! Sintesis suara via Edge-TTS (natural online) atau Piper sidecar (offline) → audio di cache.

use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::AppHandle;

use crate::platform::paths;

static TTS_FILE_COUNTER: AtomicU64 = AtomicU64::new(0);

pub struct PiperSetup {
    pub bin: PathBuf,
    pub model: PathBuf,
    pub config: PathBuf,
}

const VOICES: &[(&str, &str)] = &[
    ("id", "id_ID-news_tts-medium"),
    ("en", "en_US-lessac-medium"),
];

const EDGE_VOICES: &[(&str, &str)] = &[
    ("id-gadis", "id-ID-GadisNeural"),
    ("id-ardi", "id-ID-ArdiNeural"),
];

pub fn edge_voice_name(key: &str) -> Option<&'static str> {
    EDGE_VOICES
        .iter()
        .find(|(k, _)| *k == key)
        .map(|(_, name)| *name)
}

fn voice_file_name(key: &str) -> Result<&'static str, String> {
    VOICES
        .iter()
        .find(|(k, _)| *k == key)
        .map(|(_, name)| *name)
        .ok_or_else(|| format!("Voice TTS \"{key}\" tidak dikenal."))
}

pub fn resolve(app: &AppHandle, key: &str) -> Result<PiperSetup, String> {
    let exe = if cfg!(windows) { "piper.exe" } else { "piper" };
    let bin = paths::bin_dir(app).join("piper").join(exe);
    if !bin.exists() {
        return Err(
            "Mesin suara (Piper) belum terpasang.\n\nUnduh lewat Pengaturan → Voice."
                .to_string(),
        );
    }

    let name = voice_file_name(key)?;
    let model = paths::models_dir(app).join("tts").join(format!("{name}.onnx"));
    let config = paths::models_dir(app)
        .join("tts")
        .join(format!("{name}.onnx.json"));
    if !model.exists() || !config.exists() {
        return Err(
            "Voice belum terpasang.\n\nUnduh lewat Pengaturan → Voice.".to_string(),
        );
    }

    Ok(PiperSetup { bin, model, config })
}

fn synthesize_edge_tts(
    app: &AppHandle,
    text: &str,
    voice_name: &str,
    speed: f32,
) -> Result<PathBuf, String> {
    paths::ensure_dir(&paths::cache_dir(app))?;

    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let count = TTS_FILE_COUNTER.fetch_add(1, Ordering::SeqCst);
    let out = paths::cache_dir(app).join(format!("tts-{ts}-{count}.mp3"));
    let in_text_path = paths::cache_dir(app).join(format!("tts-in-{ts}-{count}.txt"));

    std::fs::write(&in_text_path, text.as_bytes())
        .map_err(|e| format!("Gagal menulis teks sementara: {e}"))?;

    let pct = ((speed.clamp(0.5, 2.0) - 1.0) * 100.0).round() as i32;
    let rate_str = format!("{:+}%", pct);

    let mut last_err = String::new();
    let mut success = false;

    for py_bin in ["python", "py", "python3"] {
        let mut cmd = Command::new(py_bin);
        cmd.arg("-m")
            .arg("edge_tts")
            .arg("--voice")
            .arg(voice_name)
            .arg("--rate")
            .arg(&rate_str)
            .arg("-f")
            .arg(&in_text_path)
            .arg("--write-media")
            .arg(&out)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        match cmd.spawn() {
            Ok(mut child) => match child.wait() {
                Ok(status) => {
                    if status.success() && out.exists() {
                        success = true;
                        break;
                    } else {
                        let mut stderr_str = String::new();
                        if let Some(mut err_pipe) = child.stderr.take() {
                            use std::io::Read;
                            let _ = err_pipe.read_to_string(&mut stderr_str);
                        }
                        last_err = format!("Exit {status}: {stderr_str}");
                    }
                }
                Err(e) => {
                    last_err = format!("Gagal menunggu proses {py_bin}: {e}");
                }
            },
            Err(e) => {
                last_err = format!("Tidak dapat menjalankan {py_bin}: {e}");
            }
        }
    }

    let _ = std::fs::remove_file(&in_text_path);

    if !success {
        let _ = std::fs::remove_file(&out);
        return Err(if last_err.is_empty() {
            "Gagal menjalankan Edge-TTS. Pastikan Python dan edge-tts terpasang (pip install edge-tts)."
                .to_string()
        } else {
            format!("Gagal sintesis Edge-TTS: {last_err}")
        });
    }

    Ok(out)
}

/// Jalankan sintesis suara: Edge-TTS bila key suara alami, atau Piper untuk suara offline lokal.
pub fn synthesize(
    app: &AppHandle,
    text: &str,
    key: &str,
    speed: f32,
) -> Result<PathBuf, String> {
    if let Some(voice_name) = edge_voice_name(key) {
        return synthesize_edge_tts(app, text, voice_name, speed);
    }

    let setup = resolve(app, key)?;
    paths::ensure_dir(&paths::cache_dir(app))?;

    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let count = TTS_FILE_COUNTER.fetch_add(1, Ordering::SeqCst);
    let out = paths::cache_dir(app).join(format!("tts-{ts}-{count}-{key}.wav"));

    let mut cmd = Command::new(&setup.bin);
    cmd.arg("--model")
        .arg(&setup.model)
        .arg("--config")
        .arg(&setup.config)
        .arg("--output_file")
        .arg(&out)
        .arg("--length_scale")
        .arg(format!("{:.2}", 1.0 / speed.clamp(0.5, 2.0)))
        .arg("--sentence_silence")
        .arg("0.25")
        .stdin(Stdio::piped())
        // Log piper dibuang, tapi tetap ditampung agar bisa dilaporkan saat gagal.
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Gagal menjalankan Piper: {e}"))?;
    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(text.as_bytes());
        let _ = stdin.write_all(b"\n");
    }
    let status = child
        .wait()
        .map_err(|e| format!("Piper berhenti mendadak: {e}"))?;

    if !status.success() || !out.exists() {
        let _ = std::fs::remove_file(&out);
        return Err(format!(
            "Sintesis suara gagal (exit {status}).\n\nPeriksa instalasi voice di \
             Pengaturan → Voice."
        ));
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_edge_voices_mapping() {
        assert_eq!(edge_voice_name("id-gadis"), Some("id-ID-GadisNeural"));
        assert_eq!(edge_voice_name("id-ardi"), Some("id-ID-ArdiNeural"));
        assert_eq!(edge_voice_name("id"), None);
        assert_eq!(edge_voice_name("en"), None);
        assert_eq!(edge_voice_name("unknown"), None);
    }

    #[test]
    fn test_piper_voices_mapping() {
        assert_eq!(voice_file_name("id").unwrap(), "id_ID-news_tts-medium");
        assert_eq!(voice_file_name("en").unwrap(), "en_US-lessac-medium");
        assert!(voice_file_name("id-gadis").is_err());
    }
}
