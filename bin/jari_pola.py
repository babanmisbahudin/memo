"""Menghitung jari terangkat dari 21 landmark tangan MediaPipe.

Sengaja tidak mengimpor mediapipe, cv2, atau numpy: yang dikerjakan di sini
hanya aritmetika koordinat, jadi bisa diuji dengan python biasa memakai
landmark buatan — tanpa kamera, tanpa tangan sungguhan.

Penentuan "terangkat" memakai jarak ke pergelangan, bukan perbandingan sumbu Y.
Perbandingan Y hanya benar kalau tangan tegak; begitu tangan dimiringkan atau
menghadap ke samping, cara itu salah menghitung. Jarak ke pergelangan tidak
peduli orientasi.
"""

PERGELANGAN = 0
UJUNG_JARI = [4, 8, 12, 16, 20]      # jempol, telunjuk, tengah, manis, kelingking
SENDI_JARI = [2, 6, 10, 14, 18]

NAMA_JARI = ["jempol", "telunjuk", "tengah", "manis", "kelingking"]

# Kedua angka ini diukur dari rekaman tangan sungguhan, bukan dikarang.
#
# Jempol  : diangkat 1.77-1.82, santai 1.43-1.70. Ujung jempol SELALU lebih
#           jauh dari pergelangan daripada sendinya, bahkan saat menempel —
#           makanya ambang 1.02 yang semula saya pakai membuat jempol selalu
#           terbaca lurus, dan semua isyarat selain telapak terbuka gagal.
# Telunjuk: lurus 1.20-1.36, tertekuk 0.72-1.08. Celahnya lebar, 1.12 aman.
MARGIN_JEMPOL = 1.74
MARGIN_JARI = 1.12


def jarak(a, b):
    return ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2) ** 0.5


def jari_terangkat(landmark):
    """Mengembalikan 5 boolean, urut jempol sampai kelingking."""
    if landmark is None or len(landmark) < 21:
        return [False] * 5

    pergelangan = landmark[PERGELANGAN]
    hasil = []
    for i, (ujung, sendi) in enumerate(zip(UJUNG_JARI, SENDI_JARI)):
        margin = MARGIN_JEMPOL if i == 0 else MARGIN_JARI
        hasil.append(
            jarak(landmark[ujung], pergelangan)
            > jarak(landmark[sendi], pergelangan) * margin
        )
    return hasil


def hitung_jari(landmark):
    return sum(jari_terangkat(landmark))


def nama_isyarat(landmark):
    """Nama isyarat yang dikenali, atau None kalau tidak ada yang cocok.

    Penilaian sengaja bertumpu pada EMPAT jari, bukan lima. Celah antara
    jempol santai (1.70) dan jempol diangkat (1.77) cuma 4% — ambang setipis
    itu rapuh terhadap perbedaan sudut tangan dan jarak duduk. Jari telunjuk
    sampai kelingking punya celah yang jauh lebih lebar dan bisa dipercaya.

    Jadi jempol hanya dipakai untuk satu hal yang memang tidak bisa dibedakan
    tanpanya: memisahkan jempol-diangkat dari kepalan. Semua isyarat lain
    kebal terhadap posisi jempol.
    """
    terangkat = jari_terangkat(landmark)
    jempol = terangkat[0]
    empat = terangkat[1:]
    jumlah = sum(empat)

    if jumlah == 4:
        return "telapak_terbuka"
    if jumlah == 3 and empat[0] and empat[1] and empat[2]:
        return "tiga"
    if jumlah == 2 and empat[0] and empat[1]:
        return "damai"
    if jumlah == 1 and empat[0]:
        return "telunjuk"
    if jumlah == 0:
        return "jempol" if jempol else "kepalan"
    return None


def titik_tengah_telapak(landmark):
    """Titik acuan untuk melacak gerakan tangan, dipakai deteksi lambaian."""
    if landmark is None or len(landmark) < 21:
        return None
    acuan = [PERGELANGAN, 5, 9, 13, 17]
    return (
        sum(landmark[i][0] for i in acuan) / len(acuan),
        sum(landmark[i][1] for i in acuan) / len(acuan),
    )
