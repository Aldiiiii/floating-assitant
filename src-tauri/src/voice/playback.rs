//! Playback WAV pada thread audio khusus agar UI tetap responsif dan
//! tombol Stop dapat menghentikan pemutaran kapan pun.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Arc, OnceLock};
use std::time::Duration;

use serde_json::json;
use tauri::{AppHandle, Emitter};

use rodio::cpal::traits::{DeviceTrait, HostTrait};

enum Msg {
    Play { path: PathBuf, device: Option<String> },
    Pause,
    Stop,
}

static TX: OnceLock<Sender<Msg>> = OnceLock::new();
/// Set saat user menekan Stop; dikonsumsi sebelum Play berikutnya dieksekusi
/// agar stop tetap berfungsi meski sintesis TTS masih berjalan.
static STOP_REQUESTED: AtomicBool = AtomicBool::new(false);

fn emit_state(app: &AppHandle, state: &str) {
    let _ = app.emit("tts-state", json!({ "state": state }));
}

pub fn emit_error(app: &AppHandle, error: &str) {
    let _ = app.emit("tts-state", json!({ "state": "error", "error": error }));
}

/// Pastikan thread audio hidup.
pub fn ensure_thread(app: &AppHandle) {
    let _ = TX.get_or_init(|| {
        let (tx, rx) = mpsc::channel::<Msg>();
        let handle = app.clone();
        std::thread::spawn(move || audio_loop(handle, rx));
        tx
    });
}

pub fn play(app: &AppHandle, path: PathBuf, device: Option<String>) {
    ensure_thread(app);
    if STOP_REQUESTED.swap(false, Ordering::SeqCst) {
        // User sudah menekan stop selagi sintesis berjalan → buang hasilnya.
        emit_state(app, "idle");
        return;
    }
    if let Some(tx) = TX.get() {
        let _ = tx.send(Msg::Play { path, device });
    }
}

/// Toggle pause/resume pada pemutaran aktif (no-op bila idle).
pub fn pause(_app: &AppHandle) {
    if let Some(tx) = TX.get() {
        let _ = tx.send(Msg::Pause);
    }
}

pub fn request_stop(app: &AppHandle) {
    STOP_REQUESTED.store(true, Ordering::SeqCst);
    match TX.get() {
        Some(tx) => {
            let _ = tx.send(Msg::Stop);
        }
        None => emit_state(app, "idle"),
    }
}

type ActivePlayback = (Arc<rodio::stream::MixerDeviceSink>, Arc<rodio::Player>);

fn open_output(device_name: Option<&str>) -> Result<rodio::stream::MixerDeviceSink, String> {
    let host = rodio::cpal::default_host();

    if let Some(want) = device_name.map(str::trim).filter(|s| !s.is_empty()) {
        let devices = host
            .output_devices()
            .map_err(|e| format!("Gagal enumerasi speaker: {e}"))?;
        for d in devices {
            let name = match d.description() {
                Ok(desc) => desc.name().to_string(),
                Err(_) => continue,
            };
            if name == want {
                return rodio::stream::DeviceSinkBuilder::from_device(d)
                    .map_err(|e| format!("Gagal membuka speaker \"{want}\": {e}"))?
                    .open_stream()
                    .map_err(|e| format!("Gagal membuka speaker \"{want}\": {e}"));
            }
        }
        return Err(format!(
            "Speaker \"{want}\" tidak ditemukan.\n\nPilih perangkat lain di \
             Pengaturan → Voice."
        ));
    }

    rodio::stream::DeviceSinkBuilder::open_default_sink()
        .map_err(|e| format!("Tidak ada perangkat output audio: {e}"))
}

fn start_playback(
    app: &AppHandle,
    path: &PathBuf,
    device_name: Option<&str>,
) -> Result<ActivePlayback, String> {
    emit_state(app, "loading");

    let file =
        std::fs::File::open(path).map_err(|e| format!("Gagal membuka audio: {e}"))?;
    let source = rodio::Decoder::new(std::io::BufReader::new(file))
        .map_err(|e| format!("Format audio tidak didukung: {e}"))?;

    let device_sink = open_output(device_name)?;
    let player = rodio::Player::connect_new(device_sink.mixer());
    player.append(source);
    player.play();

    Ok((Arc::new(device_sink), Arc::new(player)))
}

fn audio_loop(app: AppHandle, rx: Receiver<Msg>) {
    let mut active: Option<ActivePlayback> = None;

    loop {
        match rx.recv() {
            Ok(Msg::Play { path, device }) => {
                if let Some((_, old_player)) = active.take() {
                    old_player.stop();
                }
                match start_playback(&app, &path, device.as_deref()) {
                    Ok((device_sink, player)) => {
                        emit_state(&app, "playing");
                        let watch_app = app.clone();
                        let watch_player = player.clone();
                        std::thread::spawn(move || {
                            loop {
                                if watch_player.empty() {
                                    break;
                                }
                                std::thread::sleep(Duration::from_millis(120));
                            }
                            // Habis natural ATAU distop → keduanya berarti idle.
                            emit_state(&watch_app, "idle");
                        });
                        active = Some((device_sink, player));
                    }
                    Err(e) => emit_error(&app, &e),
                }
            }
            Ok(Msg::Pause) => {
                if let Some((_, player)) = &active {
                    let was_paused = player.is_paused();
                    if was_paused {
                        player.play();
                        emit_state(&app, "playing");
                    } else {
                        player.pause();
                        emit_state(&app, "paused");
                    }
                }
            }
            Ok(Msg::Stop) => {
                if let Some((_, player)) = active.take() {
                    player.stop();
                    // Status idle dikirim SEGERA — tidak menunggu polling watcher.
                    emit_state(&app, "idle");
                } else {
                    emit_state(&app, "idle");
                }
            }
            Err(_) => break,
        }
    }
}
