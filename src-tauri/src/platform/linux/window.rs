//! Implementasi X11 menyusul (active-window via XGetInputFocus / EWMH).
//! Wayland membutuhkan pendekatan berbeda (portal) — ditunda ke Fase 7+.

pub fn foreground_pid() -> Option<u32> {
    None
}
