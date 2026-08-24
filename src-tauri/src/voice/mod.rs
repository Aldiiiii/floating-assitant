//! Orchestrator voice: state machine recording/transcribing + TTS +
//! manajemen model. Semua command diekspor ke frontend.

use cpal::traits::{DeviceTrait, HostTrait};

pub mod capture;
pub mod models;
pub mod playback;
pub mod resample;
pub mod stt;
pub mod tts;

use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Serialize};
use serde_json::json;
use tauri::{AppHandle, Emitter, State};

#[derive(Default)]
pub struct VoiceState {
    recorder: Mutex<Option<capture::Recorder>>,
}

fn emit_voice_state(app: &AppHandle, state: &str, error: Option<String>) {
    let _ = app.emit(
        "voice-state",
        json!({ "state": state, "error": error }),
    );
}

#[derive(Clone, Serialize)]
pub struct TranscriptPayload {
    text: String,
    language: String,
    duration_ms: u64,
}

#[derive(Serialize)]
pub struct ModelStatus {
    installed: bool,
    downloading: bool,
}

fn model_path(app: &AppHandle, key: &str) -> Result<PathBuf, String> {
    let entry = models::entry(key)?;
    Ok(models::dest_path(app, &entry))
}

#[tauri::command]
pub fn model_status(app: AppHandle, key: String) -> ModelStatus {
    ModelStatus {
        installed: models::is_installed(&app, &key),
        downloading: false,
    }
}

#[tauri::command]
pub async fn model_download(
    app: AppHandle,
    registry: State<'_, models::DownloadRegistry>,
    key: String,
) -> Result<(), String> {
    models::install_entry(app, registry, key).await
}

#[tauri::command]
pub fn audio_devices() -> Result<Vec<String>, String> {
    let host = cpal::default_host();
    let mut names = Vec::new();
    let devices = host
        .input_devices()
        .map_err(|e| format!("Gagal enumerasi microphone: {e}"))?;
    for device in devices {
        if let Ok(desc) = device.description() {
            let name = desc.name().to_string();
            if !name.trim().is_empty() {
                names.push(name);
            }
        }
    }
    Ok(names)
}

#[tauri::command]
pub async fn voice_start(
    app: AppHandle,
    state: State<'_, VoiceState>,
    device_name: Option<String>,
) -> Result<(), String> {
    let mut guard = state.recorder.lock().map_err(|_| "Voice terkunci.")?;
    if guard.is_some() {
        return Ok(()); // sudah merekam
    }
    match capture::Recorder::start(device_name.as_deref()) {
        Ok(rec) => {
            *guard = Some(rec);
            emit_voice_state(&app, "recording", None);
            Ok(())
        }
        Err(e) => {
            emit_voice_state(&app, "error", Some(e.clone()));
            Err(e)
        }
    }
}

#[tauri::command]
pub async fn voice_stop(
    app: AppHandle,
    state: State<'_, VoiceState>,
    model_key: String,
    language: String,
) -> Result<TranscriptPayload, String> {
    let recorder = {
        let mut guard = state.recorder.lock().map_err(|_| "Voice terkunci.")?;
        guard.take()
    };

    let Some(recorder) = recorder else {
        return Err("Tidak ada recording yang berjalan.".into());
    };

    let recording = recorder.stop();
    emit_voice_state(&app, "transcribing", None);

    let app_for_worker = app.clone();
    let result =
        tauri::async_runtime::spawn_blocking(move || -> Result<TranscriptPayload, String> {
            let pcm = resample::to_whisper_pcm(
                &recording.samples,
                recording.channels,
                recording.rate,
            );
            let model_file = model_path(&app_for_worker, &model_key)?;
            let transcript = stt::transcribe(&pcm, &model_file, &language)?;
            Ok(TranscriptPayload {
                text: transcript.text,
                language: transcript.language,
                duration_ms: recording.duration.as_millis() as u64,
            })
        })
        .await
        .map_err(|e| format!("Worker transkripsi gagal: {e}"))?;

    match result {
        Ok(payload) => {
            emit_voice_state(&app, "idle", None);
            let _ = app.emit("voice-transcript", &payload);
            Ok(payload)
        }
        Err(e) => {
            emit_voice_state(&app, "error", Some(e.clone()));
            Err(e)
        }
    }
}

#[tauri::command]
pub async fn tts_speak(
    app: AppHandle,
    text: String,
    voice: String,
    speaker_device: Option<String>,
    speed: Option<f32>,
) -> Result<(), String> {
    let text = text.trim().to_string();
    if text.is_empty() {
        return Ok(());
    }
    playback::ensure_thread(&app);
    // Feedback instan sebelum sintesis (piper butuh waktu untuk teks panjang).
    let _ = app.emit("tts-state", json!({ "state": "loading" }));

    // Markdown ringan dibuang supaya tidak ikut dibacakan.
    let clean = strip_markdown(&text);
    let app_for_worker = app.clone();
    let wav = tauri::async_runtime::spawn_blocking(move || {
        tts::synthesize(&app_for_worker, &clean, &voice, speed.unwrap_or(1.0))
    })
    .await
    .map_err(|e| {
        let msg = format!("Worker TTS gagal: {e}");
        playback::emit_error(&app, &msg);
        playback::request_stop(&app);
        msg
    })?;

    match wav {
        Ok(path) => {
            playback::play(&app, path, speaker_device);
            Ok(())
        }
        Err(e) => {
            playback::emit_error(&app, &e);
            playback::request_stop(&app);
            Err(e)
        }
    }
}

#[tauri::command]
pub fn tts_stop(app: AppHandle) {
    playback::request_stop(&app);
}

#[tauri::command]
pub fn audio_output_devices() -> Result<Vec<String>, String> {
    let host = cpal::default_host();
    let mut names = Vec::new();
    let devices = host
        .output_devices()
        .map_err(|e| format!("Gagal enumerasi speaker: {e}"))?;
    for device in devices {
        if let Ok(desc) = device.description() {
            let name = desc.name().to_string();
            if !name.trim().is_empty() {
                names.push(name);
            }
        }
    }
    Ok(names)
}

fn strip_markdown(text: &str) -> String {
    text.replace("```", " ")
        .replace("**", "")
        .replace("__", "")
        .replace("##", "")
        .replace('*', "")
        .replace('`', "")
}
