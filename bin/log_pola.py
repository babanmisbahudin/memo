"""Aturan penulisan log kegiatan — murni teks, tanpa membaca apa pun.

Tidak mengimpor sqlite, tidak menyentuh berkas. Semua masukan diberikan
pemanggil, jadi bisa diuji tanpa riwayat sungguhan.

Tiga hal yang dijaga di sini:

1. Yang berisiko dibuang SEBELUM apa pun ditulis. Terminal sering memuat token,
   dan URL memuat parameter yang kadang berupa token — begitu masuk ke vault,
   isinya tersimpan permanen dan ikut ter-backup.
2. Baris bertanda waktu. Log tanpa jam tidak bisa diurutkan dan tidak berguna
   waktu dicari "kenapa tadi malam aplikasinya nyangkut".
3. Idempoten. Kegiatan yang sudah tercatat tidak ditulis dua kali, jadi logger
   boleh dijalankan sesering mungkin tanpa isi log membengkak.
"""

import re
from datetime import datetime, timezone
from urllib.parse import urlparse

# Diimpor dari modul ringkasan supaya aturan saringan tidak punya dua versi
# yang bisa berbeda pendapat. Satu definisi, satu tempat.
from rangkum_pola import POLA_RAHASIA as POLA_RAHASIA

SUMBER = ("browser", "terminal", "editor", "asisten", "berkas", "sistem")

POLA_URL_BERISIKO = re.compile(
    r"[?&](token|key|auth|sig|signature|password|secret|code)=[^&\s]+",
    re.IGNORECASE,
)

POLA_BARIS_LOG = re.compile(r"^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\] (\w+) +(.*)$")

# `.bash_history` bukan daftar perintah — isi juga bisa potongan kode yang
# ditempel, potongan obrolan, dan deretan kode escape dari paste bracketed.
# Semuanya ikut masuk ke satu file, jadi penyaringnya harus rakus: lebih baik
# satu baris benar hilang daripada log harian berubah jadi tempat sampah.
POLA_KODE_KONTROL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")
POLA_ESCAPE = re.compile(r"(\x1b\[|\[\d{1,3};?\d*[a-zA-Z]|&[a-z]+;|\\u[0-9a-f]{4})")

# Kata kunci perintah yang sering muncul. Baris yang tidak memuat salah satu
# dari ini hampir pasti bukan perintah —History juga bisa menyimpan isi file
# lewat `cat` atau `git commit -m`.
POLA_PERINTAH = re.compile(
    r"(^|\s)(sudo|git|npm|pnpm|yarn|bun|node|python3?|pip|php|composer|"
    r"dart|flutter|cargo|go|java|mvn|gradle|make|docker|podman|kubectl|"
    r"ls|cd|cp|mv|rm|mkdir|rmdir|touch|chmod|chown|ln|find|grep|rg|"
    r"cat|less|head|tail|sort|uniq|wc|diff|echo|printf|which|whereis|"
    r"curl|wget|ssh|scp|rsync|systemctl|journalctl|ps|kill|top|htop|"
    r"opencode|claude|code|omniroute|memo|vim|nano|emacs|obsidian|"
    r"apt|snap|flatpak|steam|reboot|shutdown|ping|dig|host|whois|tar|"
    r"unzip|zip|gzip|gunzip|source|export|alias|history|man|help|"
    r"phpunit|artisan|pytest|jest|vitest|tsc|eslint|prettier|dotnet|"
    r"adb|flutter\w*|dart\w*|supabase|vercel|netlify|gh|aws|gcloud|"
    r"xdotool|wmctrl|spd-say|ffplay|ffmpeg|gdbus|wpctl)",
    re.IGNORECASE,
)

POLA_AWAL = re.compile(
    r"^\s*(?:\w+=\S*\s+|env\s+)*(?:sudo\s+)*(?:" + POLA_PERINTAH.pattern +
    r")(?=[\s;&|]|$)",
    re.IGNORECASE,
)

# Waktu "tidak diketahui". Nol berarti tidak ada waktu, bukan tengah malam —
# harus jelas berbeda dari kegiatan yang benar-benar terjadi jam 00:00.
WAKTU_TAK_DIKETAHUI = "0000-00-00 00:00:00"

BATAS_ISIAN = 200


def waktu_berformat(tanggal):
    """Satu format waktu untuk semua sumber, supaya urutannya benar."""
    return tanggal.strftime("%Y-%m-%d %H:%M:%S")


def baris(waktu, sumber, isian):
    """Rakit satu baris log.

    Isian dirapatkan newline diganti spasi supaya satu kegiatan tetap satu
    baris — kalau tidak, log jadi sulit dibaca dengan grep dan tail.
    """
    if sumber not in SUMBER:
        raise ValueError(f"sumber tidak dikenal: {sumber}")
    bersih = " ".join(str(isian).split())
    if len(bersih) > BATAS_ISIAN:
        bersih = bersih[:BATAS_ISIAN - 1] + "…"
    return f"[{waktu_berformat(waktu)}] {sumber:<8} {bersih}"


