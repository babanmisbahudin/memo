"""Wardrobe Memo ala Coucou — murni, tanpa GNOME maupun I/O.

Coucou: klik kanan Mochi untuk wardrobe + kostum musiman otomatis. Di Memo
wajahnya parametrik (face.js: hue 0-360, glow 0-1), jadi satu outfit = satu
pasang (hue, glowBoost) yang ditumpuk di atas ekspresi aktif. Animasi tidak
berubah — hanya rona dan cahayanya.

Bulan -> outfit musiman mengikuti musim Indonesia + hari besar umum:
belum ada tanggal dinamis (Idul Fitri/Adha geser tiap tahun), jadi yang
dipakai bulan Masehi + Desember emas/merah untuk Natal-Tahun Baru.
"""

OUTFITS = {
    "klasik": {"nama": "Klasik", "hue": 120, "glow": 0.0},
    "laut": {"nama": "Laut", "hue": 205, "glow": 0.1},
    "senja": {"nama": "Senja", "hue": 30, "glow": 0.1},
    "anggur": {"nama": "Anggur", "hue": 280, "glow": 0.15},
    "sakura": {"nama": "Sakura", "hue": 330, "glow": 0.1},
    "emas": {"nama": "Emas", "hue": 45, "glow": 0.25},
    "natal": {"nama": "Natal", "hue": 0, "glow": 0.2},
}

MUSIMAN = {
    1: "emas", 2: "sakura", 3: "klasik", 4: "klasik",
    5: "klasik", 6: "laut", 7: "laut", 8: "laut",
    9: "senja", 10: "senja", 11: "senja", 12: "natal",
}

OTOMATIS = "musiman"


def daftar():
    return [{"id": k, **v} for k, v in OUTFITS.items()]


def cari(id_outfit):
    if id_outfit in OUTFITS:
        return {"id": id_outfit, **OUTFITS[id_outfit]}
    return None


def musiman(bulan):
    """Outfit otomatis untuk nomor bulan 1-12. Di luar itu: klasik."""
    try:
        bulan = int(bulan)
    except (TypeError, ValueError):
        return "klasik"
    return MUSIMAN.get(bulan, "klasik")


def selesaikan(pilihan, bulan):
    """Pilihan pengguna ('musiman' atau id outfit) -> id outfit final.

    Pilihan tak dikenal jatuh ke musiman, bukan menolak — satu salah ketik
    di berkas config tidak boleh membuat Memo tanpa warna.
    """
    if pilihan == OTOMATIS or pilihan is None:
        return musiman(bulan)
    if pilihan in OUTFITS:
        return pilihan
    return musiman(bulan)


def rapikan(mentah):
    """Bersihkan config mentah -> {'outfit': id|'musiman'}."""
    if not isinstance(mentah, dict):
        return {"outfit": OTOMATIS}
    pilihan = mentah.get("outfit", OTOMATIS)
    if pilihan != OTOMATIS and pilihan not in OUTFITS:
        return {"outfit": OTOMATIS}
    return {"outfit": pilihan}
