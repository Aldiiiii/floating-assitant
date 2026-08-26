#!/usr/bin/env bash
# Memasang paket .deb hasil build. Berikan path paket secara eksplisit.
set -euo pipefail

package_path="${1:-}"
if [[ -z "$package_path" ]]; then
  echo "Penggunaan: bash scripts/install-mint.sh PATH_KE_FILE.deb" >&2
  exit 2
fi

if [[ "$package_path" != *.deb || ! -f "$package_path" ]]; then
  echo "File .deb tidak ditemukan: $package_path" >&2
  exit 2
fi

package_path="$(realpath -- "$package_path")"
echo "==> Memasang $package_path"
sudo apt install "$package_path"

echo
echo "Instalasi selesai. Buka Floating Assistant dari menu aplikasi."
