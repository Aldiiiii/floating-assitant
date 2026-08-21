/// Mengatur bentuk window utama via Win32 region.
/// radius > 0 → sudut membulat (radius = jarak piksel fisik);
/// radius <= 0 → kembalikan ke kotak penuh.

#[cfg(windows)]
#[tauri::command]
pub fn set_window_shape(
    app: tauri::AppHandle,
    radius: i32,
) -> Result<(), String> {
    use tauri::Manager;
    use windows_sys::Win32::Graphics::Gdi::{CreateRoundRectRgn, SetWindowRgn};

    let win = app
        .get_webview_window("main")
        .ok_or("Window utama tidak ditemukan.")?;
    let hwnd = win.hwnd().map_err(|e| e.to_string())?.0;

    unsafe {
        let rgn = if radius > 0 {
            let size = win.outer_size().map_err(|e| e.to_string())?;
            CreateRoundRectRgn(0, 0, size.width as i32 + 1, size.height as i32 + 1, radius, radius)
        } else {
            std::ptr::null_mut()
        };
        // Setelah dipasang, sistem memiliki region — jangan di-delete.
        if SetWindowRgn(hwnd, rgn, 1) == 0 {
            return Err("Gagal mengatur bentuk window.".into());
        }
    }
    Ok(())
}

#[cfg(not(windows))]
#[tauri::command]
pub fn set_window_shape(_radius: i32) -> Result<(), String> {
    Ok(())
}
