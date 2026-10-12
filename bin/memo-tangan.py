#!/usr/bin/env python3
"""Pemicu ekspresi dan kendali sistem lewat isyarat tangan.

Memo tidak bersuara: isyarat menggerakkan ekspresi matanya dan mengendalikan
volume serta tab.

Pemetaan isyarat ke aksi dibaca dari ~/.config/memo/isyarat.json dan dimuat
ulang otomatis saat berkasnya berubah. Isinya disunting lewat jendela
preferensi extension.

Dua keadaan, dan ini pengamannya:

  SIAGA  — hanya menonton. Tangan yang bergerak saat mengobrol atau menelepon
           tidak mengubah apa pun.
  AKTIF  — dibuka dengan telapak terbuka, mata Memo menyala jadi `mendengar`
           sebagai tanda siap. Hanya selama beberapa detik inilah pose jari
           dibaca sebagai perintah.

Tanpa pemisahan itu, mengarahkan kendali sistem ke detektor yang sifatnya
probabilistik berarti tab dan volume bisa berubah sendiri tanpa diminta.
"""

import argparse
import collections
import pathlib
import shlex
import subprocess
import sys
import time

import cv2
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision as mp_vision

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import konfigurasi                               # noqa: E402
import pratinjau                                 # noqa: E402
from jari_pola import hitung_jari, nama_isyarat  # noqa: E402

LEBAR, TINGGI = 320, 240
FPS = 10
FRAME_BERUNTUN = 5
JEDA_ANTAR_AKSI = 0.7
LAMA_AKTIF = 5.0            # berapa lama kendali terbuka setelah diaktifkan

MODEL = pathlib.Path(__file__).resolve().parent.parent / "model" / "hand_landmarker.task"

ROBOT_DEST = "org.himisbah.Robot"
ROBOT_PATH = "/org/himisbah/Robot"

LANGKAH_VOLUME = "5%"


def panggil_robot(metode, *argumen):
    """Kegagalan D-Bus tidak boleh menjatuhkan pendeteksi — extension bisa saja
    sedang dimatikan, dan itu bukan alasan berhenti mengawasi."""
    try:
        subprocess.run(
            ["gdbus", "call", "--session", "--dest", ROBOT_DEST,
             "--object-path", ROBOT_PATH,
             "--method", f"{ROBOT_DEST}.{metode}", *argumen],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=3)
    except Exception as e:                                   # noqa: BLE001
        print(f"gagal memanggil {metode}: {e}", file=sys.stderr)


def set_ekspresi(nama, durasi_ms=0):
    panggil_robot("SetExpression", nama, str(durasi_ms))


def kirim_tombol(accel):
    panggil_robot("SendKey", accel)


