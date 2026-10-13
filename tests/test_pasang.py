"""Uji pemasang hook: gabung tanpa merusak hook lain, idempoten, bisa dilepas."""
import importlib.util
import json
import pathlib
import sys
import tempfile

BIN = pathlib.Path(__file__).resolve().parent.parent / "bin"
sys.path.insert(0, str(BIN))
spec = importlib.util.spec_from_file_location("memo_pasang", BIN / "memo-pasang.py")
pasang = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pasang)
import hook_pola  # noqa: E402

gagal = lolos = 0


def cek(label, syarat):
    global gagal, lolos
    if syarat:
        lolos += 1
    else:
        gagal += 1
        print(f"GAGAL | {label}")


milik_pengguna = {"type": "command", "command": "/usr/local/bin/cek-keamanan.sh"}
awal = {
    "model": "opus",
    "hooks": {
        "PreToolUse": [{"matcher": "Bash", "hooks": [milik_pengguna]},
                       {"matcher": ".*", "hooks": [{"type": "command", "command": "/lama/bin/memo-hook.py"}]}],
        "Stop": [{"hooks": [{"type": "command", "command": "notify-send selesai"}]}],
    },
}
hasil = pasang.pasang_hook(awal, "/repo/bin/memo-hook.py")
cek("setelan lain tetap", hasil["model"] == "opus")
cek("hook pengguna tetap", hasil["hooks"]["PreToolUse"][0] == {"matcher": "Bash", "hooks": [milik_pengguna]})
cek("hook memo lama dibuang", not any("/lama/" in h["command"] for g in hasil["hooks"]["PreToolUse"] for h in g["hooks"]))
cek("Stop pengguna tetap + memo ditambah", len(hasil["hooks"]["Stop"]) == 2)
cek("semua event terpasang", all(
    any(pasang._milik_memo(h) for g in hasil["hooks"][e] for h in g["hooks"]) for e in pasang.EVENT_CLAUDE))
izin = [g for g in hasil["hooks"]["PermissionRequest"] if any(pasang._milik_memo(h) for h in g["hooks"])][0]
cek("PermissionRequest diberi waktu > 110 dtk", izin["hooks"][0]["timeout"] > hook_pola.BATAS_TUNGGU_DETIK)
cek("matcher hanya untuk event alat", "matcher" not in hasil["hooks"]["UserPromptSubmit"][0])
cek("idempoten", pasang.pasang_hook(hasil, "/repo/bin/memo-hook.py") == hasil)
cek("awal tidak dimutasi", awal["hooks"]["PreToolUse"][1]["hooks"][0]["command"] == "/lama/bin/memo-hook.py")
lepas = pasang.lepas_hook(hasil)
cek("lepas: hanya hook pengguna tersisa", lepas == {"model": "opus", "hooks": {
    "PreToolUse": [{"matcher": "Bash", "hooks": [milik_pengguna]}],
    "Stop": [{"hooks": [{"type": "command", "command": "notify-send selesai"}]}]}})
cek("lepas dari kosong", pasang.lepas_hook({"a": 1}) == {"a": 1})

with tempfile.TemporaryDirectory() as d:
    p = pathlib.Path(d) / "settings.json"
    p.write_text(json.dumps({"theme": "dark"}, indent=2) + "\n")
    cek("tanpa --ya & tanpa tty: tidak menulis", pasang.cmd_claude(False, False, p) == 1
        and json.loads(p.read_text()) == {"theme": "dark"})
    cek("dengan --ya: tertulis", pasang.cmd_claude(False, True, p) == 0 and "hooks" in json.loads(p.read_text()))
    cek("cadangan dibuat", len(list(pathlib.Path(d).glob("settings.json.memo-*.bak"))) == 1)
    pasang.cmd_claude(True, True, p)
    cek("lepas kembali ke semula", json.loads(p.read_text()) == {"theme": "dark"})
    rusak = pathlib.Path(d) / "rusak.json"
    rusak.write_text("{ bukan json")
    cek("JSON rusak tidak disentuh", pasang.cmd_claude(False, True, rusak) == 1 and rusak.read_text() == "{ bukan json")

# OpenCode: nama alat huruf kecil + field camelCase.
cek("opencode edit dihitung", hook_pola.hitung_diff("edit", {"filePath": "/a/x.ts", "oldString": "a", "newString": "b\nc"})
    == {"berkas": "/a/x.ts", "tambah": 2, "kurang": 1})
