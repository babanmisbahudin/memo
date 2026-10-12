#!/usr/bin/env python3
"""Melampirkan berkas sebagai konteks Memo — setara drop-file Coucou.

Coucou: seret berkas ke notch, Mochi menelannya. Di GNOME Shell, drop Xdnd
ke aktor panel tidak dapat diandalkan, jadi jalur resminya adalah perintah
ini (plus skrip Nautilus "Tanya Memo tentang berkas ini" yang memanggilnya):

  memo-lampirkan dokumen.txt
  memo-lampirkan --lepas          # melepas lampiran
  memo-lampirkan                  # melihat lampiran aktif

Menulis /dev/shm/memo-lampiran.json (dibaca extension tiap detik) dan
memicu ekspresi `senang` — Mochi "menelan" berkasnya. Isi cuplikan dibaca
nanti oleh memo-suara saat giliran tanya, bukan di sini, supaya lampiran
besar tidak menumpuk di RAM dua kali.
"""

import argparse
import json
import os
import pathlib
import subprocess
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from lampiran_pola import boleh_dilampirkan, buat_lampiran  # noqa: E402

BERKAS_LAMPIRAN = "/dev/shm/memo-lampiran.json"
ROBOT_DEST = "org.himisbah.Robot"
ROBOT_PATH = "/org/himisbah/Robot"


def set_ekspresi(nama, durasi_ms=0):
    try:
        subprocess.run(
            ["gdbus", "call", "--session", "--dest", ROBOT_DEST,
             "--object-path", ROBOT_PATH,
             "--method", f"{ROBOT_DEST}.SetExpression", nama, str(durasi_ms)],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=3)
    except Exception:  # noqa: BLE001
        pass


def tulis(data):
    try:
        with open(f"{BERKAS_LAMPIRAN}.tmp", "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
        os.replace(f"{BERKAS_LAMPIRAN}.tmp", BERKAS_LAMPIRAN)
    except OSError as e:
        print(f"gagal menulis lampiran: {e}", file=sys.stderr)
        return 1
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("berkas", nargs="?", default="")
    ap.add_argument("--lepas", action="store_true")
    args = ap.parse_args(argv)

    if args.lepas:
        try:
            os.unlink(BERKAS_LAMPIRAN)
        except OSError:
            pass
        print("lampiran dilepas")
        return 0

    if not args.berkas:
        try:
            with open(BERKAS_LAMPIRAN, encoding="utf-8") as f:
                data = json.load(f)
            print(f"lampiran: {data.get('path', '?')}")
        except (OSError, json.JSONDecodeError):
            print("tidak ada lampiran")
        return 0

    path = os.path.abspath(os.path.expanduser(args.berkas))
    if not boleh_dilampirkan(path):
        print(f"ditolak: {path} — di luar home atau nama tak valid",
              file=sys.stderr)
        return 1
    try:
        ukuran = os.path.getsize(path)
    except OSError as e:
        print(f"tidak bisa dibaca: {e}", file=sys.stderr)
        return 1

    rc = tulis(buat_lampiran(path, ukuran))
    if rc == 0:
        print(f"terlampir: {path}")
        set_ekspresi("senang", 1200)
    return rc


if __name__ == "__main__":
    sys.exit(main())
