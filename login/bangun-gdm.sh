#!/usr/bin/env bash
# Bangun tema layar login (GDM) Memo: isi gresource Yaru apa adanya, lalu
# stylesheet.css dan gdm-latar.css ditempel di belakang gdm.css dan gambar
# memo-*.png ikut masuk. Hasil: login/build/gdm-theme.gresource (tidak di-git).
#
#   login/bangun-gdm.sh [sumber.gresource]
#
# Sumber bawaan selalu berkas Yaru asli, bukan /usr/share/gnome-shell/
# gdm-theme.gresource (alternatif itu bisa saja sudah menunjuk tema Memo).
# Bangun ulang setelah pembaruan besar GNOME/Yaru.
#
# Butuh glib-compile-resources (paket libgio-2.0-dev-bin; bila tidak ada,
# salinan di snap core dipakai); jalur lain lewat GLIB_COMPILE_RESOURCES.
#
# MEMO_LATAR: berkas latar layar login yang dirujuk tema (bawaan
# /var/lib/memo/latar-login.png, diurus memo-latar-login.timer).
# MEMO_GDM_KELUAR: folder hasil (bawaan login/build) — uji memakai folder
# sendiri supaya tema yang akan dipasang tidak tertimpa.
set -euo pipefail
DI="$(cd "$(dirname "$0")" && pwd)"
SUMBER="${1:-/usr/share/gnome-shell/theme/Yaru/gnome-shell-theme.gresource}"
LATAR="${MEMO_LATAR:-/var/lib/memo/latar-login.png}"
KELUAR="${MEMO_GDM_KELUAR:-$DI/build}"
TANDA="=== Memo: login/stylesheet.css ==="

KOMPILER="${GLIB_COMPILE_RESOURCES:-}"
if [ -z "$KOMPILER" ]; then
    KOMPILER="$(command -v glib-compile-resources || true)"
    for k in /snap/core*/current/usr/lib/x86_64-linux-gnu/glib-2.0/glib-compile-resources; do
        [ -z "$KOMPILER" ] && [ -x "$k" ] && KOMPILER="$k"
    done
fi
[ -n "$KOMPILER" ] && [ -x "$KOMPILER" ] || {
    echo "glib-compile-resources tidak ada: sudo apt install libgio-2.0-dev-bin" >&2
    exit 1
}
case "$LATAR" in
    *[\#\&\"\\\ ]*) echo "MEMO_LATAR tidak boleh memuat # & \" \\ atau spasi: $LATAR" >&2; exit 1 ;;
    /*) ;;
    *) echo "MEMO_LATAR harus jalur mutlak: $LATAR" >&2; exit 1 ;;
esac
KERJA="$(mktemp -d)"
trap 'rm -rf "$KERJA"' EXIT

for r in $(gresource list "$SUMBER"); do
    mkdir -p "$KERJA/$(dirname "$r")"
    gresource extract "$SUMBER" "$r" > "$KERJA/$r"
done
TEMA="$KERJA/org/gnome/shell/theme"
if [ ! -s "$TEMA/gdm.css" ]; then
    echo "gdm.css tidak ada di $SUMBER" >&2
    exit 1
fi
if grep -q "$TANDA" "$TEMA/gdm.css"; then
    echo "$SUMBER sudah berisi tema Memo; pakai gresource Yaru asli" >&2
    exit 1
fi

{
    printf '\n/* %s */\n' "$TANDA"
    cat "$DI/stylesheet.css"
    sed "s#@LATAR@#$LATAR#" "$DI/gdm-latar.css"
} >> "$TEMA/gdm.css"
cp "$DI"/memo-*.png "$TEMA/"

{
    echo '<?xml version="1.0" encoding="UTF-8"?>'
    echo '<gresources><gresource prefix="/">'
    (cd "$KERJA" && find org -type f | sort | sed 's#.*#  <file>&</file>#')
    echo '</gresource></gresources>'
} > "$KERJA/tema.gresource.xml"

mkdir -p "$KELUAR"
"$KOMPILER" --sourcedir="$KERJA" --target="$KELUAR/gdm-theme.gresource" "$KERJA/tema.gresource.xml"
echo "$KELUAR/gdm-theme.gresource"