cek("opencode label bash", hook_pola.label_alat("bash", {"command": "bun test"}) == "Bash: bun test")
cek("opencode label read", hook_pola.label_alat("read", {"filePath": "/a/b/c.md"}) == "Read c.md")
cek("plugin memuat jalur hook", str(BIN / "memo-hook.py") in pasang.PLUGIN_JS % json.dumps(pasang.HOOK))

# Sambutan: autostart Memo, hallo-baban disembunyikan (bukan dihapus), extension
# lama dinonaktifkan; --lepas mengembalikan semuanya. gnome-extensions dipalsukan.
panggilan = []


class _Hasil:
    def __init__(self, stdout="", returncode=0):
        self.stdout, self.returncode, self.stderr = stdout, returncode, ""


def _palsu(*arg):
    panggilan.append(arg)
    return _Hasil("baban-power-greeting@local\ndynamic-island@local\n" if arg[0] == "list" else "")


pasang._gnome_extensions = _palsu
LAMA = "[Desktop Entry]\nType=Application\nExec=gjs /x/greeting.js\n\n[Desktop Action a]\nExec=y\n"
with tempfile.TemporaryDirectory() as d:
    auto, tanda = pathlib.Path(d) / "autostart", pathlib.Path(d) / "memo" / "tanpa-sambutan"
    auto.mkdir()
    (auto / "hallo-baban.desktop").write_text(LAMA)
    tanda.parent.mkdir()
    tanda.touch()
    cek("sambutan: terpasang", pasang.cmd_sambutan(False, True, auto, tanda) == 0)
    isi = (auto / "memo-sambutan.desktop").read_text()
    cek("sambutan: Exec menunjuk sambutan.js masuk", f'Exec=gjs -m "{pasang.SAMBUTAN}" masuk' in isi)
    lama = (auto / "hallo-baban.desktop").read_text()
    cek("sambutan: hallo-baban disembunyikan di grup [Desktop Entry]",
        lama.startswith("[Desktop Entry]\n# Disembunyikan") and lama.index("Hidden=true") < lama.index("[Desktop Action"))
    cek("sambutan: cadangan hallo-baban dibuat", len(list(auto.glob("hallo-baban.desktop.memo-*.bak"))) == 1)
    cek("sambutan: penanda tanpa-sambutan dihapus", not tanda.exists())
    cek("sambutan: extension lama dinonaktifkan", ("disable", "baban-power-greeting@local") in panggilan)
    cek("sambutan: idempoten", pasang.cmd_sambutan(False, True, auto, tanda) == 0
        and (auto / "hallo-baban.desktop").read_text() == lama)
    cek("sambutan --lepas", pasang.cmd_sambutan(True, True, auto, tanda) == 0)
    cek("lepas: autostart Memo hilang", not (auto / "memo-sambutan.desktop").exists())
    cek("lepas: hallo-baban kembali persis", (auto / "hallo-baban.desktop").read_text() == LAMA)
    cek("lepas: penanda menu daya bawaan", tanda.exists())

# Layar kunci: symlink login/ -> extensions/memo-kunci@local, idempoten, bisa dilepas.
with tempfile.TemporaryDirectory() as d:
    panggilan.clear()
    tujuan = pathlib.Path(d) / "extensions" / "memo-kunci@local"
    cek("kunci: tertaut", pasang._taut_extension(False, "memo-kunci@local", pasang.SUMBER_KUNCI, tujuan) == 0
        and tujuan.resolve() == pasang.SUMBER_KUNCI.resolve())
    cek("kunci: diaktifkan", ("enable", "memo-kunci@local") in panggilan)
    cek("kunci: idempoten", pasang._taut_extension(False, "memo-kunci@local", pasang.SUMBER_KUNCI, tujuan) == 0)
    lain = pathlib.Path(d) / "extensions" / "bukan-symlink@local"
    lain.mkdir()
    cek("kunci: folder asli tidak ditimpa", pasang._taut_extension(False, "x@local", pasang.SUMBER_KUNCI, lain) == 1
        and lain.is_dir() and not lain.is_symlink())
    cek("kunci --lepas", pasang._taut_extension(True, "memo-kunci@local", pasang.SUMBER_KUNCI, tujuan) == 0
        and not tujuan.exists() and ("disable", "memo-kunci@local") in panggilan)
    cek("sumber kunci punya metadata unlock-dialog",
        "unlock-dialog" in json.loads((pasang.SUMBER_KUNCI / "metadata.json").read_text())["session-modes"])

print(f"\n{lolos} lolos, {gagal} gagal")
sys.exit(1 if gagal else 0)
