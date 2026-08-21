# Floating Assistant

Desktop AI assistant lokal berbasis Tauri, React, dan TypeScript. Aplikasi berjalan sebagai bubble yang selalu mudah dijangkau di atas aplikasi lain, lalu dapat diperluas menjadi panel percakapan. Model AI disediakan oleh [LM Studio](https://lmstudio.ai/) melalui API yang kompatibel dengan OpenAI.

## Fitur MVP

- Floating bubble yang dapat dipindahkan, diminimalkan, dan dibuka dengan `Alt + Space`.
- Chat multi-turn dengan streaming, Markdown, code block, copy respons, dan stop generation.
- Riwayat percakapan lokal menggunakan SQLite.
- Screenshot layar penuh, jendela aktif, atau area tertentu untuk model vision.
- Pengaturan alamat LM Studio, model aktif, always-on-top, dan start minimized.
- Data dan riwayat tetap lokal; screenshot tidak disimpan permanen.

## Teknologi

- [Tauri 2](https://v2.tauri.app/)
- React 19 + TypeScript + Vite
- Tailwind CSS
- Rust
- SQLite melalui Tauri SQL plugin
- LM Studio (OpenAI-compatible API)

## Prasyarat

Untuk Windows, siapkan:

- Node.js 20 atau lebih baru
- Rust stable dengan target `x86_64-pc-windows-msvc`
- Microsoft C++ Build Tools / Visual Studio Build Tools
- WebView2 Runtime (umumnya sudah tersedia di Windows 11)
- LM Studio, jika ingin memakai model AI lokal

Ikuti [panduan prasyarat Tauri untuk Windows](https://v2.tauri.app/start/prerequisites/) bila environment Rust/Tauri belum tersedia.

## Menjalankan development

```powershell
git clone <URL_REPOSITORY_ANDA>
cd floating-assistant
npm install
npm run tauri dev
```

Jika PowerShell memblokir `npm.ps1`, gunakan:

```powershell
npm.cmd run tauri dev
```

Saat aplikasi terbuka, buka Pengaturan lalu pastikan LM Studio Server sedang berjalan. Alamat defaultnya:

```text
http://localhost:1234/v1
```

Untuk AI server pada perangkat lain, masukkan alamat LAN atau Tailscale yang sesuai, misalnya:

```text
http://100.x.x.x:1234/v1
```

## Shortcut dan interaksi

| Aksi | Cara |
| --- | --- |
| Tampilkan/sembunyikan assistant | `Alt + Space` |
| Buka bubble | Klik bubble |
| Pindahkan bubble/panel | Geser atau tahan lalu geser |
| Panel menjadi bubble | `Esc` saat panel terbuka |
| Sembunyikan bubble | `Esc` saat bubble aktif |
| Kirim pesan | `Enter` |
| Baris baru | `Shift + Enter` |
| Batalkan pemilihan area screenshot | `Esc` |

## Build

Build frontend saja:

```powershell
npm run build
```

Build aplikasi desktop dan installer Windows:

```powershell
npm run tauri build
```

Jika PowerShell memblokir executable npm, ganti `npm` dengan `npm.cmd`. Hasil bundle Tauri berada di `src-tauri/target/release/bundle/`.

## Struktur proyek

```text
src/                 UI React, state, dan integrasi frontend
src/components/      Bubble, chat, screenshot, settings, history
src/lib/             API Tauri, database, dan window behavior
src/stores/          Zustand state untuk chat dan settings
src-tauri/src/       Command Rust: LLM, screenshot, dan window shape
```
