"""Kabar LebihTeratur untuk Memo — murni, tanpa jaringan.

Sumbernya GET /api/kabar-admin di API LebihTeratur: salinan dari apa pun
yang muncul di dashboard admin (vendor daftar, chat vendor, pembayaran
Midtrans/manual, alert penting). memo-integrasi.py yang menariknya; modul
ini hanya memilah, memilih bunyi, dan membentuk pill.
"""

URL_BAWAAN = "https://lebihteratur-api.onrender.com"
BATAS_RIWAYAT = 8


def parse_feed(data):
    """Daftar kabar yang sah dari respons feed; apa pun yang rusak dibuang."""
    hasil = []
    try:
        for k in (data or {}).get("data") or []:
            if not isinstance(k, dict) or not k.get("id") or not k.get("judul"):
                continue
            hasil.append({
                "id": str(k["id"]),
                "jenis": str(k.get("jenis") or "sistem"),
                "judul": str(k["judul"])[:200],
                "pesan": str(k.get("pesan") or "")[:600],
                "url": str(k.get("url") or ""),
                "waktu": str(k.get("waktu") or ""),
            })
    except (AttributeError, TypeError):
        return []
    return hasil


def lebih_baru(daftar, id_terakhir):
    """ObjectId 24-hex naik seiring waktu, jadi cukup dibandingkan sebagai teks."""
    if not id_terakhir:
        return list(daftar)
    return [k for k in daftar if len(k["id"]) == len(id_terakhir) and k["id"] > id_terakhir]


def apakah_bayar(kabar):
    teks = f"{kabar.get('judul', '')} {kabar.get('jenis', '')}".lower()
    return kabar.get("jenis") == "payment" or any(
        kata in teks for kata in ("pembayaran", "bayar", "payment", "lunas"))


def bunyi_untuk(kabar):
    if apakah_bayar(kabar):
        return "bayar"
    if kabar.get("jenis") == "chat":
        return "pesan"
    return "sapa"


def ikon_untuk(kabar):
    if apakah_bayar(kabar):
        return "emblem-ok-symbolic"
    if kabar.get("jenis") == "chat":
        return "mail-unread-symbolic"
    return "preferences-system-notifications-symbolic"


def url_aman(url):
    """Hanya https/http yang boleh dibuka dari notifikasi."""
    return url if url.startswith(("https://", "http://")) else ""


def catat(keadaan, kabar_baru, tanggal):
    """Perbarui keadaan tersimpan: id terakhir, hitungan hari ini, riwayat."""
    keadaan = dict(keadaan or {})
    if keadaan.get("tanggal") != tanggal:
        keadaan["tanggal"] = tanggal
        keadaan["hari_ini"] = 0
    if kabar_baru:
        keadaan["terakhir_id"] = kabar_baru[-1]["id"]
        keadaan["hari_ini"] = int(keadaan.get("hari_ini") or 0) + len(kabar_baru)
        riwayat = list(keadaan.get("riwayat") or []) + kabar_baru
        keadaan["riwayat"] = riwayat[-BATAS_RIWAYAT:]
    return keadaan


def pill(keadaan, galat=""):
    if galat:
        return {"id": "lebihteratur", "judul": "LebihTeratur", "sub": galat, "aktif": False}
    riwayat = (keadaan or {}).get("riwayat") or []
    n = int((keadaan or {}).get("hari_ini") or 0)
    if not riwayat:
        return {"id": "lebihteratur", "judul": "LebihTeratur", "sub": "tersambung, belum ada kabar",
                "aktif": True, "angka": 0}
    akhir = riwayat[-1]
    return {"id": "lebihteratur", "judul": "LebihTeratur",
            "sub": f"{n} kabar hari ini · {akhir['judul']}"[:120], "aktif": True, "angka": n,
            "kabar": list(reversed(riwayat))[:5]}
