"""Uji wardrobe + bunyi per-event — murni, tanpa GNOME maupun speaker."""
import os
import pathlib
import sys
import tempfile
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "bin"))
from wardrobe_pola import cari, daftar, musiman, rapikan, selesaikan
from bunyi_pola import EVENT, cari_berkas, jatuh_ke, nama_kustom

gagal = lolos = 0
def cek(label, syarat):
    global gagal, lolos
    if syarat: lolos += 1
    else:
        gagal += 1
        print(f"GAGAL | {label}")

cek("tujuh outfit", len(daftar()) == 7)
cek("cari emas", (cari("emas") or {}).get("hue") == 45)
cek("cari asing None", cari("tak-ada") is None)
cek("desember natal", musiman(12) == "natal")
cek("agustus laut", musiman(8) == "laut")
cek("bulan aneh klasik", musiman(99) == "klasik")
cek("bulan rusak klasik", musiman("xx") == "klasik")
cek("musiman mengikuti bulan", selesaikan("musiman", 12) == "natal")
cek("pilihan langsung menang", selesaikan("laut", 12) == "laut")
cek("pilihan rusak jatuh musiman", selesaikan("xx", 6) == "laut")
cek("rapikan bawaan musiman", rapikan(None) == {"outfit": "musiman"})
cek("rapikan menolak asing", rapikan({"outfit": "xx"}) == {"outfit": "musiman"})
cek("rapikan menerima id", rapikan({"outfit": "senja"}) == {"outfit": "senja"})

cek("tujuh event", len(EVENT) == 7 and {"bayar", "pesan"} <= set(EVENT))
cek("kustom tiga format", nama_kustom("finish") == ["finish.wav", "finish.mp3", "finish.ogg"])
cek("jatuh finish complete", jatuh_ke("finish") == "complete")
cek("event asing None", cari_berkas("xx", "/tmp") is None)
cek("tanpa berkas None", cari_berkas("finish", "/tmp-jelas-tak-ada") is None)
with tempfile.TemporaryDirectory() as d:
    open(os.path.join(d, "approval.mp3"), "w").write("x")
    cek("mp3 kustom ketemu", (cari_berkas("approval", d) or "").endswith("approval.mp3"))
    cek("event lain tetap None", cari_berkas("finish", d) is None)

print(f"\n{lolos} lolos, {gagal} gagal")
sys.exit(1 if gagal else 0)
