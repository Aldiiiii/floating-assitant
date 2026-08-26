//! Fallback bentuk jendela untuk Linux.
//!
//! GTK/WebKit tetap memakai jendela transparan yang dikonfigurasi Tauri. Mask
//! native X11 belum diperlukan untuk menjalankan aplikasi dan akan ditambahkan
//! terpisah jika parity visual penuh dengan Windows dibutuhkan.

pub fn set_window_shape(_app: &tauri::AppHandle, _radius: i32) -> Result<(), String> {
    Ok(())
}
