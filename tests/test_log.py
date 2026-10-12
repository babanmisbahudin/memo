"""Uji aturan log kegiatan — tanpa riwayat sungguhan, tanpa vault."""

import pathlib
import sys
from datetime import datetime

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "bin"))

import log_pola                                       # noqa: E402
from rangkum_pola import saring_rahasia               # noqa: E402

gagal = lolos = 0


def cek(label, syarat):
    global gagal, lolos
    if syarat:
        lolos += 1
    else:
        gagal += 1
        print(f"GAGAL | {label}")


# --- format baris ---
WAKTU = datetime(2026, 10, 2, 14, 3, 11)
b = log_pola.baris(WAKTU, "browser", "github.com/himisbah/memo")
cek("waktu di depan", b.startswith("[2026-10-02 14:03:11]"))
cek("sumber ikut", " browser " in b)
cek("isian di akhir", b.endswith("github.com/himisbah/memo"))

def sumber_ngawur():
    try:
        log_pola.baris(WAKTU, "ngawur", "x")
    except ValueError:
        return True
    return False


cek("sumber tak dikenal ditolak", sumber_ngawur())

p = log_pola.parse_baris(b)
cek("baris bisa diurai ulang", p is not None)
cek("waktu kembali sama", p[0] == "2026-10-02 14:03:11")
cek("sumber kembali sama", p[1] == "browser")
cek("isian kembali sama", p[2] == "github.com/himisbah/memo")
cek("baris bukan log ditolak", log_pola.parse_baris("#opi vault") is None)

# Newline tidak boleh memecah satu kegiatan jadi beberapa baris.
cek("newline diratakan",
    "\n" not in log_pola.baris(WAKTU, "terminal", "git commit\n-m pesan"))

# Isian panjang dipangkas, bukan dipotong di tengah kata tanpa tanda.
panjang = log_pola.baris(WAKTU, "browser", "x" * 500)
cek("isian panjang dipangkas", len(panjang) < 260 and panjang.endswith("…"))

# Waktu tidak diketahui harus jelas berbeda dari tengah malam.
t = log_pola.baris_tanpa_waktu("terminal", "git status")
cek("waktu tak diketahui ditandai",
    t.startswith("[0000-00-00 00:00:00]"))
cek("waktu tak diketahui bukan tengah malam",
    log_pola.WAKTU_TAK_DIKETAHUI != "0000-00-00 00:00:00"[1:])
cek("waktu tak diketahui diparsing",
    log_pola.parse_baris(t)[1] == "terminal")

# --- gerbang rahasia ---
BERISIKO = [
    "git push --password=rahasia123",
    "export API_KEY=sk-abc",
    "curl -H 'Authorization: Bearer eyJ'",
    "[2026-10-02 10:00:00] terminal ssh-add ~/.ssh/private_key",
]
aman = [b for b in BERISIKO if log_pola.aman_untuk_log(b)]
cek("baris berisiko tertahan di gerbang", aman == [])
cek("tidak ada isi baris berisiko yang bocor ke keluaran",
    not any(b in "".join(BERISIKO) for b in aman))

# Secret path lewat filter rangkum yang dipakai memo-rangkum juga.
campur = ["git status", "mysql -u root --password=x", "npm run dev"]
_, kebocor = saring_rahasia(campur)
cek("aturan saringan sama dengan memo-rangkum", kebocor == 1)

# Kredensial di dalam URI tidak memuat kata "password" sama sekali — bentuk ini
# yang paling mudah terlewat kalau saringan hanya relies pada nama variabel.
URI_BERISIKO = [
    "MONGODB_URI=mongodb+srv://pengguna:sandi123@host.mongo.net/db node x.js",
    "psql postgres://user:rahasia@localhost:5432/db",
    "redis://default:password123@127.0.0.1:6379",
    "https://user:token@github.com/repo.git",
]
for u in URI_BERISIKO:
    cek(f"URI berkredensial ditolak: {u[:34]}", not log_pola.aman_untuk_log(u))

URI_AMAN = [
    "https://github.com/himisbah/memo",
    "http://localhost:20128/dashboard",
    "git clone https://github.com/icedman/dash2dock-lite.git",
    "curl https://api.example.com/v1/status",
]
for u in URI_AMAN:
    cek(f"URI biasa tetap boleh: {u[:34]}", log_pola.aman_untuk_log(u))

# --- penyaring perintah ---
# .bash_history bukan daftar perintah: isinya juga potongan kode yang ditempel,
# isi obrolan, dan deretan escape dari paste bracketed.
SAMPAH = [
    "35;184;1M35;184;1M35;184;1M",
    "\x1b[200~cd /tmp",
    "[200~git branch feature",
    "(ref.current.style) di onAnimationComplete. Itu tidak bertahan: framer",
    "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>",
    "const handler = () => { setOpen(true); };\n  return null;",
    "DAMPAKNYA. PageTransition menyisakan clip-path dan will-change",
]
PERINTAH_BENAR = [
    "git status",
    "sudo apt update",
    "cd ~/Projects/wifaq",
    "npm run build",
    "python3 bin/memo-log.py --kering",
    "cd /x && npm test",
    "php artisan migrate:fresh --seed",
    "grep -ri omniroute .",
    "systemctl --user restart memo-tangan.service",
]
for s in SAMPAH:
    cek(f"sampah ditolak: {s[:30]!r}", not log_pola.rbalah_perintah(s))
