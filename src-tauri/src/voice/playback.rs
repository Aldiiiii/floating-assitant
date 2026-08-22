//! Playback WAV pada thread audio khusus agar UI tetap responsif dan
//! tombol Stop dapat menghentikan pemutaran kapan pun.

use std::path::PathBuf;
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Arc, OnceLock};
use std::time::Duration;

use serde_json::json;
use tauri::{AppHandle, Emitter};

enum Msg {
    Play(PathBuf),
    Stop,
}

static TX: OnceLock<Sender<Msg>> = OnceLock::new();

fn emit_state(app: &AppHandle, state: &str) {
    let _ = app.emit("tts-state", json!({ "state": state }));
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

pub fn play(app: &AppHandle, path: PathBuf) {
    ensure_thread(app);
    if let Some(tx) = TX.get() {
        let _ = tx.send(Msg::Play(path));
    }
}

pub fn stop(app: &AppHandle) {
    match TX.get() {
        Some(tx) => {
            let _ = tx.send(Msg::Stop);
        }
        None => emit_state(app, "idle"),
    }
}

type ActivePlayback = (Arc<rodio::stream::MixerDeviceSink>, Arc<rodio::Player>);

fn start_playback(app: &AppHandle, path: &PathBuf) -> Result<ActivePlayback, String> {
    emit_state(app, "loading");

    let file =
        std::fs::File::open(path).map_err(|e| format!("Gagal membuka audio: {e}"))?;
    let source = rodio::Decoder::new(std::io::BufReader::new(file))
        .map_err(|e| format!("Format audio tidak didukung: {e}"))?;

    let device = rodio::stream::DeviceSinkBuilder::open_default_sink()
        .map_err(|e| format!("Tidak ada perangkat output audio: {e}"))?;
    let player = rodio::Player::connect_new(device.mixer());
    player.append(source);
    player.play();

    Ok((Arc::new(device), Arc::new(player)))
}

fn audio_loop(app: AppHandle, rx: Receiver<Msg>) {
    let mut active: Option<ActivePlayback> = None;

    loop {
        match rx.recv() {
            Ok(Msg::Play(path)) => {
                if let Some((_, old_player)) = active.take() {
                    old_player.stop();
                }
                match start_playback(&app, &path) {
                    Ok((device, player)) => {
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
                        active = Some((device, player));
                    }
                    Err(e) => {
                        let _ = app.emit("tts-state", json!({ "state": "error", "error": e }));
                    }
                }
            }
            Ok(Msg::Stop) => {
                if let Some((_, player)) = active.take() {
                    player.stop();
                }
            }
            Err(_) => break,
        }
    }
}
