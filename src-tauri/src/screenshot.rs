use crate::platform;
use base64::Engine;
use image::codecs::png::PngEncoder;
use image::imageops::FilterType;
use image::{ExtendedColorType, ImageEncoder, RgbaImage};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, State, WebviewUrl, WebviewWindowBuilder};
use tokio::sync::{oneshot, Mutex};

/// Batas dimensi maksimal input vision agar payload tidak berlebihan.
const MAX_DIMENSION: u32 = 1568;
const MIN_AREA_PX: i32 = 8;

#[derive(Serialize, Clone)]
pub struct ScreenshotData {
    pub data_url: String,
    pub width: u32,
    pub height: u32,
}

#[derive(Deserialize, Clone, Copy)]
pub struct AreaRect {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

#[derive(Default)]
pub struct AreaSelectionState {
    tx: Mutex<Option<oneshot::Sender<Result<AreaRect, String>>>>,
}

fn encode_png_data_url(img: &RgbaImage) -> Result<ScreenshotData, String> {
    let (w, h) = img.dimensions();
    let final_img: RgbaImage = if w.max(h) > MAX_DIMENSION {
        let scale = MAX_DIMENSION as f64 / w.max(h) as f64;
        let nw = ((w as f64 * scale).round() as u32).max(1);
        let nh = ((h as f64 * scale).round() as u32).max(1);
        image::imageops::resize(img, nw, nh, FilterType::Lanczos3)
    } else {
        img.clone()
    };

    let mut png: Vec<u8> = Vec::new();
    PngEncoder::new(&mut png)
        .write_image(
            final_img.as_raw(),
            final_img.width(),
            final_img.height(),
            ExtendedColorType::Rgba8,
        )
        .map_err(|e| format!("Screenshot gagal diambil. ({e})"))?;

    Ok(ScreenshotData {
        data_url: format!(
            "data:image/png;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(&png)
        ),
        width: final_img.width(),
        height: final_img.height(),
    })
}

fn capture_main_monitor() -> Result<RgbaImage, String> {
    let monitors = xcap::Monitor::all().map_err(|e| format!("Screenshot gagal diambil. ({e})"))?;
    monitors
        .into_iter()
        .next()
        .ok_or("Monitor tidak ditemukan.")?
        .capture_image()
        .map_err(|e| format!("Screenshot gagal diambil. ({e})"))
}

#[cfg(windows)]
fn capture_window_by_pid(pid: u32) -> Result<RgbaImage, String> {
    let windows = xcap::Window::all().map_err(|e| format!("Screenshot gagal diambil. ({e})"))?;
    let mut best: Option<(u64, RgbaImage)> = None;
    for win in windows {
        if win.pid().map(|p| p != pid).unwrap_or(true) {
            continue;
        }
        let Ok(img) = win.capture_image() else { continue };
        let area = img.width() as u64 * img.height() as u64;
        if best.as_ref().is_none_or(|(a, _)| area > *a) {
            best = Some((area, img));
        }
    }
    best.map(|(_, img)| img)
        .ok_or_else(|| "Tidak dapat menemukan window aktif.".to_string())
}

#[cfg(not(windows))]
fn capture_window_by_pid(_pid: u32) -> Result<RgbaImage, String> {
    Err("Capture window aktif belum didukung di platform ini.".into())
}

fn hide_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.hide();
    }
}

fn restore_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
    }
}

async fn settle_after_hide() {
    // Beri waktu OS menyembunyikan window dari layar sebelum capture.
    tokio::time::sleep(Duration::from_millis(250)).await;
}

