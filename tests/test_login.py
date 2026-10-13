"""Uji aset layar login/kunci: gambar Memo sinkron dengan pembuatnya, CSS
hanya menunjuk berkas yang ada, extension memo-kunci aman untuk layar kunci."""
import json
import pathlib
import re
import subprocess
import sys
import tempfile

LOGIN = pathlib.Path(__file__).resolve().parent.parent / "login"

gagal = lolos = 0


def cek(label, syarat):
    global gagal, lolos
    if syarat:
        lolos += 1
    else:
        gagal += 1
        print(f"GAGAL | {label}")


# Gambar yang di-commit = keluaran gambar-memo.js (ekspresi, potongan).
GAMBAR = {"memo-avatar.png": ["senang", "28", "18"], "memo-tidur.png": ["tidur"]}
with tempfile.TemporaryDirectory() as d:
    for nama, arg in GAMBAR.items():
        baru = pathlib.Path(d) / nama
        r = subprocess.run(["gjs", "-m", str(LOGIN / "gambar-memo.js"), arg[0], str(baru), *arg[1:]],
                           capture_output=True, text=True)
        cek(f"{nama} bisa dibuat ulang ({r.stderr.strip()[:80]})", r.returncode == 0)
        cek(f"{nama} sama dengan keluaran gambar-memo.js", r.returncode == 0
            and baru.read_bytes() == (LOGIN / nama).read_bytes())

css = (LOGIN / "stylesheet.css").read_text()
dirujuk = set(re.findall(r'url\("([^"]+)"\)', css))
cek("stylesheet merujuk gambar", dirujuk == set(GAMBAR))
cek("semua url() menunjuk berkas di login/", all((LOGIN / f).is_file() for f in dirujuk))
cek("tanpa aksen oranye Yaru", "-st-accent-color" not in css and "#e95420" not in css.lower())

meta = json.loads((LOGIN / "metadata.json").read_text())
cek("uuid memo-kunci@local", meta["uuid"] == "memo-kunci@local")
cek("aktif di user + unlock-dialog", set(meta["session-modes"]) == {"user", "unlock-dialog"})
ext = (LOGIN / "extension.js").read_text()
cek("hiasan layar kunci tidak reaktif", ext.count("reactive: false") == 2 and "reactive: true" not in ext)
cek("tanpa tombol/aksi di layar kunci", not re.search(r"St\.Button|connect\('clicked'|spawn|Subprocess", ext))

bangun = (LOGIN / "bangun-gdm.sh").read_text()
cek("tema GDM dibangun dari Yaru asli, bukan alternatif aktif",
    "/usr/share/gnome-shell/theme/Yaru/gnome-shell-theme.gresource" in bangun)
pasang = (LOGIN / "pasang-gdm.sh").read_text()
cek("pasang-gdm: lewat update-alternatives, bisa --lepas",
    "update-alternatives --set" in pasang and "--auto" in pasang and "--lepas" in pasang)

print(f"\n{lolos} lolos, {gagal} gagal")
sys.exit(1 if gagal else 0)
