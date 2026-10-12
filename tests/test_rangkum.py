"""Uji penyusun ringkasan harian — tanpa riwayat sungguhan, tanpa vault."""

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "bin"))

from rangkum_pola import (PENANDA_MULAI, PENANDA_SELESAI, ada_bagian,
                          kelompokkan_perintah, ringkas_domain, saring_rahasia,
                          susun, tulis_bagian)

gagal = lolos = 0


def cek(label, syarat):
    global gagal, lolos
    if syarat:
        lolos += 1
    else:
        gagal += 1
        print(f"GAGAL | {label}")


# --- saringan rahasia: bagian paling penting di berkas ini ---
BERISIKO = [
    "export OPENAI_API_KEY=sk-abc123",
    "curl -H 'Authorization: Bearer eyJhbGciOi'",
    "mysql -u root --password=rahasia123",
    "echo $GITHUB_TOKEN",
    "ssh-add ~/.ssh/private_key",
    "aws configure set aws_secret_access_key AKIA123",
    # Tidak memuat kata "password", tapi isinya tetap credential.
    "MONGODB_URI=mongodb+srv://user:sandi123@host.mongo.net/db node x.js",
    "psql postgres://user:rahasia@localhost:5432/db",
]
AMAN = [
    "git status",
    "python3 tests/test_jari.py",
    "cd ~/Projects/memo",
    "systemctl --user restart memo-tangan.service",
]

disaring, jumlah = saring_rahasia(BERISIKO)
cek("semua baris berisiko dibuang", len(disaring) == 0)
cek("jumlah yang dibuang dilaporkan", jumlah == len(BERISIKO))

lolos_aman, buang = saring_rahasia(AMAN)
cek("baris biasa tidak ikut terbuang", len(lolos_aman) == len(AMAN))
cek("tidak ada yang dilaporkan terbuang", buang == 0)

campur, n = saring_rahasia(AMAN + BERISIKO)
cek("campuran tersaring benar", len(campur) == len(AMAN) and n == len(BERISIKO))
cek("tidak ada rahasia yang lolos",
    not any("sk-abc123" in b or "Bearer" in b or "rahasia123" in b for b in campur))

# --- pengelompokan perintah ---
PERINTAH = ["git status", "git push", "git log", "python3 x.py", "python3 y.py",
            "ls", "FOO=bar", "./skrip.sh", "# komentar"]
kel = dict(kelompokkan_perintah(PERINTAH))
cek("git dihitung tiga kali", kel.get("git") == 3)
cek("python3 dihitung dua kali", kel.get("python3") == 2)
cek("penetapan variabel dilewati", "FOO=bar" not in kel)
cek("jalur relatif dilewati", "./skrip.sh" not in kel)
cek("komentar dilewati", "# komentar" not in kel)
cek("baris kosong tidak bikin error", kelompokkan_perintah(["", "   "]) == [])

# --- domain ---
URL = ["https://github.com/a", "https://github.com/b", "https://www.google.com/s",
       "bukan-url", "https://docs.python.org/3/"]
dom = dict(ringkas_domain(URL))
cek("github dihitung dua kali", dom.get("github.com") == 2)
cek("awalan www dibuang", "google.com" in dom)
cek("url ngawur tidak bikin error", "bukan-url" not in dom)

# --- susunan teks ---
baris = susun([("github.com", 12)], ["memo"], [("git", 30)], disaring=4)
cek("browser muncul", any("github.com (12)" in b for b in baris))
cek("vscode muncul", any("memo" in b for b in baris))
cek("terminal muncul", any("30× git" in b for b in baris))
cek("jumlah tersaring disebut", any("4 baris disaring" in b for b in baris))
cek("bagian kosong dilewati", susun([], [], []) == [])

# --- penulisan ke bagian, dengan penanda ---
CATATAN = "\n".join([
    "---", "tipe: harian", "---", "",
    "# Senin", "",
    "## Fokus hari ini", "- [ ] tugas saya", "",
    "## Yang dikerjakan", "- catatan tangan saya sendiri", "",
    "## Masuk kotak", "- ide",
])

hasil = tulis_bagian(CATATAN, "Yang dikerjakan", ["- Browser: github.com (5)"])
cek("penanda ditulis", PENANDA_MULAI in hasil and PENANDA_SELESAI in hasil)
cek("isi ringkasan masuk", "- Browser: github.com (5)" in hasil)
cek("tulisan tangan pengguna utuh", "- catatan tangan saya sendiri" in hasil)
cek("bagian lain utuh",
    "- [ ] tugas saya" in hasil and "## Masuk kotak" in hasil and "- ide" in hasil)

# Idempoten: jalankan lagi dengan isi berbeda
kedua = tulis_bagian(hasil, "Yang dikerjakan", ["- Browser: gitlab.com (9)"])
cek("hanya ada satu blok penanda", kedua.count(PENANDA_MULAI) == 1)
cek("isi lama diganti, bukan ditumpuk", "github.com (5)" not in kedua)
cek("isi baru ada", "gitlab.com (9)" in kedua)
cek("tulisan tangan tetap utuh setelah penulisan kedua",
    "- catatan tangan saya sendiri" in kedua)

ketiga = tulis_bagian(kedua, "Yang dikerjakan", ["- Browser: gitlab.com (9)"])
cek("penulisan ketiga tetap satu blok", ketiga.count(PENANDA_MULAI) == 1)

cek("judul tak dikenal tidak mengubah apa pun",
    tulis_bagian(CATATAN, "Tidak Ada Bagian Ini", ["- x"]) == CATATAN)

# Membedakan "bagian tidak ada" dari "isinya sudah sama" — dua hal yang
# sama-sama menghasilkan teks tak berubah, tapi artinya jauh berbeda.
cek("bagian yang ada terdeteksi", ada_bagian(CATATAN, "Yang dikerjakan"))
cek("bagian yang tidak ada terdeteksi", not ada_bagian(CATATAN, "Tidak Ada"))
cek("jalan kedua dengan isi sama tidak mengubah apa pun",
    tulis_bagian(kedua, "Yang dikerjakan", ["- Browser: gitlab.com (9)"]) == kedua)

print(f"\n{lolos} lolos, {gagal} gagal")
sys.exit(1 if gagal else 0)
