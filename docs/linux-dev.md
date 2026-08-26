# Development dan rilis di Linux Mint

Target Linux saat ini adalah Linux Mint Cinnamon **X11** pada arsitektur **x86_64/amd64**. Source sudah mempunyai konfigurasi `.deb` dan AppImage serta fallback platform agar core dapat dikompilasi di Linux. Rilis belum boleh disebut tervalidasi penuh sebelum smoke test dilakukan pada mesin Mint native.

## Setup

```bash
git clone <URL_REPOSITORY_ANDA>
cd floating-assistant
bash scripts/setup-mint.sh
npm ci
```

Script setup memasang dependency Tauri/WebKitGTK, AppIndicator, X11 helper, audio ALSA/PulseAudio, compiler voice, packaging AppImage, keyring, dan Rust bila belum tersedia. Node.js 20+ harus dipasang terlebih dahulu; nvm direkomendasikan agar versi tidak bergantung pada paket distro.

Daftar dependency mengikuti [prasyarat Linux resmi Tauri](https://v2.tauri.app/start/prerequisites/). Paket penting proyek ini:

- `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`: webview dan UI Tauri.
- `libayatana-appindicator3-dev`: tray icon.
- `libxdo-dev`: integrasi desktop X11.
- `libasound2-dev`, `libpulse-dev`: capture/playback audio.
- `cmake`, `clang`: build whisper.cpp melalui whisper-rs.
- `patchelf`, `libfuse2`/`libfuse2t64`: packaging dan runtime AppImage; script memilih nama paket sesuai basis distro.
- `gnome-keyring`, `libsecret-tools`: penyimpanan/pembersihan API key.

## Menjalankan dan build

Development:

```bash
npm run tauri dev
```

Build `.deb` dan AppImage:

```bash
bash scripts/build-mint.sh
```

Konfigurasi platform di `src-tauri/tauri.linux.conf.json` otomatis digabungkan Tauri ketika build dilakukan di Linux. Artifact ada di `src-tauri/target/release/bundle/`.

Alternatif tanpa mesin build lokal: jalankan workflow manual **Build Linux packages**
di GitHub Actions. Workflow memakai Ubuntu 22.04 x86_64, menjalankan test Rust, lalu
mengunggah `.deb` dan AppImage sebagai artifact. Tetap lakukan checklist smoke test
di Linux Mint target sebelum artifact diterbitkan.

Instal `.deb`:

```bash
bash scripts/install-mint.sh src-tauri/target/release/bundle/deb/NAMA_FILE.deb
```

Jalankan AppImage:

```bash
chmod +x src-tauri/target/release/bundle/appimage/NAMA_FILE.AppImage
./src-tauri/target/release/bundle/appimage/NAMA_FILE.AppImage
```

## Checklist smoke test wajib

Jalankan checklist ini di Mint native sebelum menerbitkan paket:

- Aplikasi muncul di tray dan `Alt + Space` menampilkan/menyembunyikan panel.
- Panel dapat dipindah, di-resize, collapse menjadi bubble, dan selalu di atas.
- LM Studio lokal dan server LAN dapat diuji, model dapat dipilih, streaming dapat dihentikan.
- Riwayat tetap ada setelah restart dan dapat dihapus dari Settings.
- Screenshot fullscreen serta area menghasilkan preview dan dapat dikirim ke model vision.
- Microphone/speaker terdeteksi; Whisper dan Piper dapat diunduh serta dipakai.
- Pencarian web tanpa MCP dan dengan MCP memberikan status serta sumber.
- `.deb` dapat install/upgrade/purge dan AppImage dapat berjalan pada Mint target.
- Clean uninstall hanya menghapus data Floating Assistant milik user aktif.

## Status fitur

| Fitur | Status Linux Mint |
| --- | --- |
| Floating bubble, chat, tray, shortcut | Siap diuji native |
| LM Studio dan SQLite lokal | Siap diuji native |
| Voice STT/TTS | x86_64; siap diuji perangkat audio |
| Screenshot fullscreen/area | X11; siap diuji perangkat |
| Screenshot active window | Belum diimplementasikan; mengembalikan error terkontrol |
| Native rounded-window mask | Fallback transparansi GTK; belum parity Windows |
| Wayland/portal | Belum didukung penuh |

`platform/linux/shape.rs` sengaja merupakan no-op yang aman: aplikasi tetap memakai window transparan Tauri/GTK, tetapi mask native X11 belum dibuat. `platform/linux/window.rs` belum mendapatkan PID jendela aktif sehingga mode screenshot active-window belum tersedia.

## X11, Wayland, dan arsitektur

Gunakan **Cinnamon on Xorg** dari layar login. Screenshot dan active-window di Wayland memerlukan `xdg-desktop-portal` serta flow izin yang berbeda.

Manifest Piper Linux saat ini menyediakan binary amd64. Build ARM64 mungkin berhasil untuk sebagian aplikasi, tetapi TTS harus dinonaktifkan atau diberi artifact ARM64 tersendiri sebelum platform itu dapat didukung.

## Lokasi data dan uninstall bersih

Data default:

```text
~/.local/share/com.localai.assistant/  # settings, model, binary, dan data aplikasi
~/.config/com.localai.assistant/       # database SQLite
~/.cache/com.localai.assistant/        # cache WebKit/aplikasi
```

Path mengikuti `XDG_DATA_HOME`, `XDG_CONFIG_HOME`, dan `XDG_CACHE_HOME` bila environment tersebut diatur.

Clean uninstall paket `.deb`:

```bash
bash /usr/share/floating-assistant/clean-user-data.sh --remove-package
```

Dari working copy:

```bash
bash scripts/uninstall-mint.sh --remove-package
```

Script meminta konfirmasi, memvalidasi seluruh path berada di bawah home user, membersihkan API key Astra dari Secret Service, lalu dapat menjalankan `apt purge`. Helper harus dijalankan sebagai user desktop biasa, bukan melalui `sudo bash`, agar `$HOME` dan keyring menunjuk user yang benar.

Clone MCP, paket dependency apt, toolchain Node/Rust, dan cache Playwright tidak dihapus otomatis. Hapus komponen eksternal tersebut secara terpisah hanya bila dipastikan tidak digunakan proyek lain.

## Debugging

- `WebKitGTK tidak ditemukan`: jalankan ulang `bash scripts/setup-mint.sh`.
- Tray tidak terlihat: pastikan AppIndicator aktif di Cinnamon dan dependency Ayatana terpasang.
- AppImage meminta FUSE: pasang `libfuse2`, atau ekstrak dengan `--appimage-extract` hanya untuk diagnosis.
- Mic/speaker kosong: cek perangkat dengan `arecord -l`, `pactl info`, dan izin user terhadap audio session.
- MCP bekerja di terminal tetapi gagal dari aplikasi: gunakan path absolut untuk `node` dan `dist/index.js`; aplikasi GUI bisa mempunyai `PATH` berbeda.
- Screenshot gagal: pastikan `echo "$XDG_SESSION_TYPE"` menghasilkan `x11`.
