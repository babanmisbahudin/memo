"""Rekap mingguan ala Coucou — murni, dari log harian Memo.

Coucou menampilkan tiap Senin: waktu coding, sesi, berkas, baris berubah,
perintah, izin, agen teratas, proyek teratas, hari tersibuk, sesi terpanjang.
Di Memo sumbernya adalah log harian memo-log.py (format
`[YYYY-MM-DD HH:MM:SS] sumber   isian`); modul ini merangkum 7 hari terakhir
jadi satu dict yang bisa dirender extension atau dibagikan sebagai teks.

Murni: masukan berupa teks log, tanpa membaca vault langsung.
"""

from collections import Counter
from datetime import datetime, timedelta

from log_pola import parse_baris


def rekap(log_teks, sekarang=None):
    sekarang = sekarang or datetime.now()
    batas = sekarang - timedelta(days=7)
    sesi = 0
    perintah = Counter()
    proyek = Counter()
    per_hari = Counter()
    berkas = set()
    tambah = kurang = 0
    izin = 0

    for baris in (log_teks or "").splitlines():
        p = parse_baris(baris)
        if not p:
            continue
        waktu_teks, sumber, isian = p
        try:
            waktu = datetime.strptime(waktu_teks, "%Y-%m-%d %H:%M:%S")
        except ValueError:
            continue
        if waktu < batas:
            continue
        hari = waktu_teks[:10]
        per_hari[hari] += 1
        if sumber == "asisten":
            sesi += 1
        if sumber == "terminal":
            perintah[isian.split()[0] if isian.split() else "?"] += 1
        if sumber == "berkas":
            berkas.add(isian)
            proyek[isian.split("/")[0] if "/" in isian else isian] += 1
        if "izin" in isian.lower() or "allow" in isian.lower():
            izin += 1

    hari_tersibuk = per_hari.most_common(1)[0][0] if per_hari else "-"
    return {
        "rentang": f"{batas.date()} s.d. {sekarang.date()}",
        "sesi": sesi,
        "berkas": len(berkas),
        "perintah_top": perintah.most_common(3),
        "proyek_top": proyek.most_common(1)[0][0] if proyek else "-",
        "hari_tersibuk": hari_tersibuk,
        "izin": izin,
        "total_baris": sum(per_hari.values()),
        "tambah": tambah,
        "kurang": kurang,
    }


def sebagai_teks(r):
    baris = [
        f"Rekap mingguan Memo ({r['rentang']})",
        f"Sesi asisten: {r['sesi']}",
        f"Berkas disentuh: {r['berkas']}",
        f"Baris kegiatan: {r['total_baris']}",
        f"Hari tersibuk: {r['hari_tersibuk']}",
        f"Proyek teratas: {r['proyek_top']}",
        f"Izin diminta: {r['izin']}",
    ]
    if r["perintah_top"]:
        top = ", ".join(f"{k}×{v}" for k, v in r["perintah_top"])
        baris.append(f"Perintah tersering: {top}")
    return "\n".join(baris)
