#!/usr/bin/env python3
"""Layanan suara Memo: dengar, tanya AI, jawab dengan suara.

Berjalan terus dengan model whisper SUDAH termuat di memori. Itu inti
keberadaannya: memuat model tiap kali tombol diklik menambah ~3 detik pada
giliran yang sudah 12 detik. Harganya ~500 MB memori selagi layanan nyala.

Dipicu lewat berkas di /dev/shm, pola yang sama dengan memo-agen —
popup menyentuh berkasnya, layanan ini melihatnya. Lebih sederhana daripada
memasang D-Bus di sisi Python, dan sudah terbukti jalan.

Ekspresi mata Memo mengikuti tahapannya, jadi kamu tahu dia sedang di mana:
mendengar -> berpikir -> bicara -> netral.
"""

import argparse
import os
import pathlib
import subprocess
import sys
import time

import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from otak import tanya                                      # noqa: E402
import izin_klien                                            # noqa: E402

BERKAS_PICU = "/dev/shm/memo-ngobrol.minta"
# Nama lama yang masih ditulis popup extension (.picu). Diterima juga supaya
# tombol suara tetap jalan walau satu sisi belum diperbarui — salah satu dari
# keduanya cukup untuk memicu satu giliran dengar.
BERKAS_PICU_LAMA = "/dev/shm/memo-ngobrol.picu"
BERKAS_STATUS = "/dev/shm/memo-ngobrol.status"
# Tingkat suara ditulis tiap blok (100 ms) supaya mata Memo bisa berdenyut
# mengikuti suara sungguhan. Angkanya sudah dihitung untuk deteksi hening,
# jadi menuliskannya tidak menambah kerja apa pun.
BERKAS_LEVEL = "/dev/shm/memo-ngobrol.level"
# Pertanyaan yang diketik di popup. Mikrofon internal laptop ini terpotong di
# puncak dan pengenalannya tidak bisa diandalkan, jadi mengetik dijadikan
# jalur utama dan suara jadi pelengkap.
BERKAS_TEKS = "/dev/shm/memo-ngobrol.teks"
BERKAS_BACKEND = "/dev/shm/memo-ngobrol.backend"
BERKAS_LAMPIRAN = "/dev/shm/memo-lampiran.json"
# Percakapan terakhir untuk tab Chat di island.
BERKAS_RIWAYAT = "/dev/shm/memo-ngobrol.riwayat.json"


def catat(peran, teks):
    import json as _json
    try:
        with open(BERKAS_RIWAYAT, encoding="utf-8") as f:
            riwayat = _json.load(f)
    except (OSError, ValueError):
        riwayat = []
    riwayat = izin_klien.tambah_riwayat(riwayat if isinstance(riwayat, list) else [], peran, teks)
    try:
        with open(f"{BERKAS_RIWAYAT}.tmp", "w", encoding="utf-8") as f:
            _json.dump(riwayat, f, ensure_ascii=False)
        os.replace(f"{BERKAS_RIWAYAT}.tmp", BERKAS_RIWAYAT)
    except OSError:
        pass


def konteks_lampiran():
    """Cuplikan lampiran aktif untuk ditempel ke prompt, atau ''.

    Dibaca di sini (bukan di memo-lampirkan) supaya lampiran besar tidak
    menumpuk di RAM dua kali. Biner dan berkas >200 KB hanya dikirim namanya.
    """
    import json as _json
    try:
        with open(BERKAS_LAMPIRAN, encoding="utf-8") as f:
            lamp = _json.load(f)
    except (OSError, ValueError):
        return ""
    if not isinstance(lamp, dict) or not lamp.get("path"):
        return ""
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
    try:
        from lampiran_pola import BATAS_BYTE, bangun_konteks
    except ImportError:
        return ""
    isi = ""
    if lamp.get("jenis") == "teks":
        try:
            with open(lamp["path"], encoding="utf-8", errors="replace") as f:
                isi = f.read(BATAS_BYTE + 1)
        except OSError:
            isi = ""
    try:
        return bangun_konteks(lamp, isi)
    except Exception:  # noqa: BLE001
        return ""

# Perekaman lewat pw-record, bukan pustaka Python.
#
# sounddevice butuh pustaka C PortAudio yang tidak ikut dalam paket pip dan
# hanya bisa dipasang lewat apt — artinya sudo. pw-record sudah ada di sistem
# ini karena PipeWire, jadi tidak ada yang perlu dipasang sama sekali.
LAJU = 16000                 # whisper bekerja pada 16 kHz
BLOK = 1600                  # 100 ms per blok, dalam sampel
BYTE_PER_SAMPEL = 2          # s16le
AMBANG_SUARA = 0.012         # RMS di atas ini dianggap ada yang bicara
DIAM_SELESAI = 1.2           # berhenti merekam setelah sekian detik hening
TUNGGU_MULAI = 4.0           # menyerah kalau tidak ada suara sama sekali
MAKS_REKAM = 20.0            # batas atas, supaya tidak merekam selamanya

