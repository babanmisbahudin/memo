#!/usr/bin/python3 -IS
"""Relay hook agen coding ke Memo — padanan coucou-hook.

Dipasang sebagai hook Claude Code (lihat memo-pasang.py) dan dipanggil di
setiap event dengan JSON hook di stdin:

  memo-hook.py [--agent <nama>] [<NamaEvent>]

Aturan keras (sama dengan Coucou):
  * Tidak pernah memblokir agen. Bila memo-agen tidak jalan, keluar 0 saat
    itu juga tanpa pendapat apa pun.
  * Hanya PermissionRequest yang menunggu jawaban (maks 110 detik). Dialog
    terminal tetap tampil bersamaan, jadi menjawab di terminal tetap bisa.
  * Tidak ada yang diizinkan tanpa klik manusia. Tanpa keputusan: diam.
  * Selalu keluar 0 — exit 2 akan memblokir alat di Claude Code.
"""

import os
import socket
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

BATAS_SAMBUNG = 0.3
BATAS_KIRIM = 2.0


def _argumen(argv):
    agen, event = "", ""
    it = iter(argv)
    for a in it:
        if a == "--agent":
            agen = next(it, "")
        elif not event and not a.startswith("-"):
            event = a
    return agen, event


def _bicara(baris, menunggu, batas):
    """Kirim satu baris; kembalikan jawaban (str) atau None."""
    import hook_pola
    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    try:
        s.settimeout(BATAS_SAMBUNG)
        s.connect(hook_pola.jalur_soket())
        s.settimeout(BATAS_KIRIM)
        s.sendall(baris.encode("utf-8"))
        if not menunggu:
            return None
        akhir = time.monotonic() + batas
        buf = b""
        while b"\n" not in buf:
            sisa = akhir - time.monotonic()
            if sisa <= 0:
                return None
            s.settimeout(sisa)
            potong = s.recv(4096)
            if not potong:
                break
            buf += potong
        jawab = buf.decode("utf-8", "replace").strip()
        return jawab or None
    except OSError:
        return None
    finally:
        s.close()


def main(argv):
    import json
    import hook_pola

    agen, event_argv = _argumen(argv)
    if sys.stdin is None or sys.stdin.isatty():
        print(__doc__.strip())
        return
    mentah = sys.stdin.buffer.read()
    peta = hook_pola.siapkan(mentah, agen, event_argv, os.getcwd())
    if peta is None:
        keluar = hook_pola.balasan(agen, hook_pola.nama_event(event_argv))
    else:
        menunggu = hook_pola.harus_menunggu(peta)
        baris = json.dumps(peta, ensure_ascii=False) + "\n"
        jawab = _bicara(baris, menunggu, hook_pola.BATAS_TUNGGU_DETIK)
        saran = peta.get("permission_suggestions")
        keluar = hook_pola.balasan(agen, peta["hook_event_name"],
                                   jawab if menunggu else None, saran)
    if keluar:
        sys.stdout.write(keluar + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    try:
        main(sys.argv[1:])
    except BaseException:  # noqa: BLE001 — hook tidak boleh gagal dengan kode != 0
        pass
    os._exit(0)
