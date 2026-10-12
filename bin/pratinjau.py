"""Menulis bingkai pratinjau kamera untuk ditampilkan di popup Memo.

Bingkai ditulis sebagai piksel RGBA mentah, bukan PNG: tidak ada encode di
sisi Python dan tidak ada decode di sisi GNOME Shell, jadi bebannya nyaris nol
di kedua sisi.

Penulisan hanya terjadi saat popup memintanya. Popup menyentuh berkas permintaan
setiap detik selagi terbuka; begitu ditutup, permintaannya basi dan penulisan
berhenti sendiri. Tanpa itu, kamera akan menulis bingkai terus-menerus untuk
sesuatu yang tidak sedang dilihat siapa pun.

Berkas ditaruh di /dev/shm (RAM), jadi tidak ada tulisan ke disk sama sekali.
"""

import os
import time

import cv2
import numpy as np

LEBAR_PRATINJAU, TINGGI_PRATINJAU = 240, 180
BERKAS = "/dev/shm/memo-pratinjau.rgba"
BERKAS_MINTA = "/dev/shm/memo-pratinjau.minta"
UMUR_PERMINTAAN = 3.0        # permintaan dianggap basi setelah ini

# Rantai ruas jari untuk menggambar kerangka tangan.
RANTAI = [
    [0, 1, 2, 3, 4], [0, 5, 6, 7, 8], [0, 9, 10, 11, 12],
    [0, 13, 14, 15, 16], [0, 17, 18, 19, 20], [5, 9, 13, 17],
]

HIJAU = (120, 255, 170)
BIRU = (255, 210, 140)
MERAH = (120, 120, 255)


def diminta():
    """Apakah popup sedang meminta pratinjau.

    Memakai time.time(), bukan time.monotonic(): yang dibandingkan adalah
    mtime berkas, dan itu jam dinding. Mencampur keduanya menghasilkan
    perbandingan yang tidak berarti apa-apa.
    """
    try:
        return time.time() - os.path.getmtime(BERKAS_MINTA) < UMUR_PERMINTAAN
    except OSError:
        return False


def _gambar_tangan(gambar, titik):
    tinggi, lebar = gambar.shape[:2]
    piksel = [(int(x * lebar), int(y * tinggi)) for x, y in titik]

    for rantai in RANTAI:
        for a, b in zip(rantai, rantai[1:]):
            cv2.line(gambar, piksel[a], piksel[b], BIRU, 1, cv2.LINE_AA)

    for i, p in enumerate(piksel):
        # Ujung jari dibuat lebih besar supaya yang dinilai terlihat jelas.
        besar = i in (4, 8, 12, 16, 20)
        cv2.circle(gambar, p, 4 if besar else 2, HIJAU if besar else BIRU,
                   -1, cv2.LINE_AA)


def tulis(frame, titik, isyarat, aktif):
    """Menggambar kerangka tangan lalu menulis bingkai sebagai RGBA mentah."""
    gambar = cv2.resize(frame, (LEBAR_PRATINJAU, TINGGI_PRATINJAU))
    gambar = cv2.flip(gambar, 1)        # cermin, supaya gerakan terasa wajar

    if titik:
        dicerminkan = [(1.0 - x, y) for x, y in titik]
        _gambar_tangan(gambar, dicerminkan)

    label = isyarat or "-"
    cv2.putText(gambar, label, (6, TINGGI_PRATINJAU - 8),
                cv2.FONT_HERSHEY_SIMPLEX, 0.45, HIJAU if isyarat else MERAH,
                1, cv2.LINE_AA)
    if aktif:
        cv2.rectangle(gambar, (1, 1), (LEBAR_PRATINJAU - 2, TINGGI_PRATINJAU - 2),
                      HIJAU, 2)

    rgba = cv2.cvtColor(gambar, cv2.COLOR_BGR2RGBA)

    # Ditulis ke berkas sementara lalu diganti-nama: pembaca tidak akan pernah
    # menangkap bingkai yang tertulis separuh.
    sementara = f"{BERKAS}.tmp"
    try:
        with open(sementara, "wb") as f:
            f.write(np.ascontiguousarray(rgba).tobytes())
        os.chmod(sementara, 0o600)      # wajah pengguna, jangan dibuka ke user lain
        os.replace(sementara, BERKAS)
    except OSError:
        pass


def bersihkan():
    for berkas in (BERKAS, f"{BERKAS}.tmp"):
        try:
            os.unlink(berkas)
        except OSError:
            pass
