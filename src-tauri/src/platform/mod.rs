pub mod paths;

#[cfg(target_os = "windows")]
pub mod windows;

#[cfg(target_os = "linux")]
pub mod linux;

// ---- Re-export implementasi di balik nama stabil untuk dipakai core ----

#[cfg(target_os = "windows")]
pub use windows::shape::set_window_shape;
#[cfg(not(any(target_os = "windows", target_os = "linux")))]
pub fn set_window_shape(_app: &tauri::AppHandle, _radius: i32) -> Result<(), String> {
    Ok(())
}

#[cfg(target_os = "windows")]
pub use windows::window::foreground_pid;

/// Stub non-Windows/non-Linux; Linux implementasinya menyusul (X11).
#[cfg(not(target_os = "windows"))]
pub fn foreground_pid() -> Option<u32> {
    None
}
