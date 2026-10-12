"""Uji pengenalan arah geseran memakai jejak buatan — tanpa kamera."""

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "bin"))

from gerak_pola import arah_geseran


def jejak(titik, jeda=0.1):
    """titik: daftar (x, y). Waktunya dibuat berurutan otomatis."""
    return [(i * jeda, x, y) for i, (x, y) in enumerate(titik)]


KASUS = [
    ("geser kanan tegas",
     [(0.25, 0.5), (0.40, 0.5), (0.55, 0.5), (0.70, 0.5)], "kanan"),
    ("geser kiri tegas",
     [(0.75, 0.5), (0.60, 0.5), (0.45, 0.5), (0.30, 0.5)], "kiri"),
    ("geser atas",
     [(0.5, 0.75), (0.5, 0.60), (0.5, 0.45), (0.5, 0.30)], "atas"),
    ("geser bawah",
     [(0.5, 0.25), (0.5, 0.40), (0.5, 0.55), (0.5, 0.70)], "bawah"),

    # Yang TIDAK boleh terbaca sebagai geseran
    ("tangan diam",
     [(0.5, 0.5), (0.5, 0.5), (0.5, 0.5), (0.5, 0.5)], None),
    ("goyang di tempat",
     [(0.50, 0.5), (0.56, 0.5), (0.50, 0.5), (0.56, 0.5), (0.50, 0.5)], None),
    ("gerak terlalu pendek",
     [(0.50, 0.5), (0.54, 0.5), (0.58, 0.5)], None),
    ("miring 45 derajat, tak ada sumbu dominan",
     [(0.25, 0.25), (0.40, 0.40), (0.55, 0.55), (0.70, 0.70)], None),
    ("bolak-balik jauh lalu kembali",
     [(0.30, 0.5), (0.70, 0.5), (0.35, 0.5)], None),
    ("jejak terlalu pendek",
     [(0.2, 0.5), (0.8, 0.5)], None),
    ("jejak kosong", [], None),
]

gagal = 0
for nama, titik, harap in KASUS:
    hasil = arah_geseran(jejak(titik))
    ok = hasil == harap
    gagal += 0 if ok else 1
    print(f"{'OK   ' if ok else 'GAGAL'} | {nama:38s} -> {hasil} (harap {harap})")

# Geseran yang benar tapi terlalu lambat harus gugur karena lewat jendela waktu
lambat = [(i * 0.5, 0.25 + i * 0.15, 0.5) for i in range(4)]
hasil = arah_geseran(lambat)
ok = hasil is None
gagal += 0 if ok else 1
print(f"{'OK   ' if ok else 'GAGAL'} | {'geseran terlalu lambat':38s} -> {hasil} (harap None)")

total = len(KASUS) + 1
print(f"\n{total - gagal} lolos, {gagal} gagal")
sys.exit(1 if gagal else 0)