fn build_overlay(app: &AppHandle) -> Result<(), String> {
    if let Some(existing) = app.get_webview_window("overlay") {
        let _ = existing.close();
    }

    let monitor = xcap::Monitor::all()
        .map_err(|e| e.to_string())?
        .into_iter()
        .next()
        .ok_or("Monitor tidak ditemukan.")?;
    let mx = monitor.x().map_err(|e| e.to_string())?;
    let my = monitor.y().map_err(|e| e.to_string())?;
    let mw = monitor.width().map_err(|e| e.to_string())?;
    let mh = monitor.height().map_err(|e| e.to_string())?;

    let win = WebviewWindowBuilder::new(app, "overlay", WebviewUrl::App("index.html".into()))
        .title("Pilih Area")
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .focused(true)
        .build()
        .map_err(|e| format!("Gagal membuka overlay: {e}"))?;

    let _ = win.set_position(PhysicalPosition::new(mx, my));
    let _ = win.set_size(PhysicalSize::new(mw, mh));
    let _ = win.set_focus();
    Ok(())
}

fn close_overlay(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("overlay") {
        let _ = win.close();
    }
}

#[tauri::command]
pub async fn capture_fullscreen(app: AppHandle) -> Result<ScreenshotData, String> {
    hide_main(&app);
    settle_after_hide().await;
    let res = capture_main_monitor().and_then(|img| encode_png_data_url(&img));
    restore_main(&app);
    res
}

#[tauri::command]
pub async fn capture_active_window(app: AppHandle) -> Result<ScreenshotData, String> {
    hide_main(&app);
    settle_after_hide().await;
    let res = (|| {
        let pid = platform::foreground_pid().ok_or("Tidak ada window aktif yang terdeteksi.")?;
        if pid == std::process::id() {
            return Err("Window aktif adalah assistant itu sendiri.".into());
        }
        capture_window_by_pid(pid)
    })()
    .and_then(|img| encode_png_data_url(&img));
    restore_main(&app);
    res
}

#[tauri::command]
pub async fn capture_area(
    app: AppHandle,
    state: State<'_, AreaSelectionState>,
) -> Result<ScreenshotData, String> {
    hide_main(&app);
    settle_after_hide().await;
    // Capture penuh SEBELUM overlay muncul agar overlay tidak ikut tertangkap.
    let img = capture_main_monitor()?;
    build_overlay(&app)?;

    let (tx, rx) = oneshot::channel::<Result<AreaRect, String>>();
    *state.tx.lock().await = Some(tx);

    let wait = tokio::time::timeout(Duration::from_secs(120), rx).await;
    *state.tx.lock().await = None;
    close_overlay(&app);
    restore_main(&app);

    match wait {
        Ok(Ok(Ok(rect))) => {
            let (w, h) = img.dimensions();
            let x = rect.x.clamp(0, w as i32 - 1);
            let y = rect.y.clamp(0, h as i32 - 1);
            let cw = rect
                .width
                .clamp(MIN_AREA_PX, w as i32 - x)
                .min(w.saturating_sub(x as u32) as i32);
            let ch = rect
                .height
                .clamp(MIN_AREA_PX, h as i32 - y)
                .min(h.saturating_sub(y as u32) as i32);
            if cw < MIN_AREA_PX || ch < MIN_AREA_PX {
                return Err("Area yang dipilih terlalu kecil.".into());
            }
            let cropped =
                image::imageops::crop_imm(&img, x as u32, y as u32, cw as u32, ch as u32)
                    .to_image();
            encode_png_data_url(&cropped)
        }
        Ok(Ok(Err(e))) => Err(e),
        _ => Err("Pemilihan area dibatalkan.".into()),
    }
}

#[tauri::command]
pub async fn submit_area_selection(
    state: State<'_, AreaSelectionState>,
    rect: AreaRect,
) -> Result<(), String> {
    if let Some(tx) = state.tx.lock().await.take() {
        let _ = tx.send(Ok(rect));
    }
    Ok(())
}

#[tauri::command]
pub async fn cancel_area_selection(state: State<'_, AreaSelectionState>) -> Result<(), String> {
    if let Some(tx) = state.tx.lock().await.take() {
        let _ = tx.send(Err("Screenshot dibatalkan.".into()));
    }
    Ok(())
}