for s in PERINTAH_BENAR:
    cek(f"perintah diterima: {s[:30]!r}", log_pola.rbalah_perintah(s))

cek("baris kosong ditolak", not log_pola.rbalah_perintah(""))
cek("perintah sangat panjang ditolak",
    not log_pola.rbalah_perintah("git status " + "x" * 500))

# --- URL ---
URL = [
    "https://www.google.com/search?q=pytest",
    "https://github.com/himisbah/memo/",
    "https://app.com/api/x?token=SECRET123&user=1",
    "https://mail.com/#/inbox",
    "bukan-url",
    "https://situs.co/" + "panjang" * 40,
]
r = [log_pola.bersihkan_url(u) for u in URL]
cek("www dibuang", r[0].startswith("google.com/search"))
cek("query dibuang", "q=pytest" not in r[0])
cek("path dipertahankan", r[1] == "github.com/himisbah/memo")
cek("token di query dibuang", "SECRET123" not in r[2])
cek("fragmen dibuang", "#" not in r[3])
cek("url ngawur tidak bikin error", r[4] == "bukan-url")
cek("url panjang dipangkas", len(r[5]) <= 91)
cek("tidak ada satu pun hasil yang memuat 'token='",
    not any("token=" in x or "SECRET" in x for x in r))

# --- riwayat bash ---
RIWAYAT = "\n".join([
    "#1759398400",
    "git status",
    "export API_KEY=rahasia",
    "#1759398500",
    "npm run dev",
    "",
    "#bukan-epoch",
    "ls -la",
])
h = log_pola.parse_histori(RIWAYAT, capai_jam=True)
cek("tiga perintah terbaca", len(h) == 3)
cek("epoch dibaca sebagai waktu", h[0][1] is not None)
cek("waktu berformat benar", h[0][1].count("-") == 2 and h[0][1].count(":") == 2)
cek("perintah rahasia hilang", not any("API_KEY" in p for p, _ in h))
cek("perintah kedua juga bertime", h[1][1] is not None)
cek("perintah setelah baris komentar tanpa waktu",
    h[2][0] == "ls -la" and h[2][1] is None)
cek("komentar bash diabaikan", not any(p.startswith("#") for p, _ in h))

tanpa_jam = log_pola.parse_histori("git status\nls", capai_jam=False)
cek("tanpa capai_jam tidak ada waktu", all(w is None for _, w in tanpa_jam))
cek("epoch diabaikan kalau tidak diminta", tanpa_jam[0][0] == "git status")

# --- gabung & idempoten ---
LAMA = [
    "[2026-10-02 09:00:00] browser github.com/a",
    "[2026-10-02 10:00:00] terminal git status",
]
BARU = [
    "[2026-10-02 11:00:00] browser gitlab.com/b",
    "[2026-10-02 09:00:00] browser github.com/a",   # sudah ada
]
g = log_pola.gabung_baru(LAMA, BARU)
cek("baru masuk", "[2026-10-02 11:00:00] browser gitlab.com/b" in g)
cek("lama tidak hilang", len(g) == 3)
cek("tanpa duplikat", len(g) == len(set(g)))
cek("terurut kronologis",
    [log_pola.parse_baris(x)[0] for x in g] == sorted(log_pola.parse_baris(x)[0] for x in g))

g2 = log_pola.gabung_baru(g, BARU)
cek("dijalankan lagi tidak mengubah apa pun", g2 == g)

# Baris yang sama dengan waktu lebih baru: yang baru menang.
g3 = log_pola.gabung_baru(LAMA, ["[2026-10-02 09:30:00] browser github.com/a"])
cek("waktu terbaru untuk isi sama", any("09:30:00" in x and "github.com/a" in x for x in g3))
cek("waktu lama hilang", not any("09:00:00" in x and "github.com/a" in x for x in g3))

cek("baris rusak diabaikan", log_pola.gabung_baru(["bukan log"], []) == [])

# --- waktu tidak diketahui ---
# Diurutkan berdasarkan teks waktu, jadi `0000-00-00` selalu mendahului
# tanggal sungguhan. Itu memang benar: "tidak diketahui" bukan "terjadi
# paling awal", tapi menaruhnya di depan membuat jelas mana yang perlu
# dicurigai.
campuran = log_pola.gabung_baru([], [
    "[2026-10-02 10:00:00] browser b.com",
    "[0000-00-00 00:00:00] terminal git status",
    "[2026-10-02 09:00:00] browser a.com",
])
cek("ketiga baris ikut", len(campuran) == 3)
waktu_berurut = [log_pola.parse_baris(x)[0] for x in campuran
                  if log_pola.parse_baris(x)[0] != log_pola.WAKTU_TAK_DIKETAHUI]
cek("waktu tak diketahui tidak mengacaukan urutan nyata",
    waktu_berurut == sorted(waktu_berurut))
cek("waktu tak diketahui ada di hasilnya",
    any(log_pola.parse_baris(x)[0] == log_pola.WAKTU_TAK_DIKETAHUI for x in campuran))

# --- nama_akun ---
cek("path terakhir diambil", log_pola.nama_akun("/home/x/Projects/wifaq") == "wifaq")
cek("garis miring akhir diabaikan", log_pola.nama_akun("/a/b/") == "b")
cek("path kosong tidak bikin error", isinstance(log_pola.nama_akun(""), str))

print(f"\n{lolos} lolos, {gagal} gagal")
sys.exit(1 if gagal else 0)