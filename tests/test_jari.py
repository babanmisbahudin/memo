"""Uji hitung jari memakai landmark buatan — tanpa kamera, tanpa mediapipe."""

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "bin"))

from jari_pola import hitung_jari, jari_terangkat, nama_isyarat, titik_tengah_telapak

PERGELANGAN = (0.5, 0.95)

# Pangkal tiap jari (indeks 1,5,9,13,17) tersebar mendatar di atas pergelangan.
PANGKAL = {1: (0.40, 0.88), 5: (0.44, 0.80), 9: (0.50, 0.78), 13: (0.56, 0.80), 17: (0.61, 0.83)}
RANTAI = {0: [1, 2, 3, 4], 1: [5, 6, 7, 8], 2: [9, 10, 11, 12], 3: [13, 14, 15, 16], 4: [17, 18, 19, 20]}


def bangun_tangan(terangkat):
    """Bangun 21 landmark sepanjang arah pergelangan->pangkal jari.

    Jari terangkat: ruasnya menjulur makin jauh dari pergelangan.
    Jari tertekuk: ruasnya melipat balik ke arah telapak, sehingga ujung jari
    justru lebih DEKAT ke pergelangan daripada sendi tengahnya — inilah bentuk
    kepalan yang sebenarnya, dan inilah yang dibaca algoritmanya.
    """
    titik = [None] * 21
    titik[0] = PERGELANGAN

    for jari, rantai in RANTAI.items():
        pangkal = PANGKAL[rantai[0]]
        titik[rantai[0]] = pangkal

        dx = pangkal[0] - PERGELANGAN[0]
        dy = pangkal[1] - PERGELANGAN[1]
        panjang = (dx * dx + dy * dy) ** 0.5 or 1.0
        ax, ay = dx / panjang, dy / panjang

        # Jempol dimodelkan terpisah: pada tangan sungguhan rasio ujung/sendi
        # jempol jauh lebih besar daripada jari lain (1.8 saat diangkat, 1.5
        # saat santai), karena sendi acuannya dekat sekali ke pergelangan.
        # Fixture yang memakai geometri jari biasa untuk jempol menghasilkan
        # rasio 1.39 dan tidak pernah mewakili tangan asli.
        if jari == 0:
            offset = [0.02, 0.08, 0.15] if terangkat[jari] else [0.02, 0.03, 0.04]
        else:
            offset = [0.03, 0.06, 0.09] if terangkat[jari] else [0.015, 0.005, -0.02]
        for idx, jarak_ruas in zip(rantai[1:], offset):
            titik[idx] = (pangkal[0] + ax * jarak_ruas, pangkal[1] + ay * jarak_ruas)

    return titik


KASUS = [
    ("telapak terbuka", [True] * 5,                      5, "telapak_terbuka"),
    ("kepalan",         [False] * 5,                     0, "kepalan"),
    ("damai",           [False, True, True, False, False], 2, "damai"),
    ("jempol saja",     [True, False, False, False, False], 1, "jempol"),
    ("telunjuk saja",   [False, True, False, False, False], 1, "telunjuk"),
    ("tiga jari",       [False, True, True, True, False],   3, "tiga"),
    # Jempol sengaja diabaikan dalam penilaian: rasionya pada tangan sungguhan
    # bergoyang melewati ambang, jadi telapak terbuka harus tetap dikenali
    # baik jempolnya terbaca lurus maupun tidak.
    ("telapak tanpa jempol", [False, True, True, True, True], 4, "telapak_terbuka"),
    ("damai walau jempol ikut terbaca", [True, True, True, False, False], 3, "damai"),
    ("telunjuk walau jempol ikut terbaca", [True, True, False, False, False], 2, "telunjuk"),
]

gagal = 0
for nama, pola, jumlah_harap, isyarat_harap in KASUS:
    tangan = bangun_tangan(pola)
    jumlah = hitung_jari(tangan)
    isyarat = nama_isyarat(tangan)
    ok = jumlah == jumlah_harap and isyarat == isyarat_harap
    gagal += 0 if ok else 1
    print(f"{'OK   ' if ok else 'GAGAL'} | {nama:16s} jari={jumlah} (harap {jumlah_harap}) "
          f"isyarat={isyarat} (harap {isyarat_harap})")

# Landmark cacat tidak boleh membuat program mati
for nama, rusak in [("None", None), ("kosong", []), ("kurang dari 21", [(0, 0)] * 10)]:
    try:
        ok = hitung_jari(rusak) == 0 and titik_tengah_telapak(rusak) is None
    except Exception as e:                                    # noqa: BLE001
        ok = False
        print(f"GAGAL | landmark {nama} melempar {type(e).__name__}")
    gagal += 0 if ok else 1
    if ok:
        print(f"OK    | landmark {nama:14s} ditangani tanpa error")

print(f"\n{len(KASUS) + 3 - gagal} lolos, {gagal} gagal")
sys.exit(1 if gagal else 0)
