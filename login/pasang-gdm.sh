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
#
# Latar menurut jam: gambar latar-*.png ke /usr/local/share/memo/login,
# latar-login.sh ke /usr/local/lib/memo, dan memo-latar-login.timer (sistem)
# yang mengarahkan /var/lib/memo/latar-login.png ke gambar bagian hari ini
# saat boot dan pada 04.00, 11.00, 15.00, 18.00.
set -euo pipefail
DI="$(cd "$(dirname "$0")" && pwd)"
NAMA=gdm-theme.gresource
TAUTAN=/usr/share/gnome-shell/$NAMA
TUJUAN=/usr/local/share/gnome-shell/theme/memo/$NAMA
GAMBAR=/usr/local/share/memo/login
SKRIP=/usr/local/lib/memo/latar-login.sh
UNIT=/etc/systemd/system
STATUS=/var/lib/memo

if [ "$(id -u)" -ne 0 ]; then
    echo "Perlu root: sudo $0 $*" >&2
    exit 1
fi

if [ "${1:-}" = "--lepas" ]; then
    update-alternatives --remove "$NAMA" "$TUJUAN" 2>/dev/null || true
    update-alternatives --auto "$NAMA"
    rm -f "$TUJUAN"
    rmdir --ignore-fail-on-non-empty "$(dirname "$TUJUAN")" 2>/dev/null || true
    systemctl disable --now memo-latar-login.timer 2>/dev/null || true
    rm -f "$UNIT/memo-latar-login.timer" "$UNIT/memo-latar-login.service" "$SKRIP"
    systemctl daemon-reload
    rm -rf "$GAMBAR" "$STATUS"
    rmdir --ignore-fail-on-non-empty /usr/local/share/memo /usr/local/lib/memo 2>/dev/null || true
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
# Tema uji (MEMO_LATAR lain) tidak boleh terpasang.
gresource extract "$SUMBER" /org/gnome/shell/theme/gdm.css | grep -q "file://$STATUS/latar-login.png" || {
    echo "$SUMBER tidak merujuk $STATUS/latar-login.png; bangun ulang tanpa MEMO_LATAR." >&2
    exit 1
}
for b in pagi siang sore malam; do
    [ -s "$DI/latar-$b.png" ] || { echo "$DI/latar-$b.png tidak ada, batal." >&2; exit 1; }
done

# Latar menurut jam dulu: begitu tema terpasang, tautannya sudah ada.
install -d -m 0755 "$GAMBAR" "$STATUS" "$(dirname "$SKRIP")"
install -m 0644 "$DI"/latar-pagi.png "$DI"/latar-siang.png "$DI"/latar-sore.png "$DI"/latar-malam.png "$GAMBAR/"
install -m 0755 "$DI/latar-login.sh" "$SKRIP"
install -m 0644 "$DI/memo-latar-login.service" "$DI/memo-latar-login.timer" "$UNIT/"
systemctl daemon-reload
systemctl enable --now memo-latar-login.timer
systemctl start memo-latar-login.service
echo "latar layar login: $(readlink "$STATUS/latar-login.png")"

install -D -m 0644 "$SUMBER" "$TUJUAN"
# Prioritas 0: mode otomatis tetap memilih Yaru; Memo dipilih manual.
update-alternatives --install "$TAUTAN" "$NAMA" "$TUJUAN" 0
update-alternatives --set "$NAMA" "$TUJUAN"
update-alternatives --display "$NAMA" | head -2
echo "Terpasang. Terlihat di layar login berikutnya (Log Out)."
