#!/usr/bin/env python3
"""Daemon pill integrasi Memo — GitHub, LebihTeratur, Vercel, Notion.

LebihTeratur ditarik tiap 30 detik: setiap kabar admin baru (vendor daftar,
chat vendor, pembayaran Midtrans/manual, alert penting) jadi notifikasi
desktop + bunyi, dan island Memo ikut menampilkannya. Klik "Buka" membuka
halaman terkait di dashboard admin. Pill lain diperbarui tiap 5 menit.

  memo-integrasi.py --buat-token            token baru untuk LebihTeratur
  memo-integrasi.py --simpan vercel <token>
  memo-integrasi.py --simpan notion secret_...
  memo-integrasi.py --simpan lebihteratur_url https://api-lain.example.com
  memo-integrasi.py --hapus vercel
  memo-integrasi.py --status                cek sekali, cetak pill
  memo-integrasi.py --uji-notif             tampilkan satu notifikasi contoh

Urutan baca kunci: environ MEMO_<LAYANAN>_KEY dulu, lalu
~/.config/memo/integrasi.json (0600). Tanpa kunci tidak ada satu pun
request ke layanan itu.
"""

import argparse
import datetime
import json
import os
import pathlib
import secrets
import subprocess
import sys
import threading
import time

AKAR = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AKAR))
import integrasi  # noqa: E402
import lebihteratur_pola  # noqa: E402

INTERVAL_KABAR = 30.0
INTERVAL_PILL = 300.0
BERKAS_KEADAAN = pathlib.Path(os.environ.get("XDG_STATE_HOME") or pathlib.Path.home() / ".local" / "state") / "memo" / "lebihteratur.json"


def muat_keadaan():
    try:
        d = json.loads(BERKAS_KEADAAN.read_text(encoding="utf-8"))
        return d if isinstance(d, dict) else {}
    except (OSError, ValueError):
        return {}


def simpan_keadaan(d):
    try:
        BERKAS_KEADAAN.parent.mkdir(parents=True, exist_ok=True)
        tmp = BERKAS_KEADAAN.with_suffix(".tmp")
        tmp.write_text(json.dumps(d, ensure_ascii=False), encoding="utf-8")
        os.replace(tmp, BERKAS_KEADAAN)
    except OSError:
        pass


def _tunggu_klik(proses, url):
    try:
        keluar, _ = proses.communicate(timeout=3600)
        if keluar.strip() == "buka" and url:
            subprocess.Popen(["xdg-open", url], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:  # noqa: BLE001
        proses.kill()


def kabarkan(kabar):
    """Notifikasi desktop (island Memo ikut menampilkannya) + bunyi."""
    url = lebihteratur_pola.url_aman(kabar.get("url", ""))
    perintah = ["notify-send", "--app-name=LebihTeratur", f"--icon={lebihteratur_pola.ikon_untuk(kabar)}",
                kabar["judul"], kabar.get("pesan", "")]
    if lebihteratur_pola.apakah_bayar(kabar):
        perintah.insert(1, "--urgency=critical")
    if url:
        perintah[1:1] = ["--action=buka=Buka", "--wait"]
    try:
        proses = subprocess.Popen(perintah, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
        if url:
            threading.Thread(target=_tunggu_klik, args=(proses, url), daemon=True).start()
    except OSError:
        pass
    try:
        subprocess.Popen([sys.executable, str(AKAR / "memo-bunyi.py"), lebihteratur_pola.bunyi_untuk(kabar)],
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except OSError:
        pass


def periksa_kabar(keadaan, beri_tahu=True):
    """Satu putaran tarik kabar. Mengembalikan (keadaan baru, pill)."""
    tanggal = datetime.date.today().isoformat()
    awal = not keadaan.get("terakhir_id")
    daftar, galat = integrasi.ambil_kabar(keadaan.get("terakhir_id", ""))
    if galat:
        return lebihteratur_pola.catat(keadaan, [], tanggal), lebihteratur_pola.pill(keadaan, galat)
    baru = lebihteratur_pola.lebih_baru(daftar, keadaan.get("terakhir_id", ""))
    keadaan = lebihteratur_pola.catat(keadaan, baru, tanggal)
    if awal:
        # Titik awal: riwayat diisi tanpa notifikasi dan tanpa dihitung.
        keadaan["hari_ini"] = 0
    elif beri_tahu:
        for k in baru:
            kabarkan(k)
    return keadaan, lebihteratur_pola.pill(keadaan)


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--sekali", action="store_true")
    ap.add_argument("--simpan", nargs=2, metavar=("LAYANAN", "KUNCI"))
    ap.add_argument("--hapus", metavar="LAYANAN")
    ap.add_argument("--buat-token", action="store_true")
    ap.add_argument("--status", action="store_true")
    ap.add_argument("--uji-notif", action="store_true")
    args = ap.parse_args(argv)

    if args.simpan:
        layanan, kunci_baru = args.simpan
        sah = integrasi.LAYANAN_BERKUNCI + integrasi.KUNCI_TAMBAHAN
        if layanan not in sah:
            print(f"layanan tak dikenal: {layanan} (pilih: {', '.join(sah)})", file=sys.stderr)
            return 1
        if integrasi.simpan_kunci(layanan, kunci_baru):
            print(f"{layanan} tersimpan di {integrasi.jalur_config()}")
            return 0
        print(f"gagal menyimpan {layanan}", file=sys.stderr)
        return 1

    if args.hapus:
        integrasi.hapus_kunci(args.hapus)
        print(f"{args.hapus} dihapus")
        return 0

    if args.buat_token:
        token = secrets.token_urlsafe(32)
        if not integrasi.simpan_kunci("lebihteratur", token):
            print("gagal menyimpan token", file=sys.stderr)
            return 1
        print(f"Token tersimpan di {integrasi.jalur_config()} (mode 0600).\n")
        print("Pasang nilai yang sama di Render → lebihteratur-api → Environment:")
        print(f"  KABAR_ADMIN_TOKEN={token}")
        return 0

    if args.uji_notif:
        kabarkan({"id": "uji", "jenis": "payment", "judul": "Pembayaran otomatis masuk (uji)",
                  "pesan": "Vendor Contoh membayar Rp 199.000 untuk paket Pro lewat Bayar Otomatis.",
                  "url": "https://own.lebihteratur.com/admin/subscriptions/history"})
        time.sleep(1)
        return 0

    if args.status or args.sekali:
        keadaan, p = periksa_kabar(muat_keadaan(), beri_tahu=False)
        simpan_keadaan(keadaan)
        pills = integrasi.kumpulkan() + [p]
        integrasi.tulis(pills)
        for x in pills:
            print(f"{'●' if x['aktif'] else '○'} {x['judul']}: {x['sub']}")
        return 0

    keadaan = muat_keadaan()
    pills_lain = []
    terakhir_pill = 0.0
    try:
        while True:
            sekarang = time.monotonic()
            if sekarang - terakhir_pill >= INTERVAL_PILL or not terakhir_pill:
                pills_lain = integrasi.kumpulkan()
                terakhir_pill = sekarang
            keadaan, p = periksa_kabar(keadaan)
            simpan_keadaan(keadaan)
            integrasi.tulis(pills_lain + [p])
            time.sleep(INTERVAL_KABAR)
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
