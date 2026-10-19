#!/bin/sh
# Pilih latar layar login (GDM) menurut jam: tautan
# /var/lib/memo/latar-login.png diarahkan ke latar-<bagian>.png. Dijalankan
# memo-latar-login.timer (sistem, terpasang lewat pasang-gdm.sh) saat boot
# dan tiap pergantian bagian hari, jadi tetap benar walau tidak ada yang
# login. Batas jam = extension/waktuPola.js (dicocokkan tests/test_login.py).
#
# Uji: MEMO_JAM, MEMO_LATAR_SUMBER, MEMO_LATAR_TUJUAN menggantikan jam,
# folder gambar, dan berkas tujuan.
set -eu
SUMBER="${MEMO_LATAR_SUMBER:-/usr/local/share/memo/login}"
TUJUAN="${MEMO_LATAR_TUJUAN:-/var/lib/memo/latar-login.png}"
JAM="${MEMO_JAM:-$(date +%H)}"
JAM=$((${JAM#0} + 0))

if [ "$JAM" -ge 4 ] && [ "$JAM" -lt 11 ]; then
    BAGIAN=pagi
elif [ "$JAM" -ge 11 ] && [ "$JAM" -lt 15 ]; then
    BAGIAN=siang
elif [ "$JAM" -ge 15 ] && [ "$JAM" -lt 18 ]; then
    BAGIAN=sore
else
    BAGIAN=malam
fi

GAMBAR="$SUMBER/latar-$BAGIAN.png"
[ -s "$GAMBAR" ] || { echo "tidak ada $GAMBAR" >&2; exit 1; }
# Tautan baru lalu mv -T: GDM tidak pernah melihat berkas setengah jadi.
ln -sfn "$GAMBAR" "$TUJUAN.baru"
mv -Tf "$TUJUAN.baru" "$TUJUAN"
echo "$BAGIAN"
