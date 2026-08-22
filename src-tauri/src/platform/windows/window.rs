use windows_sys::Win32::UI::WindowsAndMessaging::{
    GetForegroundWindow, GetWindowThreadProcessId,
};

/// PID aplikasi yang sedang fokus. Dipanggil SETELAH window assistant
/// disembunyikan agar hasilnya adalah aplikasi sebelumnya.
pub fn foreground_pid() -> Option<u32> {
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.is_null() {
            return None;
        }
        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, &mut pid);
        if pid == 0 { None } else { Some(pid) }
    }
}
