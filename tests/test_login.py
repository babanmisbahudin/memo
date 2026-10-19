"""Uji aset layar login/kunci: gambar Memo & latar sinkron dengan pembuatnya,
CSS hanya menunjuk berkas yang ada, timer latar GDM memakai batas jam yang
sama dengan Memo, extension memo-kunci aman untuk layar kunci."""
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
GAMBAR = {"memo-avatar.png": ["senang", "28", "18"]}
with tempfile.TemporaryDirectory() as d:
    for nama, arg in GAMBAR.items():
        baru = pathlib.Path(d) / nama
        r = subprocess.run(["gjs", "-m", str(LOGIN / "gambar-memo.js"), arg[0], str(baru), *arg[1:]],
                           capture_output=True, text=True)
        cek(f"{nama} bisa dibuat ulang ({r.stderr.strip()[:80]})", r.returncode == 0)
        cek(f"{nama} sama dengan keluaran gambar-memo.js", r.returncode == 0
            and baru.read_bytes() == (LOGIN / nama).read_bytes())

# Latar per bagian hari = keluaran gambar-latar.js (1920x1080, layar fisik).
BAGIAN = ["pagi", "siang", "sore", "malam"]
with tempfile.TemporaryDirectory() as d:
    for b in BAGIAN:
        baru = pathlib.Path(d) / f"latar-{b}.png"
        r = subprocess.run(["gjs", "-m", str(LOGIN / "gambar-latar.js"), b, str(baru)], capture_output=True, text=True)
        cek(f"latar-{b}.png sama dengan keluaran gambar-latar.js ({r.stderr.strip()[:80]})", r.returncode == 0
            and baru.read_bytes() == (LOGIN / f"latar-{b}.png").read_bytes())
        cek(f"latar-{b}.png 1920x1080", (LOGIN / f"latar-{b}.png").read_bytes()[16:24] == (1920).to_bytes(4, "big") + (1080).to_bytes(4, "big"))

# latar-login.sh (timer GDM) memilih bagian yang sama dengan waktuPola.js
# untuk tiap jam, dan menautkan tujuannya ke gambar bagian itu.
with tempfile.TemporaryDirectory() as d:
    skrip = pathlib.Path(d) / "jam.js"
    skrip.write_text(f"import {{ bagianHari }} from '{(LOGIN.parent / 'extension' / 'waktuPola.js').as_uri()}';\n"
                     "print(JSON.stringify([...Array(24).keys()].map(bagianHari)));\n")
    harap = json.loads(subprocess.run(["gjs", "-m", str(skrip)], capture_output=True, text=True).stdout)
    for b in BAGIAN:
        (pathlib.Path(d) / f"latar-{b}.png").write_bytes(b"png " + b.encode())
    tujuan = pathlib.Path(d) / "latar-login.png"
    dapat, tautan = [], []
    for j in range(24):
        r = subprocess.run(["sh", str(LOGIN / "latar-login.sh")], capture_output=True, text=True,
                           env={"PATH": "/usr/bin:/bin", "MEMO_JAM": f"{j:02d}", "MEMO_LATAR_SUMBER": d, "MEMO_LATAR_TUJUAN": str(tujuan)})
        dapat.append(r.stdout.strip())
        tautan.append(tujuan.is_symlink() and tujuan.read_bytes() == b"png " + r.stdout.strip().encode())
    cek("latar-login.sh: bagian tiap jam = waktuPola.js", len(harap) == 24 and dapat == harap)
    cek("latar-login.sh: tujuan menjadi tautan ke gambar bagian itu", all(tautan))
    r = subprocess.run(["sh", str(LOGIN / "latar-login.sh")], capture_output=True, text=True,
                       env={"PATH": "/usr/bin:/bin", "MEMO_JAM": "12", "MEMO_LATAR_SUMBER": d + "/tidak-ada", "MEMO_LATAR_TUJUAN": str(tujuan)})
    cek("latar-login.sh: gambar tidak ada -> gagal, tautan lama tetap", r.returncode != 0 and tujuan.read_bytes() == b"png malam")

timer = (LOGIN / "memo-latar-login.timer").read_text()
cek("timer berganti pada batas bagian hari (04, 11, 15, 18) dan saat boot",
    "OnCalendar=*-*-* 04,11,15,18:00:00" in timer and "OnBootSec=" in timer and "Persistent=true" in timer)
layanan = (LOGIN / "memo-latar-login.service").read_text()
cek("layanan latar: hanya boleh menulis /var/lib/memo",
    "ProtectSystem=strict" in layanan and "ReadWritePaths=/var/lib/memo" in layanan and "/usr/local/lib/memo/latar-login.sh" in layanan)

css = (LOGIN / "stylesheet.css").read_text()
dirujuk = set(re.findall(r'url\("([^"]+)"\)', css))
cek("stylesheet merujuk gambar", dirujuk == set(GAMBAR))
cek("semua url() menunjuk berkas di login/", all((LOGIN / f).is_file() for f in dirujuk))
cek("tanpa aksen oranye Yaru", "-st-accent-color" not in css and "#e95420" not in css.lower())
cek("warna kartu layar kunci untuk tiap bagian hari", all(f".unlock-dialog.memo-{b} " in css for b in BAGIAN))
gdm_latar = (LOGIN / "gdm-latar.css").read_text()
cek("gdm-latar.css: latar layar login dari tautan yang diurus timer",
    'url("file://@LATAR@")' in gdm_latar and ".login-dialog {" in gdm_latar)

meta = json.loads((LOGIN / "metadata.json").read_text())
cek("uuid memo-kunci@local", meta["uuid"] == "memo-kunci@local")
cek("aktif di user + unlock-dialog", set(meta["session-modes"]) == {"user", "unlock-dialog"})
ext = (LOGIN / "extension.js").read_text()
aktor = re.findall(r"new St\.\w+\(\{([^}]*)\}", ext)
cek("hiasan layar kunci tidak reaktif", len(aktor) >= 3 and all("reactive: false" in a for a in aktor)
    and "reactive: true" not in ext and ext.count("reactive: false") >= 4)
cek("tanpa tombol/aksi di layar kunci", not re.search(r"St\.Button|connect\('clicked'|spawn|Subprocess", ext))

bangun = (LOGIN / "bangun-gdm.sh").read_text()
cek("tema GDM dibangun dari Yaru asli, bukan alternatif aktif",
    "/usr/share/gnome-shell/theme/Yaru/gnome-shell-theme.gresource" in bangun)
cek("tema GDM: latar bawaan /var/lib/memo/latar-login.png, gdm-latar.css ikut",
    "/var/lib/memo/latar-login.png" in bangun and "gdm-latar.css" in bangun)
pasang = (LOGIN / "pasang-gdm.sh").read_text()
cek("pasang-gdm: lewat update-alternatives, bisa --lepas",
    "update-alternatives --set" in pasang and "--auto" in pasang and "--lepas" in pasang)
cek("pasang-gdm: pasang & lepas timer latar, tolak tema uji",
    "systemctl enable --now memo-latar-login.timer" in pasang and "systemctl disable --now memo-latar-login.timer" in pasang
    and "bangun ulang tanpa MEMO_LATAR" in pasang)

print(f"\n{lolos} lolos, {gagal} gagal")
sys.exit(1 if gagal else 0)
