#!/usr/bin/env python3
"""Pasang / lepas sambungan Memo ke agen coding dan ke systemd.

  memo-pasang.py claude          hook Claude Code di ~/.claude/settings.json
  memo-pasang.py opencode        plugin di ~/.config/opencode/plugins/memo.js
  memo-pasang.py extension       symlink extension/ ke GNOME Shell (dynamic-island@local)
  memo-pasang.py layanan         service memo-agen + memo-integrasi (systemd --user)
  memo-pasang.py status          apa saja yang sudah terpasang
  tambah --lepas untuk melepas, --ya untuk tidak bertanya.

Aturan Coucou untuk settings.json: tidak pernah ditimpa begitu saja —
cadangan bertanggal, digabung (hook lain tetap utuh), diff ditampilkan,
baru ditulis setelah dikonfirmasi.
"""

import argparse
import datetime
import difflib
import json
import os
import pathlib
import shutil
import subprocess
import sys

AKAR = pathlib.Path(__file__).resolve().parent
HOOK = str(AKAR / "memo-hook.py")
PENANDA = "memo-hook.py"

SETTINGS_CLAUDE = pathlib.Path.home() / ".claude" / "settings.json"
PLUGIN_OPENCODE = pathlib.Path(os.environ.get("XDG_CONFIG_HOME") or pathlib.Path.home() / ".config") / "opencode" / "plugins" / "memo.js"
EXT_UUID = "dynamic-island@local"
SUMBER_EXT = AKAR.parent / "extension"
DIR_EXT = pathlib.Path(os.environ.get("XDG_DATA_HOME") or pathlib.Path.home() / ".local" / "share") / "gnome-shell" / "extensions" / EXT_UUID
DIR_SYSTEMD = pathlib.Path(os.environ.get("XDG_CONFIG_HOME") or pathlib.Path.home() / ".config") / "systemd" / "user"

# Event Claude Code yang dikirim ke Memo, dan batas waktunya (detik). Hanya
# PermissionRequest yang lama: relay menunggu klik maks 110 detik.
EVENT_CLAUDE = {
    "SessionStart": 5, "UserPromptSubmit": 5, "PreToolUse": 5, "PostToolUse": 5,
    "PostToolUseFailure": 5, "PermissionRequest": 120, "Notification": 5,
    "Stop": 5, "StopFailure": 5, "SessionEnd": 5,
}
EVENT_BERMATCHER = ("PreToolUse", "PostToolUse", "PostToolUseFailure", "PermissionRequest")


def _milik_memo(h):
    return isinstance(h, dict) and PENANDA in str(h.get("command", ""))


def lepas_hook(settings):
    """Salinan settings tanpa hook Memo; grup dan event yang kosong ikut hilang."""
    hasil = json.loads(json.dumps(settings))
    hooks = hasil.get("hooks")
    if not isinstance(hooks, dict):
        return hasil
    for event in list(hooks):
        grup_baru = []
        for grup in hooks[event] if isinstance(hooks[event], list) else []:
            if not isinstance(grup, dict):
                grup_baru.append(grup)
                continue
            sisa = [h for h in grup.get("hooks", []) if not _milik_memo(h)]
            if sisa:
                grup_baru.append({**grup, "hooks": sisa})
        if grup_baru:
            hooks[event] = grup_baru
        else:
            del hooks[event]
    if not hooks:
        del hasil["hooks"]
    return hasil


def pasang_hook(settings, perintah=HOOK):
    """Salinan settings dengan hook Memo terpasang tepat sekali per event."""
    hasil = lepas_hook(settings)
    hooks = hasil.setdefault("hooks", {})
    for event, batas in EVENT_CLAUDE.items():
        grup = {"hooks": [{"type": "command", "command": perintah, "timeout": batas}]}
        if event in EVENT_BERMATCHER:
            grup = {"matcher": "*", **grup}
        hooks.setdefault(event, []).append(grup)
    return hasil


def _json(d):
    return json.dumps(d, indent=2, ensure_ascii=False) + "\n"


def _konfirmasi(teks, ya):
    if ya:
        return True
    if not sys.stdin.isatty():
        print("Tidak ada terminal untuk bertanya; ulangi dengan --ya untuk menulis.")
        return False
    return input(f"{teks} [y/N] ").strip().lower() in ("y", "ya", "yes")


