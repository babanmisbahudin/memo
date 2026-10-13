#!/usr/bin/env bash
# Uji layar login (GDM) dan layar kunci Memo di GNOME Shell headless.
#
# Terpisah dari sesi yang sedang dipakai seperti uji-island.sh, ditambah:
# bus sistem palsu (dbus-daemon privat + sistem_palsu.py), sehingga GDM,
# logind, dan AccountsService sungguhan tidak pernah dihubungi (shell mode
# GDM mendaftarkan diri ke GDM bila bisa).
#
# 1. Mode GDM: mode turunan "gdm" dari XDG_DATA_DIRS uji, datadir shell
#    diarahkan (GNOME_SHELL_DATADIR) ke salinan berisi login/build/
#    gdm-theme.gresource. Dilewati bila tema tidak bisa dibangun
#    (glib-compile-resources tidak ada).
# 2. Mode user + extension memo-kunci@local: layar dikunci, dibangunkan,
#    prompt sandi ditampilkan, lalu dibuka.
#
#   tests/gnome/uji-login.sh
#   UJI_SIMPAN=1 tests/gnome/uji-login.sh   simpan folder & tangkapan layar
set -u
DI="$(cd "$(dirname "$0")" && pwd)"
LOGIN="$(cd "$DI/../../login" && pwd)"
TEMA="$LOGIN/build/gdm-theme.gresource"
HASIL=0

if ! "$LOGIN/bangun-gdm.sh" >/dev/null; then
    echo "LEWAT mode GDM: tema tidak bisa dibangun (GLIB_COMPILE_RESOURCES=...)"
    TEMA=""
fi

jalankan() {
    local MODE="$1"
    local T RUN SHELL_PID
    T="$(mktemp -d -t memo-login-XXXXXX)"
    RUN="/run/user/$(id -u)/memo-login-$$-$MODE"
    mkdir -p "$T/config" "$T/datadir" "$T/data/gnome-shell/extensions" \
        "$T/sysdata/gnome-shell/extensions" "$T/sysdata/gnome-shell/modes" && mkdir -m 700 "$RUN"
    for f in /usr/share/gnome-shell/*; do ln -s "$f" "$T/datadir/$(basename "$f")"; done
    if [ -n "$TEMA" ]; then
        rm "$T/datadir/gdm-theme.gresource"
        ln -s "$TEMA" "$T/datadir/gdm-theme.gresource"
    fi
    # Ubuntu hanya memuat extension mode dari direktori sistem.
    cp -r "$DI/memo-uji@local" "$T/sysdata/gnome-shell/extensions/"
    echo '{"parentMode": "gdm", "enabledExtensions": ["memo-uji@local"]}' \
        > "$T/sysdata/gnome-shell/modes/memo-uji-gdm.json"
    ln -s "$LOGIN" "$T/data/gnome-shell/extensions/memo-kunci@local"

    cat > "$T/mulai.sh" <<'SKRIP'
#!/bin/bash
gsettings set org.gnome.shell disable-user-extensions false
gsettings set org.gnome.shell enabled-extensions "['memo-uji@local', 'memo-kunci@local']"
echo "$DBUS_SESSION_BUS_ADDRESS" > "$MEMO_UJI_DIR/bus"
dbus-daemon --session --fork --print-address=3 --print-pid=4 3>"$MEMO_UJI_DIR/sistem" 4>"$MEMO_UJI_DIR/sistem.pid"
export DBUS_SYSTEM_BUS_ADDRESS="$(head -1 "$MEMO_UJI_DIR/sistem")"
python3 "$MEMO_UJI_TES/sistem_palsu.py" "$(id -un)" "Baban Misbahudin" > "$MEMO_UJI_DIR/palsu.log" 2>&1 &
for _ in $(seq 50); do grep -q siap "$MEMO_UJI_DIR/palsu.log" 2>/dev/null && break; sleep 0.1; done
exec gnome-shell --headless --virtual-monitor 1600x900 --wayland --no-x11 --mode="$MODE" \
    --wayland-display="wayland-memo-login-$PPID"
SKRIP
    chmod +x "$T/mulai.sh"

    env -u DISPLAY -u WAYLAND_DISPLAY XDG_CONFIG_HOME="$T/config" XDG_DATA_HOME="$T/data" XDG_RUNTIME_DIR="$RUN" \
        XDG_DATA_DIRS="$T/sysdata:${XDG_DATA_DIRS:-/usr/local/share:/usr/share}" GNOME_SHELL_DATADIR="$T/datadir" \
        MEMO_UJI_DIR="$T" MEMO_UJI_TES="$DI" MODE="$MODE" dbus-run-session -- "$T/mulai.sh" > "$T/shell.log" 2>&1 &
    SHELL_PID=$!

    MEMO_UJI_DIR="$T" timeout 120 python3 "$DI/skenario_login.py" "$MODE" || HASIL=1

    for pid in $(pgrep -x gnome-shell); do
        tr '\0' ' ' < "/proc/$pid/cmdline" | grep -q "wayland-memo-login-" && kill "$pid"
    done
    wait "$SHELL_PID" 2>/dev/null
    [ -s "$T/sistem.pid" ] && kill "$(cat "$T/sistem.pid")" 2>/dev/null
    for m in "$RUN/doc" "$RUN/gvfs"; do
        grep -q " $m " /proc/mounts && fusermount3 -uz "$m" 2>/dev/null
    done
    rm -rf "$RUN"
    if [ "${UJI_SIMPAN:-}" = 1 ] || [ $HASIL -ne 0 ]; then
        echo "folder uji $MODE disimpan: $T"
    else
        rm -rf "$T"
    fi
}

[ -n "$TEMA" ] && jalankan memo-uji-gdm
jalankan user
exit $HASIL
