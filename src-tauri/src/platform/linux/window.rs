use std::process::Command;

/// Mendapatkan PID window yang sedang aktif/fokus di Linux Mint (X11 / Cinnamon).
/// Menggunakan standar EWMH (_NET_ACTIVE_WINDOW & _NET_WM_PID) via xdotool atau xprop bawaan X11.
pub fn foreground_pid() -> Option<u32> {
    // 1. Coba via xdotool terlebih dahulu (bila terpasang via scripts/setup-mint.sh)
    if let Ok(output) = Command::new("xdotool")
        .args(["getactivewindow", "getwindowpid"])
        .output()
    {
        if output.status.success() {
            let s = String::from_utf8_lossy(&output.stdout);
            if let Ok(pid) = s.trim().parse::<u32>() {
                if pid > 0 {
                    return Some(pid);
                }
            }
        }
    }

    // 2. Fallback X11 EWMH standar via xprop (pre-installed di Linux Mint / Ubuntu)
    let active_win = Command::new("xprop")
        .args(["-root", "-notype", "_NET_ACTIVE_WINDOW"])
        .output()
        .ok()?;
    if !active_win.status.success() {
        return None;
    }
    let s = String::from_utf8_lossy(&active_win.stdout);
    // Format: _NET_ACTIVE_WINDOW = 0x3a00003
    let win_id = s.split('=').nth(1)?.trim();
    if win_id.is_empty() || win_id == "0x0" {
        return None;
    }

    let pid_out = Command::new("xprop")
        .args(["-id", win_id, "-notype", "_NET_WM_PID"])
        .output()
        .ok()?;
    if !pid_out.status.success() {
        return None;
    }
    let ps = String::from_utf8_lossy(&pid_out.stdout);
    // Format: _NET_WM_PID = 12345
    let pid_str = ps.split('=').nth(1)?.trim();
    pid_str.parse::<u32>().ok()
}
