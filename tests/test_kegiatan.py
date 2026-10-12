"""Cek bahwa tiap pengumpul kegiatan selalu mengembalikan daftar.

Bug yang diperbaiki tadi — `dari_berkas` tanpa `return` di akhir — tidak
mengecas selama semua cabangnya kebetulan mengembalikan nilai, dan `--tanpa-berkas`
nyaris menutupinya. Uji ini menutup jalurnya: pengumpul dipanggil dengan
sumber yang semuanya hilang, jadi kalau ada jalur yang jatuh tanpa return,
hasilnya `None` dan langsung ketahuan.
"""

import pathlib
import sys
import tempfile
from datetime import datetime, timedelta

AKAR = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(AKAR / "bin"))

import log_pola                                   # noqa: E402
import memo_log_uji as uji                        # noqa: E402

gagal = lolos = 0


def cek(label, syarat):
    global gagal, lolos
    if syarat:
        lolos += 1
    else:
        gagal += 1
        print(f"GAGAL | {label}")


def cek_hasil(nama, hasil, boleh_isi):
    cek(f"{nama} mengembalikan daftar", isinstance(hasil, list))
    if not isinstance(hasil, list):
        return
    cek(f"{nama} {'ada isi' if boleh_isi else 'kosong'}", bool(hasil) == boleh_isi)
    if not hasil:
        return
    # Diperiksa sekaligus, bukan satu per satu: hundreds baris nyata dari
    # riwayat asli akan mengalikan jumlah laporan tanpa menambah kejelasan.
    tripel = all(isinstance(w, (type(None), datetime)) and isinstance(s, str)
                 and isinstance(i, str) for w, s, i in hasil)
    cek(f"{nama} setiap isi berupa (waktu, sumber, isian)", tripel)
    cek(f"{nama} semua sumber dikenal",
        all(s in log_pola.SUMBER for _, s, _ in hasil))
    cek(f"{nama} waktunya sadar zona atau None",
        all(w is None or w.tzinfo is not None for w, _, _ in hasil))
    cek(f"{nama} isiannya tidak kosong",
        all(i.strip() for _, _, i in hasil))


# Pengumpul yang menerima rentang waktu. Masa depan dipilih supaya tidak ada
# kegiatan tercatat di sana.
masa_depan = datetime.now().astimezone() + timedelta(seconds=1)

for nama in ("dari_browser", "dari_editor", "dari_claude", "dari_opencode",
             "dari_berkas"):
    fungsi = getattr(uji, nama)
    try:
        hasil = fungsi(masa_depan)
    except Exception as e:                                   # noqa: BLE001
        cek(f"{nama} tidak melempar galat", False)
        print(f"        {type(e).__name__}: {e}")
        continue
    cek_hasil(nama, hasil, boleh_isi=False)

# `dari_terminal` tidak menerima rentang waktu sama sekali — penyaringan
# dilakukan di `kelompokkan`, jadi di sini hanya dicek bentuk kembalannya.
try:
    cek_hasil("dari_terminal", uji.dari_terminal(), boleh_isi=True)
except Exception as e:                                       # noqa: BLE001
    cek("dari_terminal tidak melempar galat", False)
    print(f"        {type(e).__name__}: {e}")

# `dari_sistem` memang menerima rentang waktu, tapi longgar: log aplikasi
# bisa terlambat beberapa detik, jadi ia mulai satu hari lebih awal.
try:
    cek_hasil("dari_sistem", uji.dari_sistem(masa_depan), boleh_isi=True)
except Exception as e:                                       # noqa: BLE001
    cek("dari_sistem tidak melempar galat", False)
    print(f"        {type(e).__name__}: {e}")

# Pengelompokan harus tolerate semua sumber kosong, dan tidak boleh menghasilkan
# apa pun dari daftar kosong.
per_hari, disaring = uji.kelompokkan([], masa_depan)
cek("pengelompokan daftar kosong menghasilkan apa-apa", per_hari == {})
cek("tidak ada yang disaring dari daftar kosong", disaring == 0)

# Æ─ootongan rusak: waktu di luar rentang harus dibuang, bukan ditulis.
luar = [
    (datetime.now().astimezone() - timedelta(days=30), "browser", "lama.com"),
    (datetime.now().astimezone() + timedelta(days=1), "browser", "nanti.com"),
    (None, "terminal", "git status"),
]
per_hari, disaring = uji.kelompokkan(luar, masa_depan)
jumlah = sum(len(v) for v in per_hari.values())
cek("aktivitas lama dibuang", jumlah == 1)
cek("aktivitas masa depan dibuang",
    not any("nanti.com" in b for v in per_hari.values() for b in v))
cek("aktivitas tanpa waktu tetap dicatat",
    any("git status" in b for v in per_hari.values() for b in v))