def baris_tanpa_waktu(sumber, isian):
    """Baris untuk kegiatan yang sumbernya tidak mencatat jam."""
    if sumber not in SUMBER:
        raise ValueError(f"sumber tidak dikenal: {sumber}")
    bersih = " ".join(str(isian).split())
    if len(bersih) > BATAS_ISIAN:
        bersih = bersih[:BATAS_ISIAN - 1] + "…"
    return f"[{WAKTU_TAK_DIKETAHUI}] {sumber:<8} {bersih}"


def parse_baris(teks):
    """Kembalikan (waktu_teks, sumber, isian), atau None kalau bukan baris log."""
    m = POLA_BARIS_LOG.match(teks)
    if not m:
        return None
    return m.group(1), m.group(2), m.group(3)


def aman_untuk_log(teks):
    """Satu gerbang: True kalau baris ini layak masuk log."""
    return not POLA_RAHASIA.search(teks)


def ringkas_url(url, batas=90):
    """Buang query, fragmen, dan www — simpan yang sering dibaca saja.

    Parameter query paling sering memuat kunci token atau id sesi. Log tidak
    butuh itu untuk diingat, jadi dibuang seluruhnya, bukan disaring satu
    per satu. Panjang juga dipangkas supaya URL panjang tidak mengambil satu
    baris penuh.
    """
    try:
        p = urlparse(url)
    except ValueError:
        return url[:batas]
    if not p.scheme and not p.netloc:
        return url[:batas]

    host = (p.hostname or "").removeprefix("www.")
    jalur = p.path.rstrip("/")
    hasil = f"{host}{jalur}" if host else url
    if not hasil:
        hasil = host or "/"
    return hasil[:batas] + ("…" if len(hasil) > batas else "")


def bersihkan_url(url):
    """Versi ketat untuk sumber yang isinya bisa bocor ke mana saja."""
    return ringkas_url(POLA_URL_BERISIKO.sub("", url))


def nama_akun(nama):
    """Ambil bagian terakhir dari sebuah path."""
    potongan = str(nama).rstrip("/").split("/")
    return potongan[-1] if potongan and potongan[-1] else str(nama)


def rbalah_perintah(b):
    """Apakah baris ini layak dianggap perintah?

    Satu gerbang, dipakai sebelum apa pun ditulis. Menolak lebih banyak
    daripada yang perlu adalah pilihan yang benar di sini: log yang terlalu
    banyak baris sampah jauh lebih buruk daripada log yang kehilangan satu
    `git status`.
    """
    if not b or len(b) > 400:
        return False
    if POLA_KODE_KONTROL.search(b) or POLA_ESCAPE.search(b):
        return False
    # Dua spasi berturut-turut = potongan kode atau isi file yang ditempel.
    if "  " in b:
        return False
    # Kata perintah harus occupy posisi perintah: awal baris, atau setelah
    # Operator shell. Kalau boleh muncul di mana saja, kalimat seperti
    # "Co-Authored-By: Claude Opus 5" ikut lolos hanya karena memuat nama
    # program.
    return bool(POLA_AWAL.search(b))


def parse_histori(isi, capai_jam=False):
    """Baca .bash_history menjadi daftar (perintah, waktu_teks atau None).

    Bash hanya menulis baris `#<epoch>` di depan perintahnya kalau
    HISTTIMEFORMAT disetel. Kalau belum, tidak ada waktu sama sekali dan
    setiap perintah jadi tanpa waktu — logger tetap menulisnya, tapi ditandai
    begitu supaya tidak dikira tahu kapan terjadi.
    """
    hasil = []
    tertunda = None
    for mentah in isi.splitlines():
        b = mentah.strip()
        if not b:
            continue
        if b.startswith("#"):
            # `#<epoch>` berarti bash menulis jamnya. Awalan `#` lainnya cuma
            # komentar, bukan kegiatan.
            if b[1:].isdigit():
                tertunda = b[1:]
            continue
        if POLA_RAHASIA.search(b) or not rbalah_perintah(b):
            tertunda = None
            continue
        waktu = None
        if capai_jam and tertunda:
            waktu = _epoch_ke_waktu(tertunda)
        hasil.append((b, waktu))
        tertunda = None
    return hasil


def _epoch_ke_waktu(epoch):
    try:
        dt = datetime.fromtimestamp(int(epoch), tz=timezone.utc).astimezone()
    except (ValueError, OSError, OverflowError):
        return None
    return waktu_berformat(dt)


def gabung_baru(lama, baru):
    """Gabungkan dua daftar baris, buang duplikat, jaga urutannya.

    Yang sudah ada tidak ditulis ulang. Kalau baris yang sama muncul dengan
    waktu berbeda, yang lebih baru yang dipakai — supaya logger yang jalan
    terlambat tetap menyimpan waktu yang benar.
    """
    posisi = {}
    for b in list(lama) + list(baru):
        p = parse_baris(b)
        if p:
            posisi[(p[1], p[2])] = b
    return sorted(posisi.values(),
                  key=lambda b: (parse_baris(b) or ("", "", ""))[0])
