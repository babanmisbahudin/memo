#!/usr/bin/env python3
"""Menulis log kegiatan lengkap ke vault Obsidian, satu berkas per hari.

Beda dari `memo-rangkum.py`: yang itu menjawab "hari ini saya mengerjakan apa"
dalam lima baris. Yang ini menjawab "kapan persisnya saya buka apa", untuk
masa depan ketika lima baris itu ternyata belum cukup.

Sifatnya tambahan, bukan tulis ulang. Logger dijalankan berkali-kali dalam
sehari, jadi isinya ditambahkan sesuai waktu kejadian. Kegiatan yang sudah
tercatat tidak ditulis lagi.

Sumber yang dibaca, semuanya dari salinan karena Chrome dan VS Code mengunci
basis datanya selama aplikasinya jalan:

  browser   riwayat Chrome, dengan waktu kunjungan yang sebenarnya
  terminal  .bash_history - tanpa jam kalau HISTTIMEFORMAT belum disetel
  editor    proyek terakhir yang dibuka di VS Code
  asisten   sesi Claude Code dan opencode, dengan jam sungguhan
  berkas    berkas yang diubah di bawah ~/Projects
  sistem    peringatan dan galat dari log aplikasi OmniRoute

Berkas log disimpan di `06-Harian/log/YYYY-MM-DD.log`. Obsidian menyembunyikan
berkas dengan ekstensi tak didukung selama `showUnsupportedFiles` mati, jadi log
tetap ada di vault dan tetap terbaca dari luar Obsidian tanpa setelan apa pun.
"""

import argparse
import json
import os
import pathlib
import shutil
import sqlite3
import sys
import tempfile
from datetime import datetime, timedelta, timezone

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import log_pola                                   # noqa: E402

VAULT = pathlib.Path(os.environ.get("MEMO_VAULT",
                                    pathlib.Path.home() / "Documents" / "himisbah"))
MAP_LOG = pathlib.Path("06-Harian") / "log"

RUMAH = pathlib.Path.home()
CHROME = RUMAH / ".config" / "google-chrome"
VSCODE_DB = RUMAH / ".config" / "Code" / "User" / "globalStorage" / "state.vscdb"
BASH = RUMAH / ".bash_history"
CLAUDE = RUMAH / ".claude" / "projects"
OPENCODE_DB = RUMAH / ".local" / "share" / "opencode" / "opencode.db"
OMNI_LOG = RUMAH / ".omniroute" / "logs" / "application" / "app.log"
PROYEK = RUMAH / "Projects"

# Chrome menyimpan waktu dalam mikrodetik sejak 1601-01-01, dalam UTC. Sadar
# zonanya penting: membandingkan dengan waktu lokal akan salah beberapa jam.
EPOCH_CHROME = datetime(1601, 1, 1, tzinfo=timezone.utc)

# Direktori yang isinya bukan kegiatan: dependensi, hasil build, cache.
LEWATI_DIR = {".git", "node_modules", "__pycache__", ".venv", "venv", ".dart-tool",
              "build", ".gradle", ".dartServer", ".cache", "dist", "out",
              ".idea", ".vscode", ".flutter", ".pub-cache", ".steam"}
BATAS_BERKAS = 200

LEVEL_GALAT = ("warn", "error", "30", "40")


def _salinan(sumber):
    """Baca basis data dari salinan, karena aslinya terkunci selagi aplikasinya
    jalan. Ini juga menjamin kita tidak pernah menulis ke sana."""
    if not sumber.exists():
        return None
    sementara = tempfile.mktemp(suffix=".db")
    try:
        shutil.copy2(sumber, sementara)
        return sementara
    except OSError:
        return None


def _baca(sumber, kueri, bawa):
    """Jalankan satu kueri di atas salinan, kembalikan barisnya.

    Semua kegagalan basis data jadi daftar kosong. Logger bukan alat yang
    menjatuhkan apa pun kalau sumbernya sedang dikunci atau skemanya berubah.
    """
    sementara = _salinan(sumber)
    if not sementara:
        return []
    hasil = []
    db = None
    try:
        db = sqlite3.connect(f"file:{sementara}?mode=ro", uri=True)
        hasil = db.execute(kueri, bawa).fetchall()
    except sqlite3.Error:
        hasil = []
    finally:
        if db is not None:
            db.close()
        try:
            os.unlink(sementara)
        except OSError:
            pass
    return hasil