AKAR = pathlib.Path(__file__).resolve().parent
MEMO = str(AKAR / "memo")

ROBOT_DEST = "org.himisbah.Robot"
ROBOT_PATH = "/org/himisbah/Robot"


def set_ekspresi(nama, durasi_ms=0):
    try:
        subprocess.run(
            ["gdbus", "call", "--session", "--dest", ROBOT_DEST,
             "--object-path", ROBOT_PATH,
             "--method", f"{ROBOT_DEST}.SetExpression", nama, str(durasi_ms)],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=3)
    except Exception:                                        # noqa: BLE001
        pass


def ucapkan(teks, tunggu=True):
    try:
        proc = subprocess.Popen([MEMO, teks],
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if tunggu:
            proc.wait(timeout=60)
    except Exception as e:                                   # noqa: BLE001
        print(f"gagal bersuara: {e}", file=sys.stderr)


def tulis_status(teks):
    """Supaya popup bisa menampilkan Memo sedang di tahap apa."""
    try:
        with open(f"{BERKAS_STATUS}.tmp", "w", encoding="utf-8") as f:
            f.write(teks)
        os.replace(f"{BERKAS_STATUS}.tmp", BERKAS_STATUS)
    except OSError:
        pass


def tulis_level(nilai):
    try:
        with open(BERKAS_LEVEL, "w", encoding="utf-8") as f:
            f.write(f"{nilai:.4f}")
    except OSError:
        pass


def rekam_sampai_diam():
    """Merekam sampai hening. Mengembalikan float32 mono, atau None."""
    perekam = subprocess.Popen(
        ["pw-record", "--rate", str(LAJU), "--channels", "1",
         "--format", "s16", "-"],
        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)

    potongan = []
    mulai = time.monotonic()
    terakhir_bersuara = None
    pernah_bersuara = False
    jumlah_byte = BLOK * BYTE_PER_SAMPEL

    try:
        while True:
            mentah = perekam.stdout.read(jumlah_byte)
            if not mentah or len(mentah) < jumlah_byte:
                break

            contoh = np.frombuffer(mentah, dtype=np.int16).astype(np.float32) / 32768.0
            potongan.append(contoh)

            rms = float(np.sqrt(np.mean(contoh ** 2)))
            sekarang = time.monotonic()

            # Diskalakan ke 0..1 dengan akar: suara percakapan biasa berada di
            # RMS yang kecil, dan tanpa pelengkungan ini matanya nyaris tidak
            # bergerak kecuali kamu berteriak.
            tulis_level(min(1.0, (rms / 0.25) ** 0.5))

            if rms > AMBANG_SUARA:
                pernah_bersuara = True
                terakhir_bersuara = sekarang

            if not pernah_bersuara and sekarang - mulai > TUNGGU_MULAI:
                return None
            if pernah_bersuara and sekarang - terakhir_bersuara > DIAM_SELESAI:
                break
            if sekarang - mulai > MAKS_REKAM:
                break
    finally:
        tulis_level(0.0)
        perekam.terminate()
        try:
            perekam.wait(timeout=2)
        except subprocess.TimeoutExpired:
            perekam.kill()

    return np.concatenate(potongan) if potongan else None


def dengar(model):
    """Merekam lalu menuliskan apa yang terdengar. None kalau tidak ada."""
    set_ekspresi("mendengar", 0)
    tulis_status("mendengar")
    print("mendengarkan...", flush=True)

    suara = rekam_sampai_diam()
    if suara is None:
        print("tidak ada suara", flush=True)
        return None

    set_ekspresi("berpikir", 0)
    tulis_status("berpikir")

    segmen, _ = model.transcribe(suara, language="id", beam_size=1,
                                 vad_filter=True)
    teks = " ".join(s.text for s in segmen).strip()
    print(f"didengar: {teks!r}", flush=True)
    return teks or None


def satu_giliran(model, backend, tanpa_suara=False, pertanyaan=None):
    """Satu giliran tanya-jawab. `pertanyaan` diisi kalau datang dari ketikan;
    kalau None, Memo merekam dan mendengarkan."""
    if pertanyaan is None:
        pertanyaan = dengar(model)
        if pertanyaan is None:
            tulis_status("")
            set_ekspresi("bingung", 1500)
            return
    else:
        print(f"diketik: {pertanyaan!r}", flush=True)
        set_ekspresi("berpikir", 0)
        tulis_status("berpikir")

    tulis_status(f"tanya: {pertanyaan}")
    catat("kamu", pertanyaan)
    izin_klien.mulai(pertanyaan)
    # Diucapkan tanpa ditunggu, dari cache, supaya jeda AI tidak terasa mati.
    if not tanpa_suara:
        ucapkan("Sebentar ya", tunggu=False)

    if os.path.exists(BERKAS_BACKEND):
        try:
            with open(BERKAS_BACKEND) as f:
                b = f.read().strip()
                if b: backend = b
        except: pass

    say, command, dipakai, galat = tanya(
        pertanyaan if not (konteks := konteks_lampiran())
        else f"{pertanyaan}\n\n{konteks}",
        backend=backend)
    if galat:
        print(f"galat: {galat}", flush=True)
        tulis_status(f"galat: {galat}")
        catat("galat", galat)
        izin_klien.selesai(False)
        set_ekspresi("error", 2500)
        if not tanpa_suara:
            ucapkan("Maaf, saya tidak bisa menjawab sekarang")
        return

    print(f"[{dipakai}] jawab: {say}", flush=True)
    if command:
        print(f"[{dipakai}] command: {command}", flush=True)

    tulis_status(f"jawab: {say}")
    catat("memo", say)
    set_ekspresi("bicara", 0)
    if not tanpa_suara and say:
        ucapkan(say)
        
    # Perintah usulan AI tidak pernah jalan sendiri: harus diklik Izinkan di
    # kartu izin island (lewat memo-agen). Tanpa klik = tidak dijalankan.
    if command and not izin_klien.minta_izin(command):
        catat("info", f"Perintah tidak dijalankan: {command}")
        tulis_status("perintah dibatalkan")
        command = None
        if not tanpa_suara:
            ucapkan("Baik, perintahnya tidak saya jalankan.")

    if command:
        tulis_status(f"eksekusi: {command}")
        catat("info", f"Menjalankan: {command}")
        set_ekspresi("berpikir", 0)
        try:
            print(f"menjalankan: {command}", flush=True)
            hasil = subprocess.run(command, shell=True, capture_output=True, text=True, timeout=60)
            if hasil.stdout:
                print(f"output: {hasil.stdout}", flush=True)
            if hasil.stderr:
                print(f"error: {hasil.stderr}", flush=True)
            if not tanpa_suara:
                if hasil.returncode == 0:
                    ucapkan("Perintah berhasil.")
                else:
                    ucapkan("Perintah gagal.")
        except Exception as e:
            print(f"gagal eksekusi: {e}", flush=True)
            if not tanpa_suara:
                ucapkan("Gagal menjalankan perintah.")

    set_ekspresi("netral")
    tulis_status("")
    izin_klien.selesai(True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="base",
                        help="ukuran model whisper: tiny, base, small")
    parser.add_argument("--backend", default="otomatis")
    parser.add_argument("--tanpa-suara", action="store_true",
                        help="cetak saja, jangan bunyikan apa pun")
    parser.add_argument("--sekali", action="store_true",
                        help="jalankan satu giliran lalu keluar, untuk pengujian")
    args = parser.parse_args()

    from faster_whisper import WhisperModel
    print(f"memuat model whisper {args.model}...", flush=True)
    model = WhisperModel(args.model, device="cpu", compute_type="int8")
    print("siap. Klik tombol Ngobrol di popup Memo.", flush=True)

    if args.sekali:
        satu_giliran(model, args.backend, args.tanpa_suara)
        return 0

    try:
        while True:
            if os.path.exists(BERKAS_TEKS):
                try:
                    with open(BERKAS_TEKS, encoding="utf-8") as f:
                        teks = f.read().strip()
                    os.unlink(BERKAS_TEKS)
                except OSError:
                    teks = ""
                if teks:
                    satu_giliran(model, args.backend, args.tanpa_suara,
                                 pertanyaan=teks)
            elif os.path.exists(BERKAS_PICU) or os.path.exists(BERKAS_PICU_LAMA):
                for berkas in (BERKAS_PICU, BERKAS_PICU_LAMA):
                    try:
                        os.unlink(berkas)
                    except OSError:
                        pass
                satu_giliran(model, args.backend, args.tanpa_suara)
            time.sleep(0.2)
    except KeyboardInterrupt:
        pass
    finally:
        tulis_status("")
        for berkas in (BERKAS_PICU, BERKAS_PICU_LAMA, BERKAS_STATUS, BERKAS_LEVEL, BERKAS_TEKS):
            try:
                os.unlink(berkas)
            except OSError:
                pass

    return 0


if __name__ == "__main__":
    sys.exit(main())