def tulis_dengan_diff(path, lama, baru, ya):
    if lama == baru:
        print(f"{path}: tidak ada yang berubah.")
        return True
    sys.stdout.writelines(difflib.unified_diff(
        lama.splitlines(True), baru.splitlines(True), f"{path} (sekarang)", f"{path} (baru)"))
    if not _konfirmasi(f"\nTulis perubahan ke {path}?", ya):
        print("Dibatalkan, tidak ada yang ditulis.")
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        cap = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
        cadangan = path.with_name(f"{path.name}.memo-{cap}.bak")
        shutil.copy2(path, cadangan)
        print(f"Cadangan: {cadangan}")
    tmp = path.with_name(path.name + ".memo-tmp")
    tmp.write_text(baru, encoding="utf-8")
    os.replace(tmp, path)
    print(f"Tertulis: {path}")
    return True


def cmd_claude(lepas, ya, path=SETTINGS_CLAUDE):
    lama = path.read_text(encoding="utf-8") if path.exists() else "{}\n"
    try:
        settings = json.loads(lama)
    except ValueError:
        print(f"{path} bukan JSON yang sah — tidak disentuh.", file=sys.stderr)
        return 1
    baru = lepas_hook(settings) if lepas else pasang_hook(settings)
    teks_lama = lama if path.exists() else ""
    return 0 if tulis_dengan_diff(path, teks_lama, _json(baru), ya) else 1


PLUGIN_JS = """// Plugin Memo untuk OpenCode — dibuat oleh memo-pasang.py.
// Meneruskan event OpenCode ke relay Memo, fire-and-forget: OpenCode tidak
// pernah menunggu, dan tidak terjadi apa-apa bila Memo mati.
import { spawn } from 'node:child_process';

const HOOK = %s;
const PETA = {
  'session.created': 'SessionStart',
  'session.idle': 'Stop',
  'session.error': 'StopFailure',
  'session.deleted': 'SessionEnd',
};

function teruskan(hook_event_name, payload) {
  try {
    const p = spawn(HOOK, ['--agent', 'opencode'], { stdio: ['pipe', 'ignore', 'ignore'], detached: true });
    p.on('error', () => {});
    p.stdin.on('error', () => {});
    p.stdin.end(JSON.stringify({ hook_event_name, ...payload }) + '\\n');
    p.unref();
  } catch {}
}

export const MemoPlugin = async ({ directory } = {}) => ({
  event: async ({ event }) => {
    const nama = PETA[event?.type];
    if (!nama) return;
    const props = event.properties || {};
    teruskan(nama, { session_id: props.sessionID || props.info?.id || '', cwd: directory || '' });
  },
  'chat.message': async (input, output) => {
    const teks = (output?.parts || []).filter(p => p?.type === 'text').map(p => p.text).join(' ');
    teruskan('UserPromptSubmit', { session_id: input?.sessionID || '', cwd: directory || '', prompt: teks.slice(0, 500) });
  },
  'tool.execute.before': async (input, output) => {
    teruskan('PreToolUse', { session_id: input?.sessionID || '', cwd: directory || '',
      tool_name: typeof input?.tool === 'string' ? input.tool : '', tool_input: output?.args ?? null });
  },
  'tool.execute.after': async (input) => {
    teruskan('PostToolUse', { session_id: input?.sessionID || '', cwd: directory || '',
      tool_name: typeof input?.tool === 'string' ? input.tool : '', tool_input: input?.args ?? null });
  },
});
"""


def cmd_opencode(lepas, ya, path=PLUGIN_OPENCODE):
    if lepas:
        if path.exists() and _konfirmasi(f"Hapus {path}?", ya):
            path.unlink()
            print(f"Dihapus: {path}")
        return 0
    lama = path.read_text(encoding="utf-8") if path.exists() else ""
    return 0 if tulis_dengan_diff(path, lama, PLUGIN_JS % json.dumps(HOOK), ya) else 1


def unit(nama, deskripsi, perintah):
    return f"""[Unit]
Description={deskripsi}
PartOf=graphical-session.target
After=graphical-session.target

[Service]
Type=simple
ExecStart={perintah}
Restart=on-failure
RestartSec=3

[Install]
WantedBy=graphical-session.target
"""


