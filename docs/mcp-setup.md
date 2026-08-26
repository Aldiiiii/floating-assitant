# Web Search MCP: setup dan operasional

Floating Assistant dapat browsing tanpa MCP melalui provider HTTP bawaan. Jika `web-search-mcp` dikonfigurasi, MCP menjadi jalur utama pencarian web umum; provider HTTP menjadi fallback. Berita dan kurs memakai sumber terstruktur khusus terlebih dahulu.

Gunakan fork [Aldiiiii/web-search-mcp](https://github.com/Aldiiiii/web-search-mcp). Fork ini mempertahankan `upstream` asli tetapi menyesuaikan output, logging, ekstraksi, dan keamanan URL untuk kontrak evidence Floating Assistant. Baseline kompatibilitas saat ini adalah commit `0f4e12b` pada branch `main`.

## Build MCP

Prasyarat: Node.js 18+ untuk server MCP. Aplikasi utamanya sendiri menggunakan Node.js 20+ saat development.

Clone satu kali dari root repository Floating Assistant.

Windows PowerShell:

```powershell
New-Item -ItemType Directory -Force tools | Out-Null
git clone --branch main --single-branch https://github.com/Aldiiiii/web-search-mcp.git tools/web-search-mcp
```

Linux Mint atau Git Bash:

```bash
mkdir -p tools
git clone --branch main --single-branch https://github.com/Aldiiiii/web-search-mcp.git tools/web-search-mcp
```

Windows:

```powershell
cd tools/web-search-mcp
npm.cmd ci
npm.cmd run build
npx.cmd playwright install chromium firefox
```

Linux Mint:

```bash
cd tools/web-search-mcp
npm ci
npm run build
npx playwright install --with-deps chromium firefox
```

Di **Pengaturan → Pencarian web**, isi:

- **Path MCP**: path absolut ke `tools/web-search-mcp/dist/index.js`.
- **Runtime Node**: `node`, atau sebaiknya path absolut binary Node pada Linux GUI (`command -v node`).
- **Konten halaman penuh**: aktif agar `web_search`/`deep_search` mencoba mengekstrak isi; nonaktif agar lebih cepat dan hemat konteks.

Klik **Cek**. Status sehat menampilkan jumlah tool yang dilaporkan server. Pemeriksaan ini memastikan proses dan protokol dapat berjalan, tetapi bukan jaminan semua mesin pencari sedang dapat diakses.

## Tools MCP yang dipakai aplikasi

Adapter runtime saat ini mengenali tiga operasi bernama:

- `web_search`: hasil pencarian umum.
- `deep_search`: pencarian dan ekstraksi beberapa halaman.
- `read_page`: membaca satu URL HTTP(S) publik.

Client MCP di aplikasi bukan registry tool generik. Menambahkan server MCP lain di filesystem tidak otomatis mengekspos tool baru ke model. Tool baru perlu adapter Rust, schema model, eksekutor, kebijakan keamanan, dan test sebagaimana dijelaskan di README.

## Urutan retrieval

1. Kurs/berita mencoba endpoint terstruktur khusus.
2. Pencarian umum mencoba Web Search MCP bila dikonfigurasi.
3. Provider DuckDuckGo, Brave, atau Tavily menjadi fallback.
4. Halaman statis dibaca lewat HTTP; browser Playwright dipakai server MCP untuk halaman dinamis/fallback.
5. Evidence diranking, dideduplikasi, dan diperiksa sebelum jawaban ditampilkan.

## Troubleshooting

- `File MCP tidak ditemukan`: jalankan build dan gunakan path absolut `dist/index.js`.
- `Gagal menjalankan Node.js`: gunakan path absolut dari `where.exe node` (Windows) atau `command -v node` (Linux).
- Browser executable tidak ditemukan: jalankan ulang `npx playwright install`.
- Linux gagal meluncurkan browser: jalankan `npx playwright install --with-deps chromium firefox`.
- Status sehat tetapi pencarian kosong: periksa log stderr MCP; mesin pencari dapat memblokir otomasi atau mengubah markup.
- Hasil hanya snippet: aktifkan konten penuh dan periksa status ekstraksi di log.
- Halaman intranet/localhost ditolak: ini pembatasan keamanan `read_page`, bukan error setup.

## Privasi dan lifecycle

Browsing mengirim query ke mesin pencari dan mengunjungi URL hasil. Jawaban serta URL sumber tersimpan bersama riwayat percakapan. Jangan memasukkan rahasia ke query web.

Clone `web-search-mcp` dan browser Playwright berada di luar data aplikasi. Clean uninstall Floating Assistant tidak menghapus keduanya karena dapat dipakai proyek lain. Hapus manual hanya bila kepemilikannya jelas.
