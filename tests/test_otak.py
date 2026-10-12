"""Uji pengurai jawaban AI — tanpa memanggil AI sungguhan, tanpa jaringan."""
import pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "bin"))
from otak import _teks_dari_opencode, backend_tersedia, pilih_backend

gagal = lolos = 0
def cek(label, syarat):
    global gagal, lolos
    if syarat: lolos += 1
    else:
        gagal += 1
        print(f"GAGAL | {label}")

ALIRAN = '\n'.join([
    '{"type":"step-start","part":{"type":"step-start"}}',
    '{"type":"text","part":{"type":"text","text":"Ibukota Jepang adalah Tokyo."}}',
    '{"type":"step_finish","part":{"tokens":{"total":21087}}}',
])
cek("jawaban terambil dari aliran", _teks_dari_opencode(ALIRAN) == "Ibukota Jepang adalah Tokyo.")

BANYAK = '\n'.join([
    '{"type":"text","part":{"type":"text","text":"Baris satu."}}',
    '{"type":"text","part":{"type":"text","text":"Baris dua."}}',
])
cek("beberapa bagian teks digabung", _teks_dari_opencode(BANYAK) == "Baris satu.\nBaris dua.")

RUSAK = '\n'.join([
    'ini bukan json sama sekali',
    '{ json setengah',
    '{"type":"text","part":{"type":"text","text":"Tetap terbaca."}}',
])
cek("baris rusak dilewati, bukan menggagalkan semua",
    _teks_dari_opencode(RUSAK) == "Tetap terbaca.")

cek("aliran kosong menghasilkan teks kosong", _teks_dari_opencode("") == "")
cek("aliran tanpa bagian teks menghasilkan kosong",
    _teks_dari_opencode('{"type":"step_finish","part":{}}') == "")
cek("bagian teks kosong diabaikan",
    _teks_dari_opencode('{"type":"text","part":{"type":"text","text":""}}') == "")

ada = backend_tersedia()
cek("setidaknya satu backend terdeteksi", len(ada) > 0)
cek("otomatis memilih yang tersedia", pilih_backend("otomatis") in ada)
cek("permintaan spesifik dihormati bila ada",
    pilih_backend(ada[0]) == ada[0])
cek("permintaan backend tak terpasang jatuh ke yang ada",
    pilih_backend("tidak-ada-ini") in ada)

print(f"\n{lolos} lolos, {gagal} gagal")
sys.exit(1 if gagal else 0)
