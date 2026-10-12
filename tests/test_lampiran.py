"""Uji aturan lampiran berkas — murni, tanpa GNOME."""
import os
import pathlib
import sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "bin"))
from lampiran_pola import (bangun_konteks, boleh_dilampirkan, buat_lampiran,
                           jenis_berkas, teks_ticker)

gagal = lolos = 0
def cek(label, syarat):
    global gagal, lolos
    if syarat: lolos += 1
    else:
        gagal += 1
        print(f"GAGAL | {label}")

rumah = os.path.expanduser("~")
cek("berkas di home boleh", boleh_dilampirkan(f"{rumah}/catatan.txt"))
cek("path relatif ditolak", boleh_dilampirkan("catatan.txt") is False)
cek("di luar home ditolak", boleh_dilampirkan("/etc/hostname") is False)
cek("hidden ditolak", boleh_dilampirkan(f"{rumah}/.rahasia") is False)
cek("null byte ditolak", boleh_dilampirkan(f"{rumah}/a\x00b") is False)
cek("bukan string ditolak", boleh_dilampirkan(None) is False)

cek("py itu teks", jenis_berkas("app.py") == "teks")
cek("png itu biner", jenis_berkas("foto.png") == "biner")
cek("tanpa ekstensi itu teks", jenis_berkas("Makefile") == "teks")

lamp = buat_lampiran(f"{rumah}/a.py", 100)
cek("lampiran membawa nama", lamp["nama"] == "a.py" and lamp["ukuran"] == 100)
cek("ticker ada nama", "a.py" in teks_ticker(lamp))

konteks = bangun_konteks(lamp, "print('halo')")
cek("konteks memuat isi", "print('halo')" in konteks)
bin_lamp = buat_lampiran(f"{rumah}/foto.png", 50)
cek("biner tanpa isi", "tidak dibaca" in bangun_konteks(bin_lamp, "xxxx"))
cek("isi kosong tetap aman", "Lampiran" in bangun_konteks(lamp, ""))

print(f"\n{lolos} lolos, {gagal} gagal")
sys.exit(1 if gagal else 0)
