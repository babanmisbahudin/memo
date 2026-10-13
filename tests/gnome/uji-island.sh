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
# Yang diuji adalah extension/ di repo ini, bukan salinan yang terpasang.
EXT="$(cd "$DI/../../extension" && pwd)"
T="$(mktemp -d -t memo-uji-XXXXXX)"
# Jalur soket AF_UNIX dibatasi 108 karakter, jadi runtime dir dibuat pendek.
RUN="/run/user/$(id -u)/memo-uji-$$"
mkdir -p "$T/config" "$T/shm" "$T/data/gnome-shell/extensions" && mkdir -m 700 "$RUN"
ln -s "$EXT" "$T/data/gnome-shell/extensions/dynamic-island@local"
cp -r "$DI/memo-uji@local" "$T/data/gnome-shell/extensions/"

# Pembuka palsu untuk uji "Memo buka youtube/folder/aplikasi": jadi aplikasi
# bawaan http/https/folder di shell uji, hanya mencatat apa yang dibuka.
mkdir -p "$T/data/applications"
printf '#!/bin/sh\necho "buka:$*" >> "%s/dibuka"\n' "$T" > "$T/catat-buka.sh" && chmod +x "$T/catat-buka.sh"
cat > "$T/data/applications/memo-uji-pembuka.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Memo Uji Pembuka
Exec=$T/catat-buka.sh %U
MimeType=x-scheme-handler/http;x-scheme-handler/https;inode/directory;
DESKTOP
printf '[Default Applications]\nx-scheme-handler/http=memo-uji-pembuka.desktop\nx-scheme-handler/https=memo-uji-pembuka.desktop\ninode/directory=memo-uji-pembuka.desktop\n' \
    > "$T/config/mimeapps.list"

cat > "$T/mulai.sh" <<'SKRIP'
#!/bin/bash
gsettings set org.gnome.shell disable-user-extensions false
gsettings set org.gnome.shell enabled-extensions "['dynamic-island@local', 'memo-uji@local']"
gsettings set org.gnome.desktop.interface color-scheme prefer-dark
echo "$DBUS_SESSION_BUS_ADDRESS" > "$MEMO_UJI_DIR/bus"
echo "wayland-memo-uji-$PPID" > "$MEMO_UJI_DIR/wayland"
exec gnome-shell --headless --virtual-monitor 1600x900 --wayland --no-x11 --wayland-display="wayland-memo-uji-$PPID"
SKRIP
chmod +x "$T/mulai.sh"

# XDG_RUNTIME_DIR sendiri juga: shell menulis penanda
# gnome-shell-disable-extensions di sana, dan bila penanda itu tertinggal di
# runtime dir sesi asli, login berikutnya mematikan semua extension.
env -u DISPLAY -u WAYLAND_DISPLAY XDG_CONFIG_HOME="$T/config" XDG_DATA_HOME="$T/data" XDG_RUNTIME_DIR="$RUN" \
    MEMO_SHM="$T/shm" MEMO_UJI_DIR="$T" MEMO_SAMBUTAN_UJI=1 dbus-run-session -- "$T/mulai.sh" > "$T/shell.log" 2>&1 &
SHELL_PID=$!

MEMO_UJI_DIR="$T" MEMO_UJI_RUN="$RUN" timeout 180 python3 "$DI/skenario.py"
HASIL=$?

for pid in $(pgrep -x gnome-shell); do
    tr '\0' ' ' < "/proc/$pid/cmdline" | grep -q "wayland-memo-uji" && kill "$pid"
done
wait "$SHELL_PID" 2>/dev/null
# Portal dokumen & gvfs dari bus uji memasang FUSE di $RUN; lepas dulu.
for m in "$RUN/doc" "$RUN/gvfs"; do
    grep -q " $m " /proc/mounts && fusermount3 -uz "$m" 2>/dev/null
done
rm -rf "$RUN"
if [ "${UJI_SIMPAN:-}" = 1 ] || [ $HASIL -ne 0 ]; then
    echo "folder uji disimpan: $T (log: $T/shell.log)"
else
    rm -rf "$T"
fi
exit $HASIL
