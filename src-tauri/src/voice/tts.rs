//! Sintesis suara via Piper sidecar → file WAV di cache.

use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::AppHandle;

use crate::platform::paths;

pub struct PiperSetup {
    pub bin: PathBuf,
    pub model: PathBuf,
    pub config: PathBuf,
}

const VOICES: &[(&str, &str)] = &[
    ("id", "id_ID-news_tts-medium"),
    ("en", "en_US-lessac-medium"),
];

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

/// Jalankan piper: teks via stdin, hasil WAV di folder cache.
pub fn synthesize(app: &AppHandle, text: &str, key: &str) -> Result<PathBuf, String> {
    let setup = resolve(app, key)?;
    paths::ensure_dir(&paths::cache_dir(app))?;

    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let out = paths::cache_dir(app).join(format!("tts-{ts}-{key}.wav"));

    let mut cmd = Command::new(&setup.bin);
    cmd.arg("--model")
        .arg(&setup.model)
        .arg("--config")
        .arg(&setup.config)
        .arg("--output_file")
        .arg(&out)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

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
        return Err(
            "Sintesis suara gagal.\n\nPeriksa instalasi voice di Pengaturan → Voice."
                .to_string(),
        );
    }
    Ok(out)
}
