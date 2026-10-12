#!/usr/bin/env python3
"""Pendeteksi lambaian tangan untuk memicu Memo.

Lambaian dibedakan dari gerakan biasa lewat POLA, bukan lewat banyaknya
gerakan: titik berat gerakan harus bolak-balik arah horizontal beberapa kali
dalam waktu singkat. Orang lewat menghasilkan satu sapuan searah, tirai
bergoyang menghasilkan gerakan kecil di satu tempat — keduanya tidak lolos.

Kamera sengaja dibuka pada resolusi dan frame rate rendah; yang dibutuhkan
hanya arah gerakan, bukan gambar yang tajam.
"""

import argparse
import collections
import subprocess
import sys
import time

import cv2
import numpy as np

from lambaian_pola import JENDELA_DETIK, apakah_lambaian, hitung_balikan

LEBAR, TINGGI = 160, 120
FPS = 8
AMBANG_BEDA = 14          # selisih kecerahan piksel yang dianggap bergerak
MIN_PIKSEL_GERAK = 90     # gerakan lebih kecil dari ini diabaikan sebagai derau
MAKS_PIKSEL_GERAK = 9000  # hampir seluruh layar berubah = lampu nyala/kamera bergeser
JEDA_SETELAH_PICU = 8.0


def jalankan_aksi(perintah):
    try:
        subprocess.Popen(perintah)
    except Exception as e:                       # noqa: BLE001
        print(f"gagal menjalankan aksi: {e}", file=sys.stderr)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--kamera", type=int, default=0)
    parser.add_argument("--ucapan", default="Hai Baban, ada apa?")
    parser.add_argument("--memo", default=str(__file__).rsplit("/", 1)[0] + "/memo")
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()

    kamera = cv2.VideoCapture(args.kamera)
    if not kamera.isOpened():
        print(f"tidak bisa membuka kamera {args.kamera} — "
              "mungkin sedang dipakai aplikasi lain", file=sys.stderr)
        return 1

    kamera.set(cv2.CAP_PROP_FRAME_WIDTH, LEBAR)
    kamera.set(cv2.CAP_PROP_FRAME_HEIGHT, TINGGI)

    sebelumnya = None
    jejak = collections.deque()
    boleh_picu_pada = 0.0
    jeda_frame = 1.0 / FPS

    print("Memo mengawasi lambaian. Ctrl+C untuk berhenti.", flush=True)

    try:
        while True:
            awal = time.monotonic()
            berhasil, frame = kamera.read()
            if not berhasil:
                time.sleep(0.5)
                continue

            abu = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            abu = cv2.GaussianBlur(abu, (9, 9), 0)

            if sebelumnya is None:
                sebelumnya = abu
                continue

            beda = cv2.absdiff(sebelumnya, abu)
            sebelumnya = abu
            _, gerak = cv2.threshold(beda, AMBANG_BEDA, 255, cv2.THRESH_BINARY)

            jumlah = int(np.count_nonzero(gerak))
            sekarang = time.monotonic()

            if MIN_PIKSEL_GERAK < jumlah < MAKS_PIKSEL_GERAK:
                kolom = np.nonzero(gerak.any(axis=0))[0]
                if kolom.size:
                    jejak.append((sekarang, float(kolom.mean())))

            while jejak and sekarang - jejak[0][0] > JENDELA_DETIK:
                jejak.popleft()

            titik = list(jejak)
            if args.verbose and jumlah > MIN_PIKSEL_GERAK:
                print(f"gerak={jumlah:5d} titik={len(titik):2d} "
                      f"balikan={hitung_balikan(titik)}", flush=True)

            if apakah_lambaian(titik) and sekarang >= boleh_picu_pada:
                print("lambaian terdeteksi", flush=True)
                jalankan_aksi([args.memo, args.ucapan])
                jejak.clear()
                sebelumnya = None
                boleh_picu_pada = sekarang + JEDA_SETELAH_PICU

            tersisa = jeda_frame - (time.monotonic() - awal)
            if tersisa > 0:
                time.sleep(tersisa)
    except KeyboardInterrupt:
        pass
    finally:
        kamera.release()

    return 0


if __name__ == "__main__":
    sys.exit(main())
