"""Uji katalog pill + rekap mingguan — murni."""
import pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "bin"))
from pill_katalog import aktif_bawaan, cari, daftar, warna
from rekap_mingguan import rekap, sebagai_teks

gagal = lolos = 0
def cek(label, syarat):
    global gagal, lolos
    if syarat: lolos += 1
    else:
        gagal += 1
        print(f"GAGAL | {label}")

cek("katalog tidak kosong", len(daftar()) >= 10)
cek("cari github ketemu", (cari("github") or {}).get("nama") == "GitHub")
cek("cari asing None", cari("tak-ada") is None)
cek("warna dikenal", warna("claude") != "#888888")
cek("warna asing bawaan", warna("tak-ada") == "#888888")
cek("bawaan memuat memo", "memo" in aktif_bawaan())

log = "\n".join([
    "[2026-10-02 09:00:00] asisten  sesi claude demo",
    "[2026-10-02 10:00:00] terminal  git status",
    "[2026-10-02 11:00:00] terminal  git push",
    "[2026-10-03 12:00:00] berkas   demo/app.js",
    "[2026-09-01 00:00:00] terminal  perintah lama, harus diabaikan",
    "baris sampah",
])
from datetime import datetime
r = rekap(log, sekarang=datetime(2026, 10, 8, 12, 0, 0))
cek("sesi dihitung", r["sesi"] == 1)
cek("berkas dihitung", r["berkas"] == 1)
cek("log lama diabaikan", r["total_baris"] == 4)
cek("teks memuat rentang", "Rekap mingguan" in sebagai_teks(r))

print(f"\n{lolos} lolos, {gagal} gagal")
sys.exit(1 if gagal else 0)
