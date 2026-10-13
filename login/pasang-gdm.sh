#!/usr/bin/env bash
# Pasang / lepas tema layar login (GDM) Memo. Perlu root:
#
#   sudo login/pasang-gdm.sh           pasang login/build/gdm-theme.gresource
#   sudo login/pasang-gdm.sh --lepas   kembali ke Yaru
#
# Lewat update-alternatives (cara Ubuntu memilih tema GDM), jadi berkas Yaru
# tidak disentuh. Tema baru terlihat di layar login berikutnya (setelah Log
# Out). Bila layar login rusak: Ctrl+Alt+F3, masuk, lalu
#   sudo update-alternatives --auto gdm-theme.gresource
set -euo pipefail
DI="$(cd "$(dirname "$0")" && pwd)"
NAMA=gdm-theme.gresource
TAUTAN=/usr/share/gnome-shell/$NAMA
TUJUAN=/usr/local/share/gnome-shell/theme/memo/$NAMA

if [ "$(id -u)" -ne 0 ]; then
    echo "Perlu root: sudo $0 $*" >&2
    exit 1
fi

if [ "${1:-}" = "--lepas" ]; then
    update-alternatives --remove "$NAMA" "$TUJUAN" 2>/dev/null || true
    update-alternatives --auto "$NAMA"
    rm -f "$TUJUAN"
    rmdir --ignore-fail-on-non-empty "$(dirname "$TUJUAN")" 2>/dev/null || true
    update-alternatives --display "$NAMA" | head -2
    exit 0
fi

SUMBER="$DI/build/$NAMA"
if [ ! -s "$SUMBER" ]; then
    echo "$SUMBER belum ada; jalankan login/bangun-gdm.sh dulu (tanpa sudo)." >&2
    exit 1
fi
# Jangan pasang gresource yang tidak bisa dibaca atau tanpa gdm.css: GDM
# tidak punya cadangan bila stylesheet-nya hilang.
gresource list "$SUMBER" | grep -qx /org/gnome/shell/theme/gdm.css || {
    echo "$SUMBER tidak berisi gdm.css, batal." >&2
    exit 1
}
install -D -m 0644 "$SUMBER" "$TUJUAN"
# Prioritas 0: mode otomatis tetap memilih Yaru; Memo dipilih manual.
update-alternatives --install "$TAUTAN" "$NAMA" "$TUJUAN" 0
update-alternatives --set "$NAMA" "$TUJUAN"
update-alternatives --display "$NAMA" | head -2
echo "Terpasang. Terlihat di layar login berikutnya (Log Out)."