# --- browser ---------------------------------------------------------------
def dari_browser(sejak):
    """Kunjungan Chrome sebagai (waktu, sumber, isian).

    Berbeda dengan ringkasan harian, waktu kunjungan yang asli dipakai — itu
    justru seluruh alasan log ini ada. Query string dibuang: di situ paling
    sering ada kunci token dan id sesi.
    """
    hasil = []
    batas = int((sejak - EPOCH_CHROME).total_seconds() * 1_000_000)
    for profil in sorted(CHROME.glob("*/History")):
        for visit_time, url, judul in _baca(
                profil,
                "select v.visit_time, u.url, u.title from visits v "
                "join urls u on u.id = v.url where v.visit_time > ? "
                "order by v.visit_time", (batas,)):
            waktu = EPOCH_CHROME + timedelta(microseconds=visit_time)
            teks = log_pola.bersihkan_url(url)
            if judul and judul != url:
                teks += f" - {judul[:80]}"
            hasil.append((waktu, "browser", teks))
    return hasil


# --- terminal --------------------------------------------------------------
def dari_terminal(batas_karakter=60_000):
    """Perintah bash, dengan jamnya kalau HISTTIMEFORMAT mengizinkan.

    Perintah tanpa jam tetap ditulis dan ditandai sebagai waktu tidak
    diketahui. Hanya bagian terakhir riwayat yang dibaca: berkasnya bisa
    besar, dan logger ini dijalankan sering.
    """
    if not BASH.exists():
        return []
    try:
        isi = BASH.read_text(encoding="utf-8", errors="replace")[-batas_karakter:]
    except OSError:
        return []

    hasil = []
    for perintah, waktu in log_pola.parse_histori(isi, capai_jam=True):
        if waktu:
            # `.astimezone()` pada datetime tanpa zona mengartikannya sebagai
            # waktu lokal, lalu menempelkan zona. Tanpa itu, perbandingan
            # dengan `sejak` yang sadar zona akan gagal dengan TypeError.
            hasil.append((datetime.strptime(waktu, "%Y-%m-%d %H:%M:%S").astimezone(),
                          "terminal", perintah))
        else:
            hasil.append((None, "terminal", perintah))
    return hasil


# --- editor ----------------------------------------------------------------
def dari_editor(batas=6):
    """Proyek terakhir dibuka di VS Code.

    VS Code tidak menyimpan jamnya, jadi dicatat sebagai waktu pemeriksaan
    terakhir. Yang penting proyek mana yang aktif, bukan jamnya.
    """
    baris = _baca(VSCODE_DB,
                  "select value from ItemTable where key='recently.opened'", ())
    if not baris:
        return []
    nama = []
    try:
        for e in json.loads(baris[0][0]).get("entries", []):
            if len(nama) >= batas:
                break
            nama.append(log_pola.nama_akun(e.get("label") or e.get("folderUri") or ""))
    except (json.JSONDecodeError, KeyError, TypeError):
        return []
    return [(None, "editor", f"terakhir dibuka: {n}") for n in nama if n]


# --- asisten ---------------------------------------------------------------
def _teks_prompt(entri):
    """Ambil teks prompt dari satu entri percakapan.

    Isi tempelan (log galat, potongan kode) bukan kegiatan, jadi dilewati:
    menyalinnya ke log hanya menambah ukuran tanpa menambah informasi.
    """
    pesan = entri.get("message") or {}
    isi = pesan.get("content")
    kandidat = []
    if isinstance(isi, str):
        kandidat = [isi]
    elif isinstance(isi, list):
        for bagian in isi:
            if isinstance(bagian, dict) and bagian.get("type") == "text":
                kandidat.append(bagian.get("text", ""))
    for teks in kandidat:
        teks = (teks or "").strip()
        if teks and "<pasted_content" not in teks[:60]:
            return " ".join(teks.split())[:120]
    return None


