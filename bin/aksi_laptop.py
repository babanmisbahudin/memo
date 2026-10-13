"""Menjalankan aksi dari aksi_pola.py: buka situs, aplikasi, folder, terminal.

Jalur utama lewat extension (D-Bus org.himisbah.Robot.Buka): diluncurkan dari
dalam GNOME Shell, jendela baru langsung tampil di depan. Bila extension
belum memuat metode itu (versi lama sampai login ulang, atau shell uji
tanpa extension), dipakai cadangan gio/gtk-launch — tetap terbuka, hanya
mungkin muncul sebagai notifikasi "… siap" alih-alih langsung di depan.

  aksi_laptop.py "buka youtube"     coba dari terminal
"""

import json
import os
import re
import shutil
import subprocess
import sys

import aksi_pola

TERMINAL = [("org.gnome.Ptyxis.desktop", "ptyxis", lambda d: ["ptyxis", "--new-window", "-d", d]),
            ("org.gnome.Terminal.desktop", "gnome-terminal", lambda d: ["gnome-terminal", f"--working-directory={d}"])]


def _proses(argv, timeout=8):
    return subprocess.run(argv, capture_output=True, text=True, timeout=timeout)


def _lewat_extension(jenis, target, proses):
    """(berhasil, nama) dari extension, atau None bila extension tidak bisa dipakai."""
    try:
        r = proses(["gdbus", "call", "--session", "--dest", "org.himisbah.Robot",
                    "--object-path", "/org/himisbah/Robot", "--method", "org.himisbah.Robot.Buka",
                    json.dumps(jenis), json.dumps(target, ensure_ascii=False)])
    except (OSError, subprocess.TimeoutExpired):
        return None
    if r.returncode != 0:
        return None
    m = re.match(r"^\((true|false), ['\"](.*)['\"]\)$", r.stdout.strip(), re.DOTALL)
    if not m:
        return None
    return m.group(1) == "true", m.group(2)


def _ada_desktop(id_desktop):
    dasar = [os.environ.get("XDG_DATA_HOME") or os.path.expanduser("~/.local/share")]
    dasar += (os.environ.get("XDG_DATA_DIRS") or "/usr/local/share:/usr/share").split(":")
    dasar.append("/var/lib/snapd/desktop")
    return any(os.path.isfile(os.path.join(d, "applications", id_desktop)) for d in dasar)


def _cadangan(aksi, proses):
    jenis, target = aksi["jenis"], aksi["target"]
    try:
        if jenis in ("url", "folder"):
            ok = proses(["gio", "open", target]).returncode == 0
            return ok, aksi["label"]
        if jenis == "aplikasi":
            for k in target:
                if k.endswith(".desktop") and _ada_desktop(k):
                    return proses(["gtk-launch", k[:-len(".desktop")]]).returncode == 0, aksi["label"]
            return False, ""
        if jenis == "terminal":
            for id_desktop, prog, argv in TERMINAL:
                if shutil.which(prog):
                    subprocess.Popen(argv(target), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                     start_new_session=True)
                    return True, "Terminal"
    except (OSError, subprocess.TimeoutExpired):
        pass
    return False, ""


def jalankan(aksi, proses=_proses):
    """(berhasil, kalimat untuk pengguna). Aksi diperiksa ulang sebelum jalan."""
    jenis = aksi.get("jenis")
    if jenis == "tidak_ketemu":
        return False, aksi["label"]
    if jenis == "url" and not aksi_pola.url_aman(aksi.get("target")):
        return False, "Alamat itu tidak saya buka."
    target = "\n".join(aksi["target"]) if isinstance(aksi.get("target"), list) else aksi.get("target")
    hasil = _lewat_extension(jenis, target, proses)
    if hasil is None:
        hasil = _cadangan(aksi, proses)
    ok, nama = hasil
    if ok:
        return True, f"Siap, {aksi['label'] if jenis != 'aplikasi' else (nama or aksi['label'])} dibuka."
    if jenis == "aplikasi":
        return False, f"Aplikasi {aksi['label']} tidak ketemu di laptop ini."
    return False, f"Gagal membuka {aksi['label']}."


if __name__ == "__main__":
    a = aksi_pola.pahami(" ".join(sys.argv[1:]))
    if not a:
        print("bukan perintah membuka")
        sys.exit(2)
    print(a)
    print(jalankan(a))