def atur_volume(naik):
    arah = "+" if naik else "-"
    try:
        subprocess.run(
            ["wpctl", "set-volume", "--limit", "1.0",
             "@DEFAULT_AUDIO_SINK@", f"{LANGKAH_VOLUME}{arah}"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=3)
    except Exception as e:                                   # noqa: BLE001
        print(f"gagal mengatur volume: {e}", file=sys.stderr)


def buka_aplikasi(desktop_id):
    nama = desktop_id[:-8] if desktop_id.endswith(".desktop") else desktop_id
    try:
        subprocess.Popen(["gtk-launch", nama],
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception as e:                                   # noqa: BLE001
        print(f"gagal membuka {desktop_id}: {e}", file=sys.stderr)


def jalankan_perintah(baris):
    """Perintah dipecah dengan shlex, bukan diserahkan ke shell.

    Dengan begitu tanda kutip dan spasi ditangani benar, tapi titik koma atau
    $(...) yang tidak sengaja tertinggal di kolom isian tidak berubah jadi
    perintah kedua. Yang memang butuh pipa atau pengalihan bisa menulisnya
    secara terang-terangan sebagai: bash -c "..."
    """
    try:
        argv = shlex.split(baris)
    except ValueError as e:
        print(f"perintah tidak bisa dibaca: {e}", file=sys.stderr)
        return
    if not argv:
        return
    try:
        subprocess.Popen(argv, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception as e:                                   # noqa: BLE001
        print(f"gagal menjalankan perintah: {e}", file=sys.stderr)


def label_aksi(entri):
    jenis = entri["jenis"]
    if jenis == "volume":
        return f"volume {entri['arah']}"
    if jenis in ("tombol", "aplikasi", "perintah", "ekspresi"):
        return f"{jenis} {entri['target']}"
    return jenis


def jalankan_aksi(entri):
    jenis = entri["jenis"]
    if jenis == "volume":
        atur_volume(entri["arah"] == "naik")
    elif jenis == "tombol":
        kirim_tombol(entri["target"])
    elif jenis == "aplikasi":
        buka_aplikasi(entri["target"])
    elif jenis == "perintah":
        jalankan_perintah(entri["target"])
    elif jenis == "ekspresi":
        set_ekspresi(entri["target"], 2000)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--kamera", type=int, default=0)
    parser.add_argument("--verbose", action="store_true")
    parser.add_argument("--tanpa-aksi", action="store_true",
                        help="cetak keputusan tanpa benar-benar mengubah apa pun")
    args = parser.parse_args()

    kamera = cv2.VideoCapture(args.kamera)
    if not kamera.isOpened():
        print(f"tidak bisa membuka kamera {args.kamera} — mungkin sedang dipakai "
              "aplikasi lain", file=sys.stderr)
        return 1

    kamera.set(cv2.CAP_PROP_FRAME_WIDTH, LEBAR)
    kamera.set(cv2.CAP_PROP_FRAME_HEIGHT, TINGGI)

    if not MODEL.exists():
        print(f"model tidak ditemukan: {MODEL}", file=sys.stderr)
        kamera.release()
        return 1

    # MediaPipe 1.0 hanya punya API Tasks; mp.solutions yang lama sudah dihapus.
    opsi = mp_vision.HandLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=str(MODEL)),
        running_mode=mp_vision.RunningMode.VIDEO,
        num_hands=1,
        min_hand_detection_confidence=0.6,
        min_tracking_confidence=0.5,
    )
    tangan = mp_vision.HandLandmarker.create_from_options(opsi)

    beruntun = collections.deque(maxlen=FRAME_BERUNTUN)
    aktif_sampai = 0.0
    boleh_aksi_pada = 0.0
    ditahan_sejak = None
    isyarat_ditahan = None
    jeda_frame = 1.0 / FPS

    peta = konfigurasi.muat()
    mtime_peta = konfigurasi.mtime()
    print(f"pemetaan dimuat dari {konfigurasi.jalur_berkas()}", flush=True)

    print("Memo mengawasi isyarat tangan. Ctrl+C untuk berhenti.", flush=True)
    print("Lampu kamera menyala selama ini berjalan.", flush=True)
    print("Telapak terbuka untuk mengaktifkan kendali.", flush=True)

    try:
        while True:
            awal = time.monotonic()
            berhasil, frame = kamera.read()
            if not berhasil:
                time.sleep(0.5)
                continue

            gambar = mp.Image(image_format=mp.ImageFormat.SRGB,
                              data=cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
            hasil = tangan.detect_for_video(gambar, int(time.monotonic() * 1000))
            sekarang = time.monotonic()
            aktif = sekarang < aktif_sampai

            isyarat = None
            titik = None
            if hasil.hand_landmarks:
                titik = [(p.x, p.y) for p in hasil.hand_landmarks[0]]
                isyarat = nama_isyarat(titik)
                if args.verbose:
                    print(f"[{'AKTIF' if aktif else 'SIAGA'}] "
                          f"jari={hitung_jari(titik)} isyarat={isyarat}", flush=True)

            if pratinjau.diminta():
                pratinjau.tulis(frame, titik, isyarat, aktif)

            # Pemetaan dimuat ulang begitu berkasnya berubah, jadi menyunting
            # lewat jendela preferensi langsung berlaku tanpa restart.
            mtime_baru = konfigurasi.mtime()
            if mtime_baru != mtime_peta:
                mtime_peta = mtime_baru
                peta = konfigurasi.muat()
                print("pemetaan isyarat dimuat ulang", flush=True)

            beruntun.append(isyarat)
            pose_mantap = (len(beruntun) == FRAME_BERUNTUN
                           and beruntun[0] is not None
                           and len(set(beruntun)) == 1
                           and beruntun[0] == isyarat)

            entri = peta["isyarat"].get(isyarat) if isyarat else None
            jenis = entri["jenis"] if entri else None

            # Isyarat yang perlu ditahan dilacak terpisah: yang menjalankan
            # sesuatu yang sulit dibatalkan sengaja diberi tahan lebih lama
            # supaya tidak mungkin terpicu sekilas.
            if entri and entri.get("tahan"):
                if isyarat_ditahan != isyarat:
                    isyarat_ditahan = isyarat
                    ditahan_sejak = sekarang
                cukup_lama = sekarang - ditahan_sejak >= entri["tahan"]
            else:
                isyarat_ditahan = None
                ditahan_sejak = None
                cukup_lama = True

            # cukup_lama ikut diperiksa di sini juga. Tanpa itu setelan
            # "harus ditahan" diam-diam diabaikan untuk isyarat pengaktifan,
            # dan telapak tangan yang kebetulan terlihat kamera langsung
            # membuka popup — persis keluhan yang muncul di pemakaian nyata.
            if (jenis == "aktifkan" and pose_mantap and cukup_lama
                    and sekarang >= boleh_aksi_pada):
                baru_dibuka = not aktif
                if baru_dibuka and entri.get("buka_menu") and not args.tanpa_aksi:
                    panggil_robot("BukaMenu")
                aktif_sampai = sekarang + LAMA_AKTIF
                boleh_aksi_pada = sekarang + JEDA_ANTAR_AKSI
                beruntun.clear()
                if baru_dibuka:
                    print("kendali AKTIF", flush=True)
                    if not args.tanpa_aksi:
                        set_ekspresi("mendengar", int(LAMA_AKTIF * 1000))
                continue

            boleh_jalan = (aktif and entri and jenis not in (None, "nonaktif", "aktifkan")
                           and pose_mantap and cukup_lama
                           and sekarang >= boleh_aksi_pada)

            if boleh_jalan:
                print(f"aksi: {label_aksi(entri)}", flush=True)
                if not args.tanpa_aksi:
                    jalankan_aksi(entri)
                    set_ekspresi("senang", 1200)
                boleh_aksi_pada = sekarang + entri["jeda"]
                isyarat_ditahan = None
                ditahan_sejak = None
                # Pose berulang tidak mengosongkan runtunan: menahan jempol
                # harus terus menaikkan volume. Pose sekali-jalan dikosongkan
                # supaya tidak beruntun sendiri.
                if entri["berulang"]:
                    beruntun.extend([isyarat] * FRAME_BERUNTUN)
                else:
                    beruntun.clear()
                aktif_sampai = sekarang + LAMA_AKTIF
                continue

            if not aktif and aktif_sampai:
                print("kendali tertutup", flush=True)
                aktif_sampai = 0.0
                if not args.tanpa_aksi:
                    set_ekspresi("netral")

            tersisa = jeda_frame - (time.monotonic() - awal)
            if tersisa > 0:
                time.sleep(tersisa)
    except KeyboardInterrupt:
        pass
    finally:
        tangan.close()
        kamera.release()
        pratinjau.bersihkan()

    return 0


if __name__ == "__main__":
    sys.exit(main())
