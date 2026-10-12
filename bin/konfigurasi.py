"""Pemetaan isyarat ke aksi, tersimpan di ~/.config/memo/isyarat.json.

Murni: tidak mengimpor cv2, mediapipe, maupun Gtk. Yang dikerjakan hanya
memuat, memvalidasi, dan menyediakan nilai bawaan — jadi bisa diuji tanpa
kamera dan tanpa GNOME.

Berkasnya dibaca oleh pendeteksi Python DAN oleh extension GNOME, dan disunting
lewat jendela preferensi. Satu berkas, satu sumber kebenaran.
"""

import json
import os

ISYARAT_SAH = [
    "telapak_terbuka", "jempol", "telunjuk", "damai", "tiga", "kepalan",
]

JENIS_SAH = [
    "nonaktif",    # isyarat sengaja tidak melakukan apa-apa
    "aktifkan",    # membuka gerbang kendali
    "volume",      # arah: naik | turun
    "tombol",      # target: nama kombinasi, mis. ctrl+Page_Down
    "aplikasi",    # target: id .desktop, mis. google-chrome.desktop
    "perintah",    # target: baris perintah
    "ekspresi",    # target: nama ekspresi Memo
]

BAWAAN = {
    "versi": 1,
    "isyarat": {
        "telapak_terbuka": {"jenis": "aktifkan", "buka_menu": True},
        "jempol": {"jenis": "volume", "arah": "naik", "berulang": True, "jeda": 0.45},
        "telunjuk": {"jenis": "volume", "arah": "turun", "berulang": True, "jeda": 0.45},
        "damai": {"jenis": "tombol", "target": "ctrl+Page_Down", "jeda": 0.7},
        "tiga": {"jenis": "tombol", "target": "ctrl+Page_Up", "jeda": 0.7},
        # Kepalan menutup tab: satu-satunya aksi bawaan yang menghilangkan
        # sesuatu, jadi harus ditahan jauh lebih lama daripada yang lain.
        "kepalan": {"jenis": "tombol", "target": "ctrl+w", "tahan": 1.5, "jeda": 0.7},
    },
}


def jalur_berkas():
    dasar = os.environ.get("XDG_CONFIG_HOME") or os.path.expanduser("~/.config")
    return os.path.join(dasar, "memo", "isyarat.json")


def _rapikan(satu):
    """Membersihkan satu entri isyarat, mengembalikan None kalau tidak masuk akal."""
    if not isinstance(satu, dict):
        return None

    jenis = satu.get("jenis")
    if jenis not in JENIS_SAH:
        return None

    hasil = {"jenis": jenis}

    if jenis == "volume":
        arah = satu.get("arah")
        if arah not in ("naik", "turun"):
            return None
        hasil["arah"] = arah
    elif jenis in ("tombol", "aplikasi", "perintah", "ekspresi"):
        target = satu.get("target")
        if not isinstance(target, str) or not target.strip():
            return None
        hasil["target"] = target.strip()

    hasil["berulang"] = bool(satu.get("berulang", False))
    # Hanya berarti untuk jenis "aktifkan": sekalian membuka popup Memo,
    # supaya ada tanda kasat mata bahwa gerbang kendali terbuka.
    if jenis == "aktifkan":
        hasil["buka_menu"] = bool(satu.get("buka_menu", False))

    # Angka waktu dijepit ke rentang masuk akal: nilai gila di berkas tidak
    # boleh membuat pendeteksi macet atau memicu ratusan kali per detik.
    try:
        hasil["jeda"] = min(5.0, max(0.2, float(satu.get("jeda", 0.7))))
    except (TypeError, ValueError):
        hasil["jeda"] = 0.7

    if "tahan" in satu:
        try:
            hasil["tahan"] = min(5.0, max(0.0, float(satu["tahan"])))
        except (TypeError, ValueError):
            pass

    return hasil


def rapikan(mentah):
    """Menggabungkan konfigurasi mentah dengan bawaan, membuang yang tidak sah.

    Entri rusak diabaikan diam-diam dan diganti bawaannya, bukan membuat
    seluruh konfigurasi ditolak — satu baris salah ketik tidak boleh
    melumpuhkan semua isyarat.
    """
    hasil = {"versi": BAWAAN["versi"], "isyarat": {}}

    mentah_isyarat = {}
    if isinstance(mentah, dict) and isinstance(mentah.get("isyarat"), dict):
        mentah_isyarat = mentah["isyarat"]

    for nama in ISYARAT_SAH:
        bersih = _rapikan(mentah_isyarat.get(nama))
        if bersih is None:
            bawaan = BAWAAN["isyarat"].get(nama, {"jenis": "nonaktif"})
            bersih = _rapikan(bawaan) or {"jenis": "nonaktif", "berulang": False, "jeda": 0.7}
        hasil["isyarat"][nama] = bersih

    return hasil


def muat(jalur=None):
    jalur = jalur or jalur_berkas()
    try:
        with open(jalur, encoding="utf-8") as f:
            return rapikan(json.load(f))
    except (OSError, json.JSONDecodeError):
        return rapikan(None)


def simpan(konfigurasi, jalur=None):
    jalur = jalur or jalur_berkas()
    os.makedirs(os.path.dirname(jalur), exist_ok=True)
    sementara = f"{jalur}.tmp"
    with open(sementara, "w", encoding="utf-8") as f:
        json.dump(rapikan(konfigurasi), f, indent=2, ensure_ascii=False)
        f.write("\n")
    os.replace(sementara, jalur)


def mtime(jalur=None):
    """Untuk mendeteksi perubahan berkas tanpa memuat ulang isinya."""
    try:
        return os.path.getmtime(jalur or jalur_berkas())
    except OSError:
        return 0.0
