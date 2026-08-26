#!/usr/bin/env bash
# Membersihkan data user Floating Assistant dan, bila diminta, paket .deb.
set -euo pipefail

assume_yes=false
remove_package=false

for argument in "$@"; do
  case "$argument" in
    --yes|-y) assume_yes=true ;;
    --remove-package) remove_package=true ;;
    --help|-h)
      echo "Penggunaan: bash uninstall-mint.sh [--yes] [--remove-package]"
      echo "  --yes             Lewati konfirmasi penghapusan data."
      echo "  --remove-package  Purge paket floating-assistant setelah data dibersihkan."
      exit 0
      ;;
    *)
      echo "Argumen tidak dikenal: $argument" >&2
      exit 2
      ;;
  esac
done

if [[ -z "${HOME:-}" || "$HOME" == "/" ]]; then
  echo "HOME tidak valid; pembersihan dibatalkan." >&2
  exit 1
fi

home_path="$(realpath -m -- "$HOME")"
data_path="$(realpath -m -- "${XDG_DATA_HOME:-$HOME/.local/share}/com.localai.assistant")"
config_path="$(realpath -m -- "${XDG_CONFIG_HOME:-$HOME/.config}/com.localai.assistant")"
cache_path="$(realpath -m -- "${XDG_CACHE_HOME:-$HOME/.cache}/com.localai.assistant")"

for target_path in "$data_path" "$config_path" "$cache_path"; do
  case "$target_path" in
    "$home_path"/com.localai.assistant) ;;
    "$home_path"/*/com.localai.assistant) ;;
    *)
      echo "Target pembersihan tidak aman: $target_path" >&2
      exit 1
      ;;
  esac
done

echo "Data berikut akan dihapus permanen:"
printf '  %s\n' "$data_path" "$config_path" "$cache_path"
echo "Termasuk riwayat, pengaturan, cache, model voice, dan binary Piper."

if [[ "$assume_yes" != true ]]; then
  read -r -p "Lanjutkan? [y/N] " answer
  case "$answer" in
    y|Y|yes|YES) ;;
    *) echo "Dibatalkan."; exit 0 ;;
  esac
fi

rm -rf -- "$data_path" "$config_path" "$cache_path"

# API key disimpan oleh keyring Linux, bukan di direktori data aplikasi.
if command -v secret-tool >/dev/null 2>&1; then
  secret-tool clear service astra username brave-api-key target default >/dev/null 2>&1 || true
  secret-tool clear service astra username tavily-api-key target default >/dev/null 2>&1 || true
fi

echo "Data user dan kredensial Floating Assistant telah dibersihkan."
echo "Clone web-search-mcp dan cache Playwright tidak dihapus karena mungkin dipakai proyek lain."

if [[ "$remove_package" == true ]]; then
  echo "==> Menghapus paket aplikasi..."
  sudo apt purge -y floating-assistant
fi
