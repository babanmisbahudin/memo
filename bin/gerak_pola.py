"""Mengenali arah geseran telapak dari jejak posisinya.

Murni aritmetika: tidak mengimpor cv2, numpy, maupun mediapipe, jadi bisa
diuji dengan python biasa memakai jejak buatan.

Koordinat yang masuk adalah hasil normalisasi MediaPipe (0..1 terhadap lebar
dan tinggi bingkai), bukan piksel — jadi ambangnya tidak berubah walau
resolusi kameranya diganti.
"""

JENDELA_DETIK = 1.0        # geseran harus selesai dalam waktu ini
# Angka-angka di bawah ini disetel dari rekaman kamera sungguhan, bukan
# ditebak. Geseran tangan nyata menghasilkan ~0.11 perpindahan pada ~0.63/detik,
# sedangkan tangan diam hanya ~0.05 pada ~0.19/detik — ambangnya diletakkan di
# antara keduanya.
MIN_JARAK = 0.09           # perpindahan bersih minimal
RASIO_SUMBU = 1.6          # sumbu dominan harus sekian kali sumbu satunya
MAKS_BALIK = 0.4           # toleransi gerakan balik, relatif terhadap jarak
# Syarat jarak saja tidak cukup: tangan yang melayang pelan lama-lama juga
# mengumpulkan jarak yang cukup di dalam jendela. Geseran harus berupa
# sentakan, jadi kecepatannya ikut disyaratkan.
MIN_KECEPATAN = 0.35       # satuan normalisasi per detik


def _bersihkan(jejak, sekarang, jendela=JENDELA_DETIK):
    return [t for t in jejak if sekarang - t[0] <= jendela]


def arah_geseran(jejak, sekarang=None, min_jarak=MIN_JARAK):
    """Mengembalikan 'kiri', 'kanan', 'atas', 'bawah', atau None.

    Jejak adalah urutan (waktu, x, y). Perlu perpindahan bersih yang cukup
    jauh, pada satu sumbu yang jelas dominan, dan tanpa banyak gerakan balik —
    supaya tangan yang bergoyang di tempat tidak terbaca sebagai geseran.
    """
    if not jejak:
        return None

    sekarang = jejak[-1][0] if sekarang is None else sekarang
    titik = _bersihkan(jejak, sekarang)
    if len(titik) < 3:
        return None

    x_awal, y_awal = titik[0][1], titik[0][2]
    x_akhir, y_akhir = titik[-1][1], titik[-1][2]
    dx = x_akhir - x_awal
    dy = y_akhir - y_awal

    lama = titik[-1][0] - titik[0][0]
    if lama <= 0:
        return None
    if max(abs(dx), abs(dy)) / lama < MIN_KECEPATAN:
        return None

    if abs(dx) >= abs(dy) * RASIO_SUMBU and abs(dx) >= min_jarak:
        # Gerakan balik yang besar berarti tangan bolak-balik, bukan menggeser.
        jauh = max(abs(p[1] - x_awal) for p in titik)
        if jauh - abs(dx) > abs(dx) * MAKS_BALIK:
            return None
        return "kanan" if dx > 0 else "kiri"

    if abs(dy) >= abs(dx) * RASIO_SUMBU and abs(dy) >= min_jarak:
        jauh = max(abs(p[2] - y_awal) for p in titik)
        if jauh - abs(dy) > abs(dy) * MAKS_BALIK:
            return None
        # y MediaPipe membesar ke bawah, jadi dy negatif berarti tangan naik.
        return "bawah" if dy > 0 else "atas"

    return None