LAYANAN = {
    "memo-agen.service": ("Memo — sesi agen coding & kartu izin (ala Coucou)",
                          f"/usr/bin/python3 {AKAR / 'memo-agen.py'}"),
    "memo-integrasi.service": ("Memo — pill integrasi + kabar LebihTeratur",
                               f"/usr/bin/python3 {AKAR / 'memo-integrasi.py'}"),
}


def _systemctl(*arg):
    return subprocess.run(["systemctl", "--user", *arg], capture_output=True, text=True)


def cmd_layanan(lepas, ya):
    if lepas:
        for nama in LAYANAN:
            _systemctl("disable", "--now", nama)
            (DIR_SYSTEMD / nama).unlink(missing_ok=True)
            print(f"Dilepas: {nama}")
        _systemctl("daemon-reload")
        return 0
    DIR_SYSTEMD.mkdir(parents=True, exist_ok=True)
    for nama, (desk, perintah) in LAYANAN.items():
        (DIR_SYSTEMD / nama).write_text(unit(nama, desk, perintah), encoding="utf-8")
    _systemctl("daemon-reload")
    for nama in LAYANAN:
        r = _systemctl("enable", "--now", nama)
        _systemctl("restart", nama)
        print(f"{nama}: {'aktif' if r.returncode == 0 else r.stderr.strip()}")
    return 0


def cmd_extension(lepas, ya):
    if lepas:
        if DIR_EXT.is_symlink():
            DIR_EXT.unlink()
            print(f"Dilepas: {DIR_EXT}")
        return 0
    subprocess.run(["glib-compile-schemas", str(SUMBER_EXT / "schemas")], check=False)
    if DIR_EXT.is_symlink() and DIR_EXT.resolve() == SUMBER_EXT.resolve():
        print(f"{DIR_EXT} sudah menunjuk {SUMBER_EXT}")
    elif DIR_EXT.exists() or DIR_EXT.is_symlink():
        print(f"{DIR_EXT} sudah ada dan bukan symlink ke repo ini — pindahkan dulu.", file=sys.stderr)
        return 1
    else:
        DIR_EXT.parent.mkdir(parents=True, exist_ok=True)
        DIR_EXT.symlink_to(SUMBER_EXT)
        print(f"Tertaut: {DIR_EXT} -> {SUMBER_EXT}")
    subprocess.run(["gnome-extensions", "enable", EXT_UUID], check=False)
    print("Versi terbaru termuat setelah logout/login (Wayland tidak bisa memuat ulang extension).")
    return 0


def cmd_status():
    try:
        settings = json.loads(SETTINGS_CLAUDE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        settings = {}
    hooks = settings.get("hooks") or {}
    terpasang = [e for e in EVENT_CLAUDE if any(
        _milik_memo(h) for g in hooks.get(e, []) if isinstance(g, dict) for h in g.get("hooks", []))]
    print(f"Claude Code : {len(terpasang)}/{len(EVENT_CLAUDE)} event"
          + ("" if terpasang else "  (memo-pasang.py claude)"))
    print(f"OpenCode    : {'terpasang' if PLUGIN_OPENCODE.exists() else 'belum  (memo-pasang.py opencode)'}")
    tertaut = DIR_EXT.is_symlink() and DIR_EXT.resolve() == SUMBER_EXT.resolve()
    print(f"Extension   : {'tertaut ke ' + str(SUMBER_EXT) if tertaut else 'belum  (memo-pasang.py extension)'}")
    for nama in LAYANAN:
        aktif = _systemctl("is-active", nama).stdout.strip()
        print(f"{nama:<22}: {aktif}")
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("sasaran", choices=("claude", "opencode", "extension", "layanan", "status"))
    ap.add_argument("--lepas", action="store_true")
    ap.add_argument("--ya", action="store_true", help="tulis tanpa bertanya")
    ap.add_argument("--cetak", action="store_true", help="claude: cetak hook saja, tidak menulis apa pun")
    args = ap.parse_args(argv)
    if args.sasaran == "claude" and args.cetak:
        print(_json(pasang_hook({})), end="")
        return 0
    return {"claude": lambda: cmd_claude(args.lepas, args.ya),
            "opencode": lambda: cmd_opencode(args.lepas, args.ya),
            "extension": lambda: cmd_extension(args.lepas, args.ya),
            "layanan": lambda: cmd_layanan(args.lepas, args.ya),
            "status": cmd_status}[args.sasaran]()


if __name__ == "__main__":
    sys.exit(main())
