# Floating Assistant

Floating Assistant adalah asisten desktop lokal berbasis Tauri 2, React, TypeScript, dan Rust. Aplikasi tampil sebagai bubble/panel always-on-top dan memakai server AI berformat OpenAI-compatible, terutama [LM Studio](https://lmstudio.ai/).

## Fitur

- Chat multi-turn dengan streaming, Markdown, code block, copy, regenerate, dan stop.
- Riwayat lokal di SQLite serta pengaturan yang tersimpan di perangkat.
- Screenshot layar penuh, area, atau jendela aktif untuk model vision.
- Voice lokal: Whisper untuk transkripsi dan Piper untuk pembacaan jawaban.
- Tool deterministik untuk waktu lokal, kalkulator, kurs, berita, pencarian web, pencarian mendalam, dan pembacaan halaman.
- Web Search MCP lokal opsional, dengan DuckDuckGo, Brave, atau Tavily sebagai fallback.

Prompt tetap dikirim ke AI server yang Anda konfigurasi. Bila server berada di perangkat lain, prompt keluar dari komputer ini. Query web dan URL juga keluar ke provider hanya ketika pencarian web digunakan. Riwayat, model voice, dan hasil pengaturan tetap disimpan lokal.

## Dukungan platform

| Kemampuan | Windows 10/11 | Linux Mint Cinnamon X11 |
| --- | --- | --- |
| Chat, tray, global shortcut, LM Studio | Didukung | Didukung dalam source; perlu smoke test native sebelum rilis publik |
| Voice STT/TTS | Didukung | Target x86_64/amd64 |
| Screenshot layar penuh/area | Didukung | X11; perlu uji perangkat |
| Screenshot jendela aktif | Didukung | Belum tersedia |
| Wayland | — | Belum didukung penuh |

Untuk Linux, gunakan sesi **Cinnamon on Xorg**. Paket Linux harus dibangun langsung di Linux Mint/Ubuntu; cross-build dari Windows tidak didukung oleh pipeline ini.

## Instalasi Windows

Gunakan installer NSIS dari `src-tauri/target/release/bundle/nsis/`, atau build sendiri:

```powershell
npm.cmd ci
npm.cmd run tauri build
```

Prasyarat build Windows: Node.js 20+, Rust stable MSVC, Microsoft C++ Build Tools, dan WebView2 Runtime. Lihat [prasyarat resmi Tauri](https://v2.tauri.app/start/prerequisites/).

## Instalasi Linux Mint

### 1. Siapkan mesin build

Prasyarat utama: Linux Mint x86_64, Node.js 20+, akses `sudo`, dan koneksi internet untuk dependency.

```bash
git clone <URL_REPOSITORY_ANDA>
cd floating-assistant
bash scripts/setup-mint.sh
```

Script memasang WebKitGTK, GTK, AppIndicator, audio ALSA/PulseAudio, toolchain voice, Rust bila belum ada, serta dependency `.deb`/AppImage. Daftar paket mengikuti [prasyarat Linux Tauri](https://v2.tauri.app/start/prerequisites/).

### 2. Build paket

```bash
bash scripts/build-mint.sh
```

Artifact berada di:

```text
src-tauri/target/release/bundle/deb/*.deb
src-tauri/target/release/bundle/appimage/*.AppImage
```

Tauri mendukung distribusi Linux melalui `.deb` dan AppImage; lihat [panduan distribusi Tauri](https://v2.tauri.app/distribute/) dan [catatan AppImage](https://v2.tauri.app/distribute/appimage/).

Jika belum mempunyai mesin Mint untuk build, buka tab **Actions → Build Linux packages → Run workflow** di repository GitHub. Workflow manual `.github/workflows/linux-build.yml` membangun di Ubuntu 22.04 dan mengunggah `.deb` serta AppImage sebagai artifact run. Artifact CI tetap perlu smoke test di Mint sebelum didistribusikan.

### 3. Instal `.deb`

Berikan path artifact secara eksplisit:

```bash
bash scripts/install-mint.sh src-tauri/target/release/bundle/deb/NAMA_FILE.deb
```

Atau:

```bash
sudo apt install ./src-tauri/target/release/bundle/deb/NAMA_FILE.deb
```

### 4. Jalankan AppImage tanpa instalasi

```bash
chmod +x src-tauri/target/release/bundle/appimage/NAMA_FILE.AppImage
./src-tauri/target/release/bundle/appimage/NAMA_FILE.AppImage
```

Jika AppImage gagal dimulai, pastikan `libfuse2` (basis Ubuntu 22.04) atau `libfuse2t64` (basis Ubuntu 24.04) tersedia. Jangan build AppImage di distro yang lebih baru daripada distro target karena kompatibilitas `glibc` berjalan ke arah depan, bukan ke belakang.

## Konfigurasi pertama

1. Jalankan LM Studio dan aktifkan Local Server.
2. Buka **Pengaturan → AI server**.
3. Isi base URL, biasanya `http://localhost:1234/v1`.
4. Klik **Uji koneksi**, lalu pilih model aktif.
5. Untuk server LAN/Tailscale, gunakan URL perangkat tersebut dan pastikan firewall mengizinkannya.

Model kecil bekerja lebih konsisten bila tool calling didukung oleh template model. Router deterministik aplikasi tetap menangani pertanyaan umum seperti tanggal, kurs, berita, dan informasi aktual sebelum menyerahkan hasil sumber kepada model.

## Penggunaan

| Aksi | Cara |
| --- | --- |
| Tampilkan/sembunyikan assistant | `Alt + Space` |
| Buka bubble | Klik bubble |
| Ubah panel menjadi bubble | `Esc` |
| Kirim pesan | `Enter` |
| Buat baris baru | `Shift + Enter` |
| Lampirkan konteks layar | Tombol gambar di composer |
| Rekam suara | Tahan/klik tombol mikrofon sesuai mode di Pengaturan |
| Batalkan pemilihan area | `Esc` |

Untuk pencarian aktual, cukup bertanya normal, misalnya `berapa 1 USD ke IDR saat ini?`, `tampilkan 10 berita Bogor terbaru`, atau `apakah hari ini libur nasional?`. UI menampilkan status pencarian dan daftar sumber bila tool web digunakan.

## Menyiapkan dan menambahkan tools

### Tools bawaan

Tool `local_time` dan `calculator` berjalan tanpa internet. `currency_rate` dan `news_search` memakai endpoint terstruktur, sedangkan `web_search`, `deep_search`, dan `read_page` dapat memakai MCP lokal atau provider fallback.

Aktifkan **Pengaturan → Pencarian web → Izinkan pencarian web**. Tanpa MCP, pilih DuckDuckGo atau masukkan API key Brave/Tavily. API key disimpan di keyring sistem operasi.

### Menambahkan Web Search MCP lokal

Floating Assistant memakai fork [Aldiiiii/web-search-mcp](https://github.com/Aldiiiii/web-search-mcp) yang menghasilkan JSON terstruktur, menjaga log MCP di `stderr`, dan menambahkan pembatasan URL publik. Baseline yang telah disesuaikan dengan aplikasi ini adalah commit `0f4e12b`; branch `main` fork digunakan selama pengembangan aktif.

Dari root repository Floating Assistant, clone dan build fork tersebut.

Windows PowerShell:

```powershell
New-Item -ItemType Directory -Force tools | Out-Null
git clone --branch main --single-branch https://github.com/Aldiiiii/web-search-mcp.git tools/web-search-mcp
Set-Location tools/web-search-mcp
npm.cmd ci
npm.cmd run build
npx.cmd playwright install chromium firefox
```

Linux Mint atau Git Bash:

```bash
mkdir -p tools
git clone --branch main --single-branch https://github.com/Aldiiiii/web-search-mcp.git tools/web-search-mcp
cd tools/web-search-mcp
npm ci
npm run build
npx playwright install --with-deps chromium firefox
```

Di **Pengaturan → Pencarian web**:

1. Isi path absolut ke `tools/web-search-mcp/dist/index.js`.
2. Isi runtime Node; di Linux sebaiknya path absolut dari `command -v node`.
3. Aktifkan konten penuh bila ingin ekstraksi halaman lebih kaya.
4. Klik **Cek** dan pastikan jumlah tool terdeteksi.

Implementasi MCP saat ini bukan host MCP generik. Runtime aplikasi secara khusus memanggil tool `web_search`, `deep_search`, dan `read_page` dari fork tersebut. Menambah server/tool MCP sembarang ke UI belum cukup untuk membuat model dapat memakainya.

### Menambahkan tool aplikasi baru sebagai developer

Satu tool baru perlu dihubungkan di seluruh pipeline:

1. Tambahkan schema fungsi di `tool_definitions()` pada `src-tauri/src/llm.rs`.
2. Tambahkan variant `ModelTool` serta parser native/JSON/XML bila diperlukan.
3. Tambahkan routing deterministik hanya jika intent dapat dikenali dengan aman.
4. Implementasikan eksekusi dan format evidence/sumber.
5. Tambahkan unit test routing, parsing, kegagalan, dan grounding.
6. Bila tool berasal dari MCP, tambahkan adapter bernama di `src-tauri/src/web_search.rs` atau modul khusus; jangan meneruskan nama/argumen tool tak dikenal langsung dari model.

Panduan MCP lebih rinci tersedia di [docs/mcp-setup.md](docs/mcp-setup.md).

## Development

Windows:

```powershell
npm.cmd ci
npm.cmd run tauri dev
```

Linux Mint:

```bash
bash scripts/setup-mint.sh
npm ci
npm run tauri dev
```

Verifikasi dasar:

```bash
npm run build
cd src-tauri
cargo test
```

## Uninstall bersih dan clean install

Peringatan: clean uninstall menghapus riwayat, pengaturan, model voice yang telah diunduh, binary Piper, cache, serta API key web. Data tersebut tidak dapat dipulihkan.

### Windows

Uninstall melalui **Installed apps**. Hook NSIS membersihkan `%APPDATA%\com.localai.assistant` dan `%LOCALAPPDATA%\com.localai.assistant` setelah paket dihapus.

### Linux Mint `.deb`

Jalankan helper **sebelum** paket dihapus:

```bash
bash /usr/share/floating-assistant/clean-user-data.sh --remove-package
```

Saat bekerja dari repository, perintah ekuivalennya:

```bash
bash scripts/uninstall-mint.sh --remove-package
```

Script meminta konfirmasi dan hanya menghapus direktori aplikasi yang telah divalidasi di bawah `$HOME`. Gunakan `--yes` hanya untuk otomasi yang memang menginginkan penghapusan permanen.

### AppImage

AppImage tidak memiliki uninstaller. Bersihkan data dengan script repository, lalu hapus file AppImage:

```bash
bash scripts/uninstall-mint.sh
rm ./NAMA_FILE.AppImage
```

Data Linux yang dibersihkan:

```text
${XDG_DATA_HOME:-~/.local/share}/com.localai.assistant
${XDG_CONFIG_HOME:-~/.config}/com.localai.assistant
${XDG_CACHE_HOME:-~/.cache}/com.localai.assistant
```

Clone `web-search-mcp`, instalasi Node.js, dependency sistem, dan cache browser Playwright sengaja tidak dihapus karena merupakan dependency development/eksternal dan mungkin dipakai proyek lain.

Untuk **clean install**, lakukan clean uninstall di atas, restart sesi bila keyring masih menahan credential, lalu pasang kembali `.deb` atau jalankan AppImage baru dan ulangi konfigurasi LM Studio/tools.

## Dokumentasi

- [Development dan kompatibilitas Linux Mint](docs/linux-dev.md)
- [Setup Web Search MCP](docs/mcp-setup.md)
- [Product Requirements](../PRD.md)
