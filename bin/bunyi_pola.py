"""Suara per-event ala Coucou — murni, tanpa memutar apa pun.

Coucou: 28 suara buatan tangan + pengguna boleh menimpa dengan berkas
sendiri (finish.wav, approval.mp3, ...). Di Memo mekanismenya sama:
`~/.config/memo/suara/<event>.<wav|mp3|ogg>` menimpa bawaan; kalau tidak
ada, jatuh ke bunyi tema sistem via canberra.

Event yang dikenal: sapa, finish, approval, error, lampir, bayar, pesan.
Pemutarannya ada di memo-bunyi.py; di sini hanya pemetaannya supaya bisa
diuji tanpa speaker.
"""

import os

EVENT = ("sapa", "finish", "approval", "error", "lampir", "bayar", "pesan")

# Berkas yang dicari di direktori suara pengguna, sesuai urutan.
CARI = ("{event}.wav", "{event}.mp3", "{event}.ogg")

# Jatuh ke bunyi tema sistem bila tidak ada berkas kustom.
JATUH = {
    "sapa": "message-new-instant",
    "finish": "complete",
    "approval": "dialog-question",
    "error": "dialog-error",
    "lampir": "dialog-information",
    "bayar": "complete",
    "pesan": "message-new-instant",
}

EKSTENSI = (".wav", ".mp3", ".ogg")


def nama_kustom(event):
    return [p.format(event=event) for p in CARI]


def jatuh_ke(event):
    return JATUH.get(event, "dialog-information")


def cari_berkas(event, dir_suara):
    """Path berkas kustom pertama yang ada, atau None."""
    if event not in EVENT or not dir_suara:
        return None
    for nama in nama_kustom(event):
        path = os.path.join(dir_suara, nama)
        try:
            if os.path.isfile(path):
                return path
        except OSError:
            continue
    return None


def dir_suara():
    dasar = os.environ.get("XDG_CONFIG_HOME") or os.path.expanduser("~/.config")
    return os.path.join(dasar, "memo", "suara")
