"""Pembantu uji untuk `memo-log.py`.

Berkas aslinya bernama `memo-log.py` — tanda hubung tidak sah sebagai nama
modul Python, jadi tidak bisa di-`import` biasa. Di sini dimuat lewat
`importlib`, lalu semua jalur ke berkas sumber diarahkan ke direktori kosong
supaya uji bisa memastikan tiap pengumpul tetap aman waktu semua sumber hilang.
"""

import importlib.util
import pathlib
import sys

AKAR = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(AKAR / "bin"))

import log_pola                                   # noqa: E402,F401


def _muat():
    spec = importlib.util.spec_from_file_location(
        "memo_log", AKAR / "bin" / "memo-log.py")
    modul = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modul)
    return modul


_asli = _muat()

# Semua pengumpul diekspor apa adanya supaya uji bisa memanggilnya langsung.
dari_browser = _asli.dari_browser
dari_terminal = _asli.dari_terminal
dari_editor = _asli.dari_editor
dari_claude = _asli.dari_claude
dari_opencode = _asli.dari_opencode
dari_berkas = _asli.dari_berkas
dari_sistem = _asli.dari_sistem
kelompokkan = _asli.kelompokkan
gabung_ke_berkas = _asli.gabung_ke_berkas
berkas_log = _asli.berkas_log

# Dipakai uji untuk memeriksa sumber yang benar-benar tidak ada.

_sumber = {
    "CHROME": _asli.CHROME,
    "VSCODE_DB": _asli.VSCODE_DB,
    "BASH": _asli.BASH,
    "CLAUDE": _asli.CLAUDE,
    "OPENCODE_DB": _asli.OPENCODE_DB,
    "OMNI_LOG": _asli.OMNI_LOG,
    "PROYEK": _asli.PROYEK,
    "VAULT": _asli.VAULT,
}


def tunjuk_kosong(direktori):
    """Arahkan semua sumber ke direktori yang tidak berisi apa pun."""
    dasar = pathlib.Path(direktori)
    for nama, nilai in _sumber.items():
        setattr(_asli, nama, dasar / "tidak-ada" / nama)


def pulihkan():
    """Kembalikan semua sumber ke lokasi aslinya."""
    for nama, nilai in _sumber.items():
        setattr(_asli, nama, nilai)