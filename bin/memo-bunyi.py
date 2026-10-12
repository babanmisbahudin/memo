#!/usr/bin/env python3
"""Memutar satu bunyi event Memo — sapa, finish, approval, error, lampir.

Berkas kustom di ~/.config/memo/suara/<event>.wav|mp3|ogg menimpa bawaan
(pola Coucou: taruh finish.wav gantimu sendiri). Tanpa berkas kustom,
jatuh ke bunyi tema sistem — jadi tidak butuh jaringan maupun TTS.

Dipanggil non-blokir oleh memo-agen.py (transisi sesi) dan extension.
Langsung dari terminal juga bisa: `memo-bunyi.py finish`.
"""

import pathlib
import subprocess
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from bunyi_pola import EVENT, cari_berkas, dir_suara, jatuh_ke  # noqa: E402


def main(argv=None):
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("event", choices=EVENT)
    ap.add_argument("--daftar", action="store_true",
                    help="cetak berkas yang akan dipakai, jangan bunyikan")
    args = ap.parse_args(argv)

    event = args.event
    d = dir_suara()
    kustom = cari_berkas(event, d)
    if args.daftar:
        print(kustom or f"tema:{jatuh_ke(event)} (taruh di {d}/)")
        return 0

    try:
        if kustom:
            subprocess.run(["ffplay", "-nodisp", "-autoexit",
                            "-loglevel", "quiet", kustom],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                           timeout=15)
        else:
            subprocess.run(["canberra-gtk-play", "-i", jatuh_ke(event)],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                           timeout=10)
    except Exception:  # noqa: BLE001
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
