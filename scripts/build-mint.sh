#!/usr/bin/env bash
# Build paket Linux Mint: Debian package dan AppImage.
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
project_dir="$(cd -- "$script_dir/.." && pwd)"

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "Build Linux harus dijalankan langsung di Linux Mint/Ubuntu, bukan Windows." >&2
  exit 1
fi

for command_name in node npm cargo; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "$command_name belum tersedia. Jalankan: bash scripts/setup-mint.sh" >&2
    exit 1
  fi
done

if [[ "$(uname -m)" != "x86_64" ]]; then
  echo "PERINGATAN: aplikasi mungkin ter-build, tetapi TTS Piper belum tersedia untuk arsitektur $(uname -m)." >&2
fi

cd "$project_dir"
echo "==> Memasang dependency Node secara reproducible..."
npm ci

echo "==> Membuat .deb dan AppImage..."
npm run tauri build -- --bundles deb,appimage

echo
echo "Artifact:"
find src-tauri/target/release/bundle -maxdepth 3 -type f \
  \( -name '*.deb' -o -name '*.AppImage' \) -print
