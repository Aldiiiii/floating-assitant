#!/usr/bin/env bash
# Instal dependency development untuk Linux Mint (X11/Cinnamon).
set -euo pipefail

echo "==> Memasang paket sistem..."
sudo apt update
sudo apt install -y \
  build-essential curl pkg-config file \
  libwebkit2gtk-4.1-dev libgtk-3-dev \
  libasound2-dev libpulse-dev \
  cmake clang libssl-dev

if ! command -v rustc >/dev/null 2>&1; then
  echo "==> Memasang Rust (rustup)..."
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
  # shellcheck disable=SC1091
  source "$HOME/.cargo/env"
fi

rustc -V && cargo -V && node -v 2>/dev/null || echo "NOTE: Node.js belum ada — pasang lewat nvm atau apt."

echo ""
echo "Selesai! Lanjutkan dengan:"
echo "  npm install"
echo "  npm run tauri dev"