def dari_claude(sejak):
    """Sesi Claude Code yang punya aktivitas dalam rentang waktu."""
    hasil = []
    batas_mtime = (sejak - timedelta(days=1)).timestamp()
    for berkas in CLAUDE.glob("*/*.jsonl"):
        try:
            if berkas.stat().st_mtime < batas_mtime:
                continue
        except OSError:
            continue
        # Nama foldernya sudah diensor jadi `-home-himisbah-Projects-lebihteratur`,
        # jadi pemecahannya tidak bisa dibalik. Field `cwd` di dalam entri
        # masih menyimpan path asli dan jauh lebih enak dibaca.
        proyek = log_pola.nama_akun(berkas.parent.name.removeprefix("-"))
        awal = akhir = prompt = None
        try:
            with berkas.open(encoding="utf-8", errors="replace") as f:
                for mentah in f:
                    try:
                        d = json.loads(mentah)
                    except json.JSONDecodeError:
                        continue
                    waktu = _iso_lokal(d.get("timestamp"))
                    if waktu is None:
                        continue
                    awal = awal or waktu
                    akhir = waktu
                    cwd = d.get("cwd")
                    if cwd and proyek.startswith("home-"):
                        proyek = log_pola.nama_akun(cwd)
                    if prompt is None and d.get("type") == "user":
                        prompt = _teks_prompt(d)
        except OSError:
            continue
        if awal is None:
            continue
        if (akhir or awal) < sejak:
            continue
        hasil.append((akhir or awal, "asisten",
                      f"claude · {proyek} · {prompt or 'sesi tanpa prompt terbaca'}"))
    return hasil


def dari_opencode(sejak):
    """Sesi opencode yang diperbarui dalam rentang waktu."""
    hasil = []
    for direktori, judul, dibuat in _baca(
            OPENCODE_DB,
            "select directory, title, time_created from session "
            "where time_updated > ?",
            (int(sejak.timestamp() * 1000),)):
        try:
            waktu = datetime.fromtimestamp(dibuat / 1000).astimezone()
        except (ValueError, OSError, OverflowError, TypeError):
            continue
        hasil.append((waktu, "asisten",
                      f"opencode · {log_pola.nama_akun(direktori)} · {str(judul)[:100]}"))
    return hasil


# --- berkas ----------------------------------------------------------------
def dari_berkas(sejak):
    """Berkas yang diubah di bawah ~/Projects.

    Activity yang paling jujur: bukan yang diakses, tapi yang benar-benar
    berubah. Jamnya diambil dari waktu modifikasi, jadi benar.
    """
    hasil = []
    if not PROYEK.is_dir():
        return hasil
    batas = sejak.timestamp()
    for root, dirs, files in os.walk(PROYEK):
        dirs[:] = [d for d in dirs if d not in LEWATI_DIR and not d.startswith(".")]
        for nama in files:
            if len(hasil) >= BATAS_BERKAS:
                return hasil
            try:
                mtime = (pathlib.Path(root) / nama).stat().st_mtime
            except OSError:
                continue
            if mtime > batas:
                hasil.append((datetime.fromtimestamp(mtime).astimezone(), "berkas",
                              f"{log_pola.nama_akun(root)}/{nama}"))
    return hasil


# --- sistem ----------------------------------------------------------------
def dari_sistem(sejak):
    """Peringatan dan galat dari log aplikasi OmniRoute.

    Level info di sini terlalu banyak untuk dibaca manusia — nama host, jadwal
    pemeriksaan, dan aktivitas lain yang berjalan tiap beberapa detik. Yang
    dicatat cuma yang benar-benar bermasalah.
    """
    if not OMNI_LOG.exists():
        return []
    batas = sejak - timedelta(days=1)
    hasil = []
    try:
        isi = OMNI_LOG.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return hasil
    for mentah in isi.splitlines():
        b = mentah.strip()
        if not b or not log_pola.aman_untuk_log(b):
            continue
        try:
            d = json.loads(b)
        except json.JSONDecodeError:
            continue
        waktu = _iso_lokal(d.get("timestamp"))
        if waktu is None or waktu < batas:
            continue
        level = str(d.get("level", "")).lower()
        if level not in LEVEL_GALAT:
            continue
        pesan = " ".join(str(d.get("message", "")).split())[:160]
        hasil.append((waktu, "sistem", f"omniroute/{level} · {pesan}"))
    return hasil


def _iso_lokal(teks):
    if not teks:
        return None
    try:
        return datetime.fromisoformat(str(teks).replace("Z", "+00:00")).astimezone()
    except ValueError:
        return None


# --- pengelompokan dan penulisan ------------------------------------------
def berkas_log(tanggal):
    return VAULT / MAP_LOG / f"{tanggal:%Y-%m-%d}.log"