cek("aktivitas tanpa waktu ditandai waktu tak diketahui",
    any(log_pola.parse_baris(b)[0] == log_pola.WAKTU_TAK_DIKETAHUI
        for v in per_hari.values() for b in v))

# Kegiatan di masa depan yang hanya beberapa detik saja tetap diterima — jam
# tempat yang menulis berkasnya boleh sedikit berbeda dengan jam kita.
mendekati = [
    (datetime.now().astimezone() + timedelta(seconds=2), "browser", "sebentar.com"),
]
per_hari, _ = uji.kelompokkan(mendekati, masa_depan)
cek("selisih hitungan detik tidak dianggap masa depan",
    sum(len(v) for v in per_hari.values()) == 1)

# Potongan berisiko harus dibuang dan hanya dilaporkan jumlahnya.
# Batas bawah di sini dibuat wajar (6 jam ke belakang), bukan masa depan —
# kalau tidak, semuanya terbuang sebelum sempat diuji risikonya.
sejak_nyata = datetime.now().astimezone() - timedelta(hours=6)
berbahaya = [
    (datetime.now().astimezone(), "terminal", "mysql -u root --password=rahasia"),
    (datetime.now().astimezone(), "terminal", "MONGODB_URI=mongodb+srv://u:p@h/db node x"),
    (datetime.now().astimezone(), "terminal", "git status"),
]
per_hari, disaring = uji.kelompokkan(berbahaya, sejak_nyata)
jumlah = sum(len(v) for v in per_hari.values())
cek("dua baris berbahaya dibuang", jumlah == 1 and disaring == 2)
cek("baris aman tetap masuk", any("git status" in b for v in per_hari.values() for b in v))
cek("isi berbahaya tidak bocor ke hasil",
    not any("rahasia" in b or "mongodb+srv" in b for v in per_hari.values() for b in v))

# Semua sumber hilang: tidak boleh ada yang melempar, dan hasilnya kosong.
with tempfile.TemporaryDirectory() as kosong:
    uji.tunjuk_kosong(kosong)
    try:
        for nama in ("dari_browser", "dari_editor", "dari_claude",
                     "dari_opencode", "dari_berkas"):
            cek(f"{nama} aman saat sumber hilang",
                getattr(uji, nama)(masa_depan) == [])
        cek("dari_terminal aman saat sumber hilang", uji.dari_terminal() == [])
        cek("dari_sistem aman saat sumber hilang", uji.dari_sistem(masa_depan) == [])
    finally:
        uji.pulihkan()

# Penulisan ke berkas: dua kali dengan isi sama tidak boleh menggandakan.
with tempfile.TemporaryDirectory() as sementara:
    berkas = pathlib.Path(sementara) / "2026-10-02.log"
    isi = ["[2026-10-02 09:00:00] browser a.com",
           "[2026-10-02 10:00:00] terminal git status"]
    cek("penulisan pertama menambah baris", uji.gabung_ke_berkas(berkas, isi) == 2)
    cek("dijalankan lagi tidak menambah apa pun",
        uji.gabung_ke_berkas(berkas, isi) == 0)
    cek("isi berkas utuh setelah dua kali jalan",
        berkas.read_text(encoding="utf-8").splitlines() == isi)

    # Berkas yang sudah punya isi lain tidak boleh kehilangan apa pun.
    tambahan = ["[2026-10-02 11:00:00] browser b.com"]
    cek("baris baru ditambahkan", uji.gabung_ke_berkas(berkas, tambahan) == 1)
    isi_akhir = berkas.read_text(encoding="utf-8").splitlines()
    cek("isi lama masih ada", all(b in isi_akhir for b in isi))
    cek("isi baru ada", tambahan[0] in isi_akhir)

    # Berkas kosong sekali pun harus berfungsi.
    kosong_baru = pathlib.Path(sementara) / "2026-10-03.log"
    cek("berkas baru langsung dibuat", uji.gabung_ke_berkas(kosong_baru, isi) == 2)

    # Isi yang bukan baris log tetap dipertahankan, tidak dianggap rusak.
    berantakan = pathlib.Path(sementara) / "2026-10-04.log"
    berantakan.write_text("catatan tangan saya sendiri\n", encoding="utf-8")
    uji.gabung_ke_berkas(berantakan, isi)
    isi_berantakan = berantakan.read_text(encoding="utf-8").splitlines()
    cek("tulisan tangan sendiri utuh", "catatan tangan saya sendiri" in isi_berantakan)
    cek("baris log tetap ditambahkan",
        all(b in isi_berantakan for b in isi))

print(f"\n{lolos} lolos, {gagal} gagal")
sys.exit(1 if gagal else 0)