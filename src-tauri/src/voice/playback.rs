//! Playback WAV/MP3 pada thread audio khusus agar UI tetap responsif dan
//! tombol Stop dapat menghentikan pemutaran kapan pun.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Arc, OnceLock};
use std::time::Duration;

use serde_json::json;
use tauri::{AppHandle, Emitter};

use rodio::cpal::traits::{DeviceTrait, HostTrait};

enum Msg {
    Play { path: PathBuf, device: Option<String> },
    Enqueue { path: PathBuf, device: Option<String> },
    Pause,
    Stop,
}

static TX: OnceLock<Sender<Msg>> = OnceLock::new();
/// Set saat user menekan Stop; dikonsumsi sebelum Play berikutnya dieksekusi
/// agar stop tetap berfungsi meski sintesis TTS masih berjalan.
static STOP_REQUESTED: AtomicBool = AtomicBool::new(false);
static PLAYBACK_GENERATION: AtomicU64 = AtomicU64::new(0);

pub fn is_stop_requested() -> bool {
    STOP_REQUESTED.load(Ordering::SeqCst)
}

pub fn reset_stop() {
    STOP_REQUESTED.store(false, Ordering::SeqCst);
}

pub fn emit_state(app: &AppHandle, state: &str) {
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
    if STOP_REQUESTED.load(Ordering::SeqCst) {
        // User sudah menekan stop selagi sintesis berjalan → buang hasilnya.
        emit_state(app, "idle");
        return;
    }
    if let Some(tx) = TX.get() {
        let _ = tx.send(Msg::Play { path, device });
    }
}

pub fn enqueue(app: &AppHandle, path: PathBuf, device: Option<String>) {
    ensure_thread(app);
    if STOP_REQUESTED.load(Ordering::SeqCst) {
        // Jangan masukkan ke antrean bila user sudah meminta stop.
        return;
    }
    if let Some(tx) = TX.get() {
        let _ = tx.send(Msg::Enqueue { path, device });
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
    PLAYBACK_GENERATION.fetch_add(1, Ordering::SeqCst);
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
        if let Ok(devices) = host.output_devices() {
            for d in devices {
                let name = match d.description() {
                    Ok(desc) => desc.name().to_string(),
                    Err(_) => continue,
                };
                if name == want || name.eq_ignore_ascii_case(want) || name.contains(want) || want.contains(&name) {
                    if let Ok(builder) = rodio::stream::DeviceSinkBuilder::from_device(d) {
                        if let Ok(sink) = builder.open_stream() {
                            return Ok(sink);
                        }
                    }
                    eprintln!("[warn] Gagal membuka stream speaker \"{want}\". Beralih otomatis ke default output sink...");
                    break;
                }
            }
        }
        eprintln!("[warn] Speaker \"{want}\" tidak ditemukan atau tidak kompatibel. Beralih otomatis ke default output sink...");
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

fn spawn_watcher(app: AppHandle, player: Arc<rodio::Player>, gen: u64) {
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(Duration::from_millis(100));
            if PLAYBACK_GENERATION.load(Ordering::SeqCst) != gen {
                return;
            }
            if player.empty() {
                // Beri jeda toleransi mikro agar enqueue kalimat berikutnya dapat menyambung mulus tanpa status idle prematur
                std::thread::sleep(Duration::from_millis(180));
                if PLAYBACK_GENERATION.load(Ordering::SeqCst) != gen {
                    return;
                }
                if player.empty() {
                    break;
                }
            }
        }
        if PLAYBACK_GENERATION.load(Ordering::SeqCst) == gen {
            emit_state(&app, "idle");
        }
    });
}

fn start_new_active_playback(
    app: &AppHandle,
    path: &PathBuf,
    device: Option<&str>,
    active: &mut Option<ActivePlayback>,
) {
    let current_gen = PLAYBACK_GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    if let Some((_, old_player)) = active.take() {
        old_player.stop();
    }
    match start_playback(app, path, device) {
        Ok((device_sink, player)) => {
            emit_state(app, "playing");
            spawn_watcher(app.clone(), player.clone(), current_gen);
            *active = Some((device_sink, player));
        }
        Err(e) => emit_error(app, &e),
    }
}

fn audio_loop(app: AppHandle, rx: Receiver<Msg>) {
    let mut active: Option<ActivePlayback> = None;

    loop {
        match rx.recv() {
            Ok(Msg::Play { path, device }) => {
                start_new_active_playback(&app, &path, device.as_deref(), &mut active);
            }
            Ok(Msg::Enqueue { path, device }) => {
                let mut appended = false;
                if let Some((_, player)) = &active {
                    if !player.empty() {
                        match std::fs::File::open(&path) {
                            Ok(file) => {
                                match rodio::Decoder::new(std::io::BufReader::new(file)) {
                                    Ok(source) => {
                                        player.append(source);
                                        player.play();
                                        appended = true;
                                    }
                                    Err(e) => {
                                        emit_error(&app, &format!("Format audio antrean tidak didukung: {e}"));
                                    }
                                }
                            }
                            Err(e) => {
                                emit_error(&app, &format!("Gagal membuka audio antrean: {e}"));
                            }
                        }
                    }
                }

                if !appended {
                    // Jika player sebelumnya sudah selesai atau antrean kosong, buat playback baru
                    start_new_active_playback(&app, &path, device.as_deref(), &mut active);
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
                PLAYBACK_GENERATION.fetch_add(1, Ordering::SeqCst);
                if let Some((_, player)) = active.take() {
                    player.stop();
                }
                emit_state(&app, "idle");
            }
            Err(_) => break,
        }
    }
}