def kelompokkan(kegiatan, sejak, toleransi=timedelta(minutes=5)):
    """Pisahkan per hari, buang yang di luar rentang, buang yang berisiko.

    Kegiatan tanpa waktu (terminal tanpa jam, proyek VS Code) dikaitkan ke hari
    pemeriksaan. Urutannya dijaga: yang bertime diurutkan, yang tidak
    ditempatkan setelahnya — jangan disisipkan di antara baris bertimestamp,
    karena itu membuat urutan kronologisnya berbohong.

    Ada batas atas juga, bukan hanya batas bawah. Kalau jam sistem meleset,
    kegiatan bertanggal di masa depan akan tertulis apa adanya dan membingungkan
    pembacanya. Toleransinya longgar karena jam beberapa detik berbeda antara
    tempat yang menulis berkasnya dan tempat membacanya itu wajar.
    """
    per_hari = {}
    disaring = 0
    sekarang = datetime.now().astimezone()

    for waktu, sumber, isian in kegiatan:
        if waktu is None:
            b = log_pola.baris_tanpa_waktu(sumber, isian)
        else:
            if waktu < sejak or waktu > sekarang + toleransi:
                continue
            b = log_pola.baris(waktu, sumber, isian)
        if not log_pola.aman_untuk_log(b):
            disaring += 1
            continue
        per_hari.setdefault((waktu or sekarang).date(), []).append(b)

    for hari in per_hari:
        per_hari[hari] = sorted(per_hari[hari])
    return per_hari, disaring


def gabung_ke_berkas(berkas, baris_baru):
    """Tambahkan baris baru tanpa merusak apa pun yang sudah ada.

    Isi lama dibaca lebih dulu supaya kegiatan sebelumnya tidak terduplikasi.
    Penulisan lewat berkas sementara lalu os.replace, supaya Obsidian yang
    kebetulan sedang membuka berkasnya tidak pernah melihat isi setengah jadi.
    """
    lama = []
    if berkas.exists():
        try:
            lama = berkas.read_text(encoding="utf-8").splitlines()
        except OSError:
            lama = []

    existing = set(lama)
    gabungan = log_pola.gabung_baru(lama, baris_baru)
    baru = [b for b in gabungan if b not in existing]
    if not baru:
        return 0

    try:
        berkas.parent.mkdir(parents=True, exist_ok=True)
        sementara = berkas.with_suffix(".log.tmp")
        with sementara.open("w", encoding="utf-8") as f:
            if lama:
                f.write("\n".join(lama) + "\n")
            f.write("\n".join(baru) + "\n")
        os.replace(sementara, berkas)
    except OSError as e:
        print(f"gagal menulis {berkas}: {e}", file=sys.stderr)
        return 0
    return len(baru)


def main():
    p = argparse.ArgumentParser(
        description="Catat seluruh kegiatan ke log harian di vault Obsidian.")
    p.add_argument("--jam", type=float, default=6.0,
                   help="rentang aktivitas yang dicatat, dalam jam")
    p.add_argument("--kering", action="store_true",
                   help="cetak hasilnya, jangan tulis ke vault")
    p.add_argument("--tanpa-berkas", action="store_true",
                   help="lewati pemindaian berkas yang diubah (lebih cepat)")
    args = p.parse_args()

    if not VAULT.is_dir():
        print(f"vault tidak ditemukan: {VAULT}", file=sys.stderr)
        return 1

    sejak = datetime.now().astimezone() - timedelta(hours=args.jam)

    kegiatan = []
    kegiatan += dari_browser(sejak)
    kegiatan += dari_terminal()
    kegiatan += dari_editor()
    kegiatan += dari_claude(sejak)
    kegiatan += dari_opencode(sejak)
    kegiatan += dari_sistem(sejak)
    if not args.tanpa_berkas:
        kegiatan += dari_berkas(sejak)

    per_hari, disaring = kelompokkan(kegiatan, sejak)
    if not per_hari:
        print(f"tidak ada kegiatan dalam {args.jam:g} jam terakhir")
        return 0

    for hari in sorted(per_hari):
        baris_baru = per_hari[hari]
        if args.kering:
            print(f"--- {hari} ({len(baris_baru)} baris) ---")
            print("\n".join(baris_baru))
        else:
            n = gabung_ke_berkas(berkas_log(hari), baris_baru)
            print(f"{hari}: {n} baris baru -> {MAP_LOG}/{hari:%Y-%m-%d}.log")

    if disaring:
        print(f"({disaring} baris disaring karena berpotensi memuat rahasia)")
    if args.kering:
        print("\n(mode kering - tidak ada yang ditulis)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
