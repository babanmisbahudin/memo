#!/usr/bin/env bash
# Uji extension dynamic-island@local di GNOME Shell headless, tanpa logout.
#
# Semuanya terpisah dari sesi yang sedang dipakai: bus D-Bus sendiri
# (dbus-run-session), dconf sendiri (XDG_CONFIG_HOME sementara), daftar
# extension sendiri (XDG_DATA_HOME sementara, berisi symlink ke extension
# asli + memo-uji@local yang menyalakan unsafe mode untuk Eval/Screenshot),
# dan /dev/shm sendiri (MEMO_SHM). Shell utama dan Memo yang jalan tidak
# tersentuh.
#
#   tests/gnome/uji-island.sh            jalankan skenario, simpan tangkapan layar
#   UJI_SIMPAN=1 tests/gnome/uji-island.sh   jangan hapus folder uji sesudahnya
set -u
DI="$(cd "$(dirname "$0")" && pwd)"
EXT="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/dynamic-island@local"
T="$(mktemp -d -t memo-uji-XXXXXX)"
# Jalur soket AF_UNIX dibatasi 108 karakter, jadi runtime dir dibuat pendek.
RUN="/run/user/$(id -u)/memo-uji-$$"
mkdir -p "$T/config" "$T/shm" "$T/data/gnome-shell/extensions" && mkdir -m 700 "$RUN"
ln -s "$EXT" "$T/data/gnome-shell/extensions/dynamic-island@local"
cp -r "$DI/memo-uji@local" "$T/data/gnome-shell/extensions/"

cat > "$T/mulai.sh" <<'SKRIP'
#!/bin/bash
gsettings set org.gnome.shell disable-user-extensions false
gsettings set org.gnome.shell enabled-extensions "['dynamic-island@local', 'memo-uji@local']"
gsettings set org.gnome.desktop.interface color-scheme prefer-dark
echo "$DBUS_SESSION_BUS_ADDRESS" > "$MEMO_UJI_DIR/bus"
exec gnome-shell --headless --virtual-monitor 1600x900 --wayland --no-x11 --wayland-display="wayland-memo-uji-$PPID"
SKRIP
chmod +x "$T/mulai.sh"

env -u DISPLAY -u WAYLAND_DISPLAY XDG_CONFIG_HOME="$T/config" XDG_DATA_HOME="$T/data" \
    MEMO_SHM="$T/shm" MEMO_UJI_DIR="$T" dbus-run-session -- "$T/mulai.sh" > "$T/shell.log" 2>&1 &
SHELL_PID=$!

MEMO_UJI_DIR="$T" MEMO_UJI_RUN="$RUN" timeout 180 python3 "$DI/skenario.py"
HASIL=$?

for pid in $(pgrep -x gnome-shell); do
    tr '\0' ' ' < "/proc/$pid/cmdline" | grep -q "wayland-memo-uji" && kill "$pid"
done
wait "$SHELL_PID" 2>/dev/null
rm -rf "$RUN"
if [ "${UJI_SIMPAN:-}" = 1 ] || [ $HASIL -ne 0 ]; then
    echo "folder uji disimpan: $T (log: $T/shell.log)"
else
    rm -rf "$T"
fi
exit $HASIL
