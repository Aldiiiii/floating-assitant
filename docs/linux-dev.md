# Development di Linux Mint

Fase 6 (Voice) dan seterusnya menargetkan Windows + Linux. Panduan ini untuk
menyiapkan mesin Linux Mint (X11/Cinnamon) agar proyek bisa dibuild & dijalankan.

## 1. Dependency sistem

Jalankan script otomatis:

```bash
bash scripts/setup-mint.sh
```

atau manual:

```bash
sudo apt update
sudo apt install -y build-essential curl pkg-config file \
  libwebkit2gtk-4.1-dev libgtk-3-dev \
  libasound2-dev libpulse-dev \
  cmake clang libssl-dev
```

Catatan paket:
- `libwebkit2gtk-4.1-dev` — engine webview Tauri (wajib)
- `libasound2-dev`, `libpulse-dev` — backend audio cpal (ALSA/PulseAudio)
- `cmake`, `clang` — whisper-rs meng-compile whisper.cpp dari source saat build pertama
- Build Rust pertama akan lama karena compile C++ — itu normal

## 2. Toolchain

- Rust via rustup (`https://rustup.rs`)
- Node.js ≥ 20 (nvm disarankan)

## 3. Menjalankan

```bash
npm install
npm run tauri dev      # development
npm run tauri build    # bundle .deb/AppImage sesuai konfigurasi bundle
```

## 4. Status dukungan fitur per platform

| Fitur | Windows | Linux Mint |
|---|---|---|
| Floating bubble + chat | ✅ | ✅ |
| Global shortcut Alt+Space | ✅ | ✅ |
| LM Studio connection | ✅ | ✅ |
| Voice STT/TTS | ✅ | ✅ |
| Screenshot layar penuh / area | ✅ | ⚠️ uji xcap (X11) |
| Screenshot jendela aktif | ✅ | ❌ menyusul (perlu X11/EWMH) |
| Window shape bulat | ✅ | ❌ stub (butuh X11 shape ext) |

## 5. Catatan Wayland

Sesi Wayland tidak didukung untuk screenshot/active-window pada tahap ini.
Gunakan sesi X11 ("Cinnamon on Xorg" di layar login) hingga parity Wayland
diimplementasikan lewat xdg-desktop-portal.

## 6. Lokasi data

Semua data aplikasi memakai app data dir Tauri:
- Model voice: `~/.local/share/com.localai.assistant/models`
- Binary Piper: `~/.local/share/com.localai.assistant/bin`
- Database & settings: direktori config/data standar Tauri per OS
