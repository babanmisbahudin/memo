"""Uji katalog pill — murni."""
import pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "bin"))
from pill_katalog import aktif_bawaan, cari, daftar, warna

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

print(f"\n{lolos} lolos, {gagal} gagal")
sys.exit(1 if gagal else 0)
