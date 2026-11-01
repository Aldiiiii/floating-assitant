//! Orchestrator voice: state machine recording/transcribing + TTS +
//! manajemen model. Semua command diekspor ke frontend.

use cpal::traits::{DeviceTrait, HostTrait};

pub mod capture;
pub mod models;
pub mod playback;
pub mod resample;
pub mod stt;
pub mod tts;
pub mod vad;

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::json;
use tauri::{AppHandle, Emitter, State};

#[derive(Default)]
pub struct VoiceState {
    recorder: Mutex<Option<capture::Recorder>>,
    stream_cancel: Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
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
    model_key: Option<String>,
    language: Option<String>,
    stream: Option<bool>,
    auto_stop: Option<bool>,
    silence_ms: Option<u64>,
    sensitivity: Option<String>,
) -> Result<(), String> {
    let mut guard = state.recorder.lock().map_err(|_| "Voice terkunci.")?;
    if guard.is_some() {
        return Ok(()); // sudah merekam
    }
    match capture::Recorder::start(app.clone(), device_name.as_deref(), sensitivity.as_deref()) {
        Ok(rec) => {
            let use_stream = stream.unwrap_or(true);
            if use_stream {
                let (samples_arc, channels, rate) = rec.samples_handle();
                let (cancel_tx, mut cancel_rx) = tokio::sync::oneshot::channel::<()>();
                if let Ok(mut cancel_guard) = state.stream_cancel.lock() {
                    *cancel_guard = Some(cancel_tx);
                }

                let app_clone = app.clone();
                let chosen_model = model_key.unwrap_or_else(|| "whisper-base".to_string());
                let chosen_lang = language.unwrap_or_else(|| "auto".to_string());
                let auto_stop_active = auto_stop.unwrap_or(false);
                let silence_limit = silence_ms.unwrap_or(1200);

                let (vad_thold, min_speech_rms) = match sensitivity.as_deref() {
                    Some("low") => (0.52, 0.032),  // Ruangan Bising / Deru Kipas
                    Some("high") => (0.65, 0.012), // Ruangan Sunyi / Sangat Peka
                    _ => (0.58, 0.020),            // Normal / Seimbang
                };

                tokio::spawn(async move {
                    let mut ticker = tokio::time::interval(Duration::from_millis(100));
                    ticker.tick().await; // skip tick pertama
                    let in_progress = Arc::new(AtomicBool::new(false));
                    let mut last_len = 0usize;
                    let mut last_chunk_time = Instant::now();
                    let mut vad_detector = vad::SimpleVad::new(silence_limit, vad_thold);
                    vad_detector.min_speech_rms = min_speech_rms;

                    loop {
                        tokio::select! {
                            _ = &mut cancel_rx => {
                                break;
                            }
                            _ = ticker.tick() => {
                                let raw_samples = {
                                    if let Ok(guard) = samples_arc.lock() {
                                        guard.clone()
                                    } else {
                                        continue;
                                    }
                                };

                                let min_samples = (rate as usize * channels * 350) / 1000;
                                if raw_samples.len() < min_samples {
                                    continue;
                                }

                                if auto_stop_active {
                                    let pcm_vad = resample::to_vad_pcm(&raw_samples, channels, rate);
                                    if vad_detector.evaluate(&pcm_vad, 16_000) {
                                        let _ = app_clone.emit("voice-vad-silence", json!({ "reason": "silence" }));
                                        break;
                                    }
                                }

                                if last_chunk_time.elapsed() < Duration::from_millis(900) {
                                    continue;
                                }
                                last_chunk_time = Instant::now();

                                if in_progress.load(Ordering::SeqCst) || raw_samples.len() <= last_len {
                                    continue;
                                }
                                last_len = raw_samples.len();

                                let app_chunk = app_clone.clone();
                                let m_key = chosen_model.clone();
                                let lang = chosen_lang.clone();
                                let in_prog = in_progress.clone();

                                in_prog.store(true, Ordering::SeqCst);
                                tauri::async_runtime::spawn_blocking(move || {
                                    let pcm = resample::to_whisper_pcm(&raw_samples, channels, rate);
                                    if pcm.len() >= 8_000 {
                                        let peak = pcm.iter().map(|&x| x.abs()).fold(0.0_f32, f32::max);
                                        if peak >= 0.022 {
                                            if let Ok(model_file) = model_path(&app_chunk, &m_key) {
                                                if let Ok(transcript) = stt::transcribe(&pcm, &model_file, &lang) {
                                                    let text = transcript.text.trim().to_string();
                                                    if !text.is_empty() {
                                                        let _ = app_chunk.emit("voice-stream-chunk", json!({
                                                            "text": text,
                                                            "is_final": false,
                                                        }));
                                                    }
                                                }
                                            }
                                        }
                                    }
                                    in_prog.store(false, Ordering::SeqCst);
                                });
                            }
                        }
                    }
                });
            }

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
    let _ = app.emit("voice-audio-level", 0.0);
    // 1. Batalkan streaming task periodik jika sedang berjalan
    if let Ok(mut cancel_guard) = state.stream_cancel.lock() {
        if let Some(cancel_tx) = cancel_guard.take() {
            let _ = cancel_tx.send(());
        }
    }

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
    let worker_res =
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
        .await;

    match worker_res {
        Ok(Ok(payload)) => {
            emit_voice_state(&app, "idle", None);
            let _ = app.emit("voice-stream-chunk", json!({
                "text": &payload.text,
                "is_final": true,
            }));
            let _ = app.emit("voice-transcript", &payload);
            Ok(payload)
        }
        Ok(Err(e)) => {
            emit_voice_state(&app, "error", Some(e.clone()));
            Err(e)
        }
        Err(join_err) => {
            let msg = format!("Worker transkripsi gagal: {join_err}");
            emit_voice_state(&app, "error", Some(msg.clone()));
            Err(msg)
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
    enqueue: Option<bool>,
) -> Result<(), String> {
    let text = text.trim().to_string();
    if text.is_empty() {
        return Ok(());
    }
    playback::ensure_thread(&app);

    let is_enqueue = enqueue.unwrap_or(false);
    if is_enqueue {
        if playback::is_stop_requested() {
            return Ok(());
        }
    } else {
        playback::reset_stop();
        let _ = app.emit("tts-state", json!({ "state": "loading" }));
    }

    // Buang tag proses berpikir (<think>) dan format markdown supaya tidak ikut dibacakan.
    let clean = clean_for_tts(&text);
    if clean.trim().is_empty() {
        if !is_enqueue {
            playback::emit_state(&app, "idle");
        }
        return Ok(());
    }
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
            if is_enqueue {
                playback::enqueue(&app, path, speaker_device);
            } else {
                playback::play(&app, path, speaker_device);
            }
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
pub fn tts_pause(app: AppHandle) {
    playback::pause(&app);
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

fn strip_xml_tag(s: &mut String, tag: &str) {
    let open_tag = format!("<{tag}>");
    let close_tag = format!("</{tag}>");
    while let Some(start) = s.find(&open_tag) {
        if let Some(end) = s[start..].find(&close_tag) {
            s.replace_range(start..start + end + close_tag.len(), "");
        } else {
            s.truncate(start);
            break;
        }
    }
}

fn strip_code_blocks(s: &mut String) {
    while let Some(start) = s.find("```") {
        if let Some(end_offset) = s[start + 3..].find("```") {
            let end = start + 3 + end_offset + 3;
            s.replace_range(start..end, " (kode terlampir di layar) ");
        } else {
            // Unclosed code block
            s.truncate(start);
            s.push_str(" (kode terlampir di layar) ");
            break;
        }
    }
}

fn strip_markdown_links(s: &mut String) {
    while let Some(start) = s.find('[') {
        if let Some(mid) = s[start..].find("](") {
            let mid_idx = start + mid;
            if let Some(end) = s[mid_idx..].find(')') {
                let end_idx = mid_idx + end;
                let label = s[start + 1..mid_idx].to_string();
                s.replace_range(start..=end_idx, &label);
                continue;
            }
        }
        break;
    }
}

fn strip_urls(s: &mut String) {
    for prefix in &["https://", "http://"] {
        while let Some(start) = s.find(prefix) {
            let mut end = start + prefix.len();
            for c in s[end..].chars() {
                if c.is_whitespace() || c == ')' || c == ']' || c == '>' {
                    break;
                }
                end += c.len_utf8();
            }
            s.replace_range(start..end, " ");
        }
    }
}

fn clean_for_tts(text: &str) -> String {
    let mut s = text.to_string();
    for tag in &["think", "thought", "reasoning"] {
        strip_xml_tag(&mut s, tag);
    }
    let trimmed = s.trim();
    if trimmed.is_empty() {
        // Jangan mengembalikan proses berpikir jika tidak ada jawaban
        return String::new();
    }
    strip_markdown(&s)
}

fn strip_markdown(text: &str) -> String {
    let mut s = text.to_string();
    strip_code_blocks(&mut s);
    strip_markdown_links(&mut s);
    strip_urls(&mut s);
    s.replace("**", "")
        .replace("__", "")
        .replace("##", "")
        .replace('#', "")
        .replace('*', "")
        .replace('`', "")
        .replace('|', " ")
        .replace('>', " ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_clean_for_tts_strips_thinking_tags() {
        let raw = "<think>Analyzing user question...\nChecking facts.</think>Halo, apa kabar?";
        assert_eq!(clean_for_tts(raw).trim(), "Halo, apa kabar?");

        let unclosed = "<thought>Thinking forever... Halo";
        assert_eq!(clean_for_tts(unclosed).trim(), "");

        let mixed = "**Tebal** dan `kode` <reasoning>logika rahasia</reasoning> normal.";
        assert_eq!(clean_for_tts(mixed).trim(), "Tebal dan kode  normal.");
    }

    #[test]
    fn test_clean_for_tts_normalizes_code_and_links() {
        let code_raw = "Coba ini: ```rust\nfn main() { println!(\"Hi\"); }\n``` Selamat mencoba!";
        let clean = clean_for_tts(code_raw);
        assert!(clean.contains("(kode terlampir di layar)"));
        assert!(!clean.contains("println"));

        let link_raw = "Buka [Dokumentasi Rust](https://doc.rust-lang.org) untuk info lebih lanjut.";
        let clean_link = clean_for_tts(link_raw);
        assert!(clean_link.contains("Buka Dokumentasi Rust untuk"));
        assert!(!clean_link.contains("https://"));
    }
}
