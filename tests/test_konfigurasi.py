"""Uji pemetaan isyarat — tanpa kamera, tanpa GNOME."""

import json
import os
import pathlib
import sys
import tempfile

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "bin"))

from konfigurasi import BAWAAN, ISYARAT_SAH, muat, rapikan, simpan

gagal = 0
lolos = 0


def cek(label, syarat):
    global gagal, lolos
    if syarat:
        lolos += 1
    else:
        gagal += 1
        print(f"GAGAL | {label}")


# --- bawaan ---
b = rapikan(None)
cek("semua isyarat sah punya entri",
    all(n in b["isyarat"] for n in ISYARAT_SAH))
cek("telapak terbuka jadi pembuka gerbang",
    b["isyarat"]["telapak_terbuka"]["jenis"] == "aktifkan")
cek("kepalan bawaan harus ditahan lama",
    b["isyarat"]["kepalan"].get("tahan", 0) >= 1.0)
cek("jempol berulang", b["isyarat"]["jempol"]["berulang"] is True)

# --- entri rusak diganti bawaan, bukan melumpuhkan semuanya ---
rusak = rapikan({"isyarat": {
    "jempol": {"jenis": "jenis-ngawur"},
    "damai": {"jenis": "aplikasi", "target": "   "},
    "tiga": "bukan objek",
    "telunjuk": {"jenis": "volume", "arah": "menyamping"},
}})
cek("jenis tak dikenal diganti bawaan",
    rusak["isyarat"]["jempol"]["jenis"] == "volume")
cek("target kosong diganti bawaan",
    rusak["isyarat"]["damai"]["jenis"] == "tombol")
cek("entri bukan objek diganti bawaan",
    rusak["isyarat"]["tiga"]["jenis"] == "tombol")
cek("arah volume ngawur diganti bawaan",
    rusak["isyarat"]["telunjuk"]["arah"] == "turun")
cek("isyarat lain tetap utuh walau ada yang rusak",
    rusak["isyarat"]["kepalan"]["target"] == "ctrl+w")

# --- isyarat di luar daftar tidak ikut masuk ---
liar = rapikan({"isyarat": {"empat_jari": {"jenis": "perintah", "target": "ls"}}})
cek("isyarat tak dikenal dibuang", "empat_jari" not in liar["isyarat"])

# --- angka waktu dijepit ---
ekstrem = rapikan({"isyarat": {
    "damai": {"jenis": "perintah", "target": "x", "jeda": 0.0001},
    "tiga": {"jenis": "perintah", "target": "x", "jeda": 9999},
    "kepalan": {"jenis": "perintah", "target": "x", "tahan": -5},
}})
cek("jeda terlalu kecil dijepit", ekstrem["isyarat"]["damai"]["jeda"] >= 0.2)
cek("jeda terlalu besar dijepit", ekstrem["isyarat"]["tiga"]["jeda"] <= 5.0)
cek("tahan negatif dijepit", ekstrem["isyarat"]["kepalan"]["tahan"] >= 0.0)
cek("jeda bukan angka tidak melempar error",
    rapikan({"isyarat": {"damai": {"jenis": "perintah", "target": "x",
                                   "jeda": "cepat"}}})["isyarat"]["damai"]["jeda"] == 0.7)

# --- perintah shell tersimpan apa adanya ---
perintah = rapikan({"isyarat": {
    "damai": {"jenis": "perintah", "target": "google-chrome --new-window"},
}})
cek("perintah shell tersimpan utuh",
    perintah["isyarat"]["damai"]["target"] == "google-chrome --new-window")

# --- simpan lalu muat ---
with tempfile.TemporaryDirectory() as d:
    jalur = os.path.join(d, "memo", "isyarat.json")
    ubah = rapikan(None)
    ubah["isyarat"]["damai"] = {"jenis": "aplikasi", "target": "google-chrome.desktop"}
    simpan(ubah, jalur)
    cek("berkas benar-benar dibuat", os.path.exists(jalur))

    kembali = muat(jalur)
    cek("perubahan bertahan setelah dimuat ulang",
        kembali["isyarat"]["damai"]["target"] == "google-chrome.desktop")
    cek("isyarat lain tetap bawaan",
        kembali["isyarat"]["jempol"]["jenis"] == "volume")

    with open(jalur, encoding="utf-8") as f:
        cek("berkasnya JSON yang sah", isinstance(json.load(f), dict))

    # Berkas rusak tidak boleh menjatuhkan apa pun
    with open(jalur, "w", encoding="utf-8") as f:
        f.write("{ ini bukan json")
    cek("JSON rusak jatuh ke bawaan",
        muat(jalur)["isyarat"]["jempol"]["jenis"] == "volume")

cek("berkas tidak ada jatuh ke bawaan",
    muat("/tidak/ada/sama/sekali.json")["isyarat"]["kepalan"]["jenis"] == "tombol")

print(f"\n{lolos} lolos, {gagal} gagal")
sys.exit(1 if gagal else 0)
