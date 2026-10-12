"""Aturan lampiran berkas ala Coucou — murni, tanpa I/O sistem.

Coucou: seret berkas ke notch, Mochi menelannya, lalu tanyakan sesuatu
tentang berkas itu. Di Memo pola yang sama: `memo-lampirkan` menulis
/dev/shm/memo-lampiran.json, extension menampilkannya, dan memo-suara
menempelkan cuplikannya ke prompt AI.

Batas yang dijaga di sini:
  - hanya berkas teks biasa yang cuplikannya dibaca (biner ditolak),
  - ukuran dibatasi supaya prompt tidak meledak,
  - path harus absolut dan di dalam home (tidak boleh /etc/shadow dkk).
"""

import os

BATAS_BYTE = 200_000        # cuplikan maksimal ~200 KB
BATAS_NAMA = 120

EKSTENSI_TEKS = {
    ".txt", ".md", ".markdown", ".py", ".js", ".ts", ".tsx", ".jsx",
    ".json", ".jsonl", ".yaml", ".yml", ".toml", ".ini", ".cfg",
    ".sh", ".bash", ".c", ".h", ".cpp", ".hpp", ".rs", ".go", ".java",
    ".rb", ".php", ".css", ".html", ".xml", ".csv", ".log", ".sql",
    ".tex", ".rst", ".vue", ".svelte",
}


def boleh_dilampirkan(path):
    """True bila path layak jadi lampiran. Tidak menyentuh isi berkas."""
    if not path or not isinstance(path, str):
        return False
    if "\x00" in path or len(path) > 1024:
        return False
    if not os.path.isabs(path):
        return False
    rumah = os.path.expanduser("~")
    if not (path == rumah or path.startswith(rumah + os.sep)):
        return False
    nama = os.path.basename(path)
    if not nama or len(nama) > BATAS_NAMA or nama.startswith("."):
        return False
    return True


def jenis_berkas(path):
    """'teks' bila ekstensinya dikenal sebagai teks, selain itu 'biner'."""
    _, ext = os.path.splitext(path.lower())
    return "teks" if ext in EKSTENSI_TEKS or not ext else "biner"


def buat_lampiran(path, ukuran=0):
    """Rekam lampiran dari path + ukuran yang sudah di-stat pemanggil."""
    return {
        "path": path,
        "nama": os.path.basename(path),
        "jenis": jenis_berkas(path),
        "ukuran": int(ukuran),
    }


def bangun_konteks(lampiran, isi=""):
    """Susun blok konteks untuk ditempel ke prompt AI.

    `isi` adalah cuplikan berkas yang sudah dibaca pemanggil (dibatasi
    BATAS_BYTE di sana). Biner tidak pernah ditempeli isinya — hanya namanya.
    """
    nama = lampiran.get("nama", "?")
    if lampiran.get("jenis") != "teks" or not isi:
        return f"[Lampiran: {nama} ({lampiran.get('jenis', '?')}) — isi tidak dibaca]"
    potong = isi[:BATAS_BYTE]
    akhir = "" if len(isi) <= BATAS_BYTE else "\n... (dipotong)"
    return f"[Lampiran: {nama}]\n{potong}{akhir}"


def teks_ticker(lampiran):
    return f"📎 {lampiran.get('nama', '?')}"
