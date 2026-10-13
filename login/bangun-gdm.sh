#!/usr/bin/env bash
# Bangun tema layar login (GDM) Memo: isi gresource Yaru apa adanya, lalu
# stylesheet.css ditempel di belakang gdm.css dan gambar memo-*.png ikut
# masuk. Hasil: login/build/gdm-theme.gresource (tidak di-git).
#
#   login/bangun-gdm.sh [sumber.gresource]
#
# Sumber bawaan selalu berkas Yaru asli, bukan /usr/share/gnome-shell/
# gdm-theme.gresource (alternatif itu bisa saja sudah menunjuk tema Memo).
# Bangun ulang setelah pembaruan besar GNOME/Yaru.
#
# Butuh glib-compile-resources (paket libgio-2.0-dev-bin); jalur lain bisa
# diberikan lewat GLIB_COMPILE_RESOURCES.
set -euo pipefail
DI="$(cd "$(dirname "$0")" && pwd)"
SUMBER="${1:-/usr/share/gnome-shell/theme/Yaru/gnome-shell-theme.gresource}"
KOMPILER="${GLIB_COMPILE_RESOURCES:-glib-compile-resources}"
TANDA="=== Memo: login/stylesheet.css ==="

command -v "$KOMPILER" >/dev/null || {
    echo "glib-compile-resources tidak ada: sudo apt install libgio-2.0-dev-bin" >&2
    exit 1
}
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

{ printf '\n/* %s */\n' "$TANDA"; cat "$DI/stylesheet.css"; } >> "$TEMA/gdm.css"
cp "$DI"/memo-*.png "$TEMA/"

{
    echo '<?xml version="1.0" encoding="UTF-8"?>'
    echo '<gresources><gresource prefix="/">'
    (cd "$KERJA" && find org -type f | sort | sed 's#.*#  <file>&</file>#')
    echo '</gresource></gresources>'
} > "$KERJA/tema.gresource.xml"

mkdir -p "$DI/build"
"$KOMPILER" --sourcedir="$KERJA" --target="$DI/build/gdm-theme.gresource" "$KERJA/tema.gresource.xml"
echo "$DI/build/gdm-theme.gresource"
