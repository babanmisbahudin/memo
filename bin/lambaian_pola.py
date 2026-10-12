"""Pola lambaian, murni tanpa kamera.

Sengaja tidak mengimpor cv2 atau numpy supaya bisa diuji dengan python biasa
tanpa perlu opencv terpasang — sama alasannya dengan face.js yang tidak
mengimpor St.
"""

MIN_AYUNAN = 10       # jarak horizontal minimal satu ayunan, dalam piksel
# Lambaian alami (kanan-kiri-kanan) hanya menghasilkan 2 balikan. Menuntut 3
# berarti pengguna harus melambai empat ayunan penuh sebelum Memo bereaksi.
# Angka 2 tetap aman: orang lewat, tirai bergoyang, dan gerakan diam semuanya
# menghasilkan 0 balikan, jadi jaraknya masih lebar.
MIN_BALIKAN = 2
JENDELA_DETIK = 2.0


def hitung_balikan(jejak, min_ayunan=MIN_AYUNAN):
    """Berapa kali arah horizontal berbalik, mengabaikan getaran kecil.

    `jejak` adalah urutan (waktu, posisi_x). Getaran di bawah `min_ayunan`
    diabaikan supaya tirai bergoyang atau derau sensor tidak terhitung.
    """
    if len(jejak) < 3:
        return 0

    balikan = 0
    arah_terakhir = 0
    titik_acuan = jejak[0][1]

    for _, x in jejak[1:]:
        selisih = x - titik_acuan
        if abs(selisih) < min_ayunan:
            continue
        arah = 1 if selisih > 0 else -1
        if arah_terakhir != 0 and arah != arah_terakhir:
            balikan += 1
        arah_terakhir = arah
        titik_acuan = x

    return balikan


def apakah_lambaian(jejak, min_balikan=MIN_BALIKAN):
    return hitung_balikan(jejak) >= min_balikan
