import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "bin"))

from lambaian_pola import hitung_balikan, apakah_lambaian


def jejak(xs):
    return [(i * 0.1, float(x)) for i, x in enumerate(xs)]


KASUS = [
    ("lambaian kiri-kanan-kiri-kanan", [80, 100, 80, 100, 80], True),
    ("lambaian lebar",                 [60, 110, 55, 115],     True),
    ("orang lewat satu arah",          [20, 45, 70, 95, 120],  False),
    ("tirai bergoyang kecil",          [80, 84, 80, 85, 81],   False),
    ("diam total",                     [80, 80, 80, 80],       False),
    ("satu ayunan saja",               [80, 110],              False),
    ("jejak kosong",                   [],                     False),
]

gagal = 0
for nama, xs, harus in KASUS:
    hasil = apakah_lambaian(jejak(xs))
    ok = hasil == harus
    gagal += 0 if ok else 1
    print(f"{'OK   ' if ok else 'GAGAL'} | {nama:32s} balikan={hitung_balikan(jejak(xs))} picu={hasil}")

print(f"\n{len(KASUS) - gagal} lolos, {gagal} gagal")
sys.exit(1 if gagal else 0)
