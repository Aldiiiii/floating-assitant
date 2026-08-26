#!/usr/bin/env bash
# Menyiapkan dependency development dan packaging Linux Mint (X11/Cinnamon).
set -euo pipefail

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "Script ini hanya boleh dijalankan di Linux." >&2
  exit 1
fi

echo "==> Memasang paket sistem Tauri, audio, voice, dan packaging..."
sudo apt update

fuse_package="libfuse2"
if apt-cache show libfuse2t64 >/dev/null 2>&1; then
  fuse_package="libfuse2t64"
fi

sudo apt install -y \
  build-essential curl wget pkg-config file patchelf "$fuse_package" \
  libwebkit2gtk-4.1-dev libgtk-3-dev libxdo-dev \
  libssl-dev libayatana-appindicator3-dev librsvg2-dev \
  libasound2-dev libpulse-dev \
  cmake clang gnome-keyring libsecret-tools

if ! command -v rustc >/dev/null 2>&1; then
  echo "==> Memasang Rust melalui rustup..."
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
  # shellcheck disable=SC1091
  source "$HOME/.cargo/env"
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js belum ditemukan. Pasang Node.js 20+ (nvm direkomendasikan), lalu jalankan script ini lagi." >&2
  exit 1
fi

node_major="$(node -p 'Number(process.versions.node.split(`.`)[0])')"
if (( node_major < 20 )); then
  echo "Node.js 20+ diperlukan; versi aktif: $(node -v)." >&2
  exit 1
fi

if [[ "$(uname -m)" != "x86_64" ]]; then
  echo "PERINGATAN: TTS Piper yang dibundel saat ini hanya mendukung x86_64/amd64." >&2
fi

if [[ "${XDG_SESSION_TYPE:-x11}" != "x11" ]]; then
  echo "PERINGATAN: sesi ${XDG_SESSION_TYPE:-tidak diketahui} terdeteksi. Gunakan Cinnamon on Xorg agar screenshot bekerja konsisten." >&2
fi

echo
rustc -V
cargo -V
node -v
npm -v
echo
echo "Setup selesai. Lanjutkan dengan:"
echo "  npm ci"
echo "  npm run tauri dev"
echo
echo "Untuk membuat paket .deb dan AppImage:"
echo "  bash scripts/build-mint.sh"
