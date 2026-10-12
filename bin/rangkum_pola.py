"""Logika penyusunan ringkasan harian — murni teks, tanpa membaca apa pun.

Tidak mengimpor sqlite, tidak menyentuh berkas. Semua masukan diberikan
pemanggil, jadi bisa diuji tanpa riwayat sungguhan.

Dua hal yang dijaga di sini:

1. Baris berisiko dibuang SEBELUM apa pun ditulis. Riwayat terminal sering
   memuat token dan sandi; begitu tertulis ke vault, itu tersimpan permanen
   dan ikut ter-backup.
2. Penulisan bersifat idempoten lewat penanda. Menjalankan ringkasan dua kali
   sehari mengganti isi blok yang sama, bukan menumpuk salinan baru, dan tidak
   pernah menyentuh baris yang kamu tulis sendiri.
"""

import re
from collections import Counter
from urllib.parse import urlparse

PENANDA_MULAI = "<!-- memo:mulai -->"
PENANDA_SELESAI = "<!-- memo:selesai -->"

# Sengaja longgar: lebih baik membuang baris yang sebenarnya aman daripada
# meloloskan satu baris yang memuat rahasia.
#
# Pola kredensial di dalam URI ditambahkan karena bentuknya tidak memuat kata
# kunci apa pun: `mongodb+srv://pengguna:sandi@host` tidak ada kata
# "password" di dalamnya, tapi isinya persis credential. Ini yang paling mudah
# terlewat kalau hanya relies pada nama variabelnya.
POLA_RAHASIA = re.compile(
    r"pass(word|wd)?|secret|token|api[_-]?key|bearer|credential|"
    r"\bauth\b|private[_-]?key|\bexport\s+\w+=|--password|-p\s*\S{8,}|"
    r"[a-z][a-z0-9+.\-]*://[^\s/@:]+:[^\s/@]+@",
    re.IGNORECASE,
)

POLA_JUDUL = re.compile(r"^(#{1,6})\s+(.*?)\s*$")


def saring_rahasia(baris_baris):
    """Membuang baris yang berpotensi memuat rahasia.

    Mengembalikan (baris_aman, jumlah_dibuang) supaya pemanggil bisa
    memberi tahu berapa yang disaring, tanpa pernah menampilkan isinya.
    """
    aman = [b for b in baris_baris if not POLA_RAHASIA.search(b)]
    return aman, len(baris_baris) - len(aman)


def kelompokkan_perintah(baris_baris, batas=5):
    """Menghitung perintah dasar: 'git push origin' dihitung sebagai 'git'."""
    hitung = Counter()
    for b in baris_baris:
        bagian = b.strip().split()
        if not bagian:
            continue
        nama = bagian[0]
        # Lewati penetapan variabel dan jalur, ambil yang benar-benar perintah
        if "=" in nama or nama.startswith((".", "/", "#")):
            continue
        hitung[nama] += 1
    return hitung.most_common(batas)


def ringkas_domain(url_url, batas=5):
    hitung = Counter()
    for u in url_url:
        try:
            host = urlparse(u).hostname or ""
        except ValueError:
            continue
        if host.startswith("www."):
            host = host[4:]
        if host:
            hitung[host] += 1
    return hitung.most_common(batas)


def ada_bagian(teks, judul):
    """Apakah judul bagian itu ada. Dipakai untuk membedakan 'bagian tidak
    ketemu' dari 'isinya memang sudah sama' — dua hal yang sangat berbeda."""
    return _batas_bagian(teks.split("\n"), judul) is not None


def _batas_bagian(baris, judul):
    mulai = -1
    tingkat = 0
    for i, b in enumerate(baris):
        m = POLA_JUDUL.match(b)
        if m and m.group(2) == judul:
            mulai = i + 1
            tingkat = len(m.group(1))
            break
    if mulai == -1:
        return None

    for i in range(mulai, len(baris)):
        m = POLA_JUDUL.match(baris[i])
        if m and len(m.group(1)) <= tingkat:
            return mulai, i
    return mulai, len(baris)


def tulis_bagian(teks, judul, isi_baris):
    """Menaruh blok bertanda di bawah `judul`, mengganti blok lama kalau ada.

    Baris di luar penanda tidak pernah disentuh — itu tulisanmu sendiri.
    """
    batas = _batas_bagian(teks.split("\n"), judul)
    if batas is None:
        return teks

    baris = teks.split("\n")
    mulai, selesai = batas

    blok = [PENANDA_MULAI, *isi_baris, PENANDA_SELESAI]

    # Cari blok lama di dalam bagian ini
    lama_mulai = lama_selesai = None
    for i in range(mulai, selesai):
        if baris[i].strip() == PENANDA_MULAI:
            lama_mulai = i
        elif baris[i].strip() == PENANDA_SELESAI and lama_mulai is not None:
            lama_selesai = i
            break

    if lama_mulai is not None and lama_selesai is not None:
        return "\n".join(baris[:lama_mulai] + blok + baris[lama_selesai + 1:])

    # Belum ada: taruh setelah baris berisi terakhir di bagian itu
    sisip = mulai
    for i in range(mulai, selesai):
        if baris[i].strip():
            sisip = i + 1
    return "\n".join(baris[:sisip] + blok + baris[sisip:])


def susun(browser, vscode, terminal, disaring=0):
    """Merangkai baris ringkasan. Bagian yang kosong dilewati, bukan ditulis
    sebagai 'tidak ada' — catatan harian tidak perlu diisi baris hampa."""
    baris = []

    if browser:
        isi = ", ".join(f"{d} ({n})" for d, n in browser)
        baris.append(f"- Browser: {isi}")

    if vscode:
        baris.append(f"- VS Code: {', '.join(vscode)}")

    if terminal:
        isi = ", ".join(f"{n}× {c}" for c, n in terminal)
        baris.append(f"- Terminal: {isi}")
        if disaring:
            baris.append(f"  ({disaring} baris disaring karena berpotensi memuat rahasia)")

    return baris
