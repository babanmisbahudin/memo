#!/usr/bin/env python3
"""Menulis ringkasan harian ke catatan Obsidian.

Bukan salinan mentah riwayat. Vault ini 56 catatan; riwayat Chrome saja 1.139
kunjungan dan bash 764 baris. Menyalin semuanya mengubah otak kedua jadi
tempat sampah log, dan yang berguna dibaca enam bulan lagi bukan daftar 1.139
URL melainkan "hari itu saya mengerjakan apa".

Ditulis di antara penanda, jadi menjalankannya berkali-kali mengganti blok yang
sama dan tidak pernah menyentuh baris yang ditulis tangan.
"""

import argparse
import json
import os
import pathlib
import shutil
import sqlite3
import sys
import tempfile
from datetime import datetime, timedelta

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from rangkum_pola import (ada_bagian, kelompokkan_perintah,  # noqa: E402
                          ringkas_domain, saring_rahasia, susun, tulis_bagian)

VAULT = pathlib.Path(os.environ.get("MEMO_VAULT",
                                    pathlib.Path.home() / "Documents" / "himisbah"))
MAP_HARIAN = "06-Harian"
TEMPLATE = pathlib.Path("99-Meta") / "templates" / "harian.md"
BAGIAN = "Yang dikerjakan"

CHROME = pathlib.Path.home() / ".config" / "google-chrome"
VSCODE_DB = pathlib.Path.home() / ".config" / "Code" / "User" / "globalStorage" / "state.vscdb"
BASH = pathlib.Path.home() / ".bash_history"

# Chrome menyimpan waktu dalam mikrodetik sejak 1601-01-01.
EPOCH_CHROME = datetime(1601, 1, 1)


def _salin_sementara(sumber):
    """Basis data Chrome dan VS Code terkunci selagi aplikasinya jalan, jadi
    dibaca dari salinan. Ini juga menjamin kita tidak pernah menulis ke sana."""
    if not sumber.exists():
        return None
    salinan = tempfile.mktemp(suffix=".db")
    try:
        shutil.copy2(sumber, salinan)
        return salinan
    except OSError:
        return None


def dari_browser(sejak):
    url = []
    for profil in sorted(CHROME.glob("*/History")):
        salinan = _salin_sementara(profil)
        if not salinan:
            continue
        try:
            batas = int((sejak - EPOCH_CHROME).total_seconds() * 1_000_000)
            db = sqlite3.connect(f"file:{salinan}?mode=ro", uri=True)
            url += [r[0] for r in db.execute(
                "select u.url from urls u join visits v on v.url = u.id "
                "where v.visit_time > ?", (batas,))]
            db.close()
        except sqlite3.Error:
            pass
        finally:
            os.unlink(salinan)
    return ringkas_domain(url)


def dari_vscode(batas=4):
    """Nama proyek terakhir dibuka, tanpa duplikat.

    Satu proyek bisa muncul beberapa kali di daftar VS Code (jendela berbeda,
    remote berbeda), dan mendaftarnya berulang di catatan harian cuma bising.
    """
    salinan = _salin_sementara(VSCODE_DB)
    if not salinan:
        return []
    nama = []
    try:
        db = sqlite3.connect(f"file:{salinan}?mode=ro", uri=True)
        baris = db.execute(
            "select value from ItemTable where key='recently.opened'").fetchone()
        db.close()
        if baris:
            for e in json.loads(baris[0]).get("entries", []):
                if len(nama) >= batas:
                    break
                jalur = e.get("folderUri") or e.get("fileUri") or ""
                if isinstance(jalur, dict):
                    jalur = jalur.get("external", "")
                potongan = str(jalur).rstrip("/").split("/")
                if potongan and potongan[-1] and potongan[-1] not in nama:
                    nama.append(potongan[-1])
    except (sqlite3.Error, json.JSONDecodeError, KeyError):
        pass
    finally:
        os.unlink(salinan)
    return nama


def dari_terminal(batas_baris=400):
    """Riwayat bash tidak bercap waktu, jadi yang diambil sekian baris
    terakhir — itu perkiraan terbaik untuk 'yang baru saja dikerjakan'."""
    if not BASH.exists():
        return [], 0
    try:
        isi = BASH.read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError:
        return [], 0
    aman, disaring = saring_rahasia(isi[-batas_baris:])
    return kelompokkan_perintah(aman), disaring


def berkas_harian(tanggal):
    return VAULT / MAP_HARIAN / f"{tanggal:%Y-%m-%d}.md"


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--jam", type=float, default=24.0,
                   help="rentang riwayat yang diringkas, dalam jam")
    p.add_argument("--kering", action="store_true",
                   help="cetak hasilnya, jangan tulis ke vault")
    args = p.parse_args()

    if not VAULT.is_dir():
        print(f"vault tidak ditemukan: {VAULT}", file=sys.stderr)
        return 1

    sejak = datetime.now() - timedelta(hours=args.jam)
    browser = dari_browser(sejak)
    vscode = dari_vscode()
    terminal, disaring = dari_terminal()

    baris = susun(browser, vscode, terminal, disaring)
    if not baris:
        print("tidak ada yang bisa diringkas")
        return 0

    print("\n".join(baris))

    if args.kering:
        print("\n(mode kering — tidak ada yang ditulis)")
        return 0

    berkas = berkas_harian(datetime.now())
    if not berkas.exists():
        # Tidak membuat catatan harian dari sini. Kalau catatannya belum ada,
        # berarti hari itu belum kamu mulai, dan ringkasan mesin tidak pantas
        # jadi baris pertama di catatan harianmu.
        print(f"\ncatatan harian belum ada ({berkas.name}), ringkasan tidak ditulis")
        return 0

    teks = berkas.read_text(encoding="utf-8")
    if not ada_bagian(teks, BAGIAN):
        print(f"\nbagian '{BAGIAN}' tidak ada di {berkas.name}, tidak ditulis")
        return 0

    baru = tulis_bagian(teks, BAGIAN, baris)
    if baru == teks:
        print(f"\nringkasan di {berkas.name} sudah sama, tidak ditulis ulang")
        return 0

    sementara = berkas.with_suffix(".md.tmp")
    sementara.write_text(baru, encoding="utf-8")
    os.replace(sementara, berkas)
    print(f"\nditulis ke {berkas}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
