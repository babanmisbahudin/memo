#!/usr/bin/env python3
"""Daemon sesi agen ala Coucou untuk Memo.

  agen --hook--> memo-hook.py --soket $XDG_RUNTIME_DIR/memo-agen.sock--> memo-agen.py
  memo-agen.py --> /dev/shm/memo-agen.json --> extension (agenStore.js)
  klik Izinkan/Tolak --> /dev/shm/memo-agen.keputusan.json --> memo-agen.py
                     --> jawaban lewat soket --> memo-hook.py --> agen

Satu proses, satu thread (selectors). Koneksi PermissionRequest dibiarkan
terbuka sampai pengguna mengklik, hook menyerah (110 detik), atau alatnya
ternyata sudah jalan karena dijawab di terminal.

  memo-agen.py            jalan sebagai daemon (memo-agen.service)
  memo-agen.py --demo     isi island dengan sesi contoh selama 60 detik
"""

import argparse
import json
import os
import pathlib
import selectors
import socket
import subprocess
import sys
import time

AKAR = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AKAR))
import agen_pola  # noqa: E402
import hook_pola  # noqa: E402

SHM = os.environ.get("MEMO_SHM", "/dev/shm")
BERKAS_KELUARAN = os.path.join(SHM, "memo-agen.json")
BERKAS_KEPUTUSAN = os.path.join(SHM, "memo-agen.keputusan.json")
BERKAS_DEMO = os.path.join(SHM, "memo-demo.aktif")
DETIK_DEMO = 60

BATAS_BARIS = 1 << 20
DETAK = 0.25
DETAK_TULIS = 5.0

ROBOT_DEST = "org.himisbah.Robot"
ROBOT_PATH = "/org/himisbah/Robot"

# Untuk uji: tanpa D-Bus wajah dan tanpa bunyi, atau tanpa bunyi saja.
TANPA_EFEK = bool(os.environ.get("MEMO_TANPA_EFEK"))
TANPA_BUNYI = TANPA_EFEK or bool(os.environ.get("MEMO_TANPA_BUNYI"))


def set_ekspresi(nama, durasi_ms=0):
    if TANPA_EFEK:
        return
    try:
        subprocess.Popen(
            ["gdbus", "call", "--session", "--dest", ROBOT_DEST,
             "--object-path", ROBOT_PATH,
             "--method", f"{ROBOT_DEST}.SetExpression", nama, str(durasi_ms)],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except OSError:
        pass


def bunyikan(event):
    if TANPA_BUNYI:
        return
    try:
        subprocess.Popen([sys.executable, str(AKAR / "memo-bunyi.py"), event],
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except OSError:
        pass


def tulis_atomik(path, data):
    try:
        with open(f"{path}.tmp", "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
        os.replace(f"{path}.tmp", path)
    except OSError:
        pass


def sidik(masukan):
    try:
        return json.dumps(masukan, sort_keys=True, ensure_ascii=False)
    except (TypeError, ValueError):
        return ""


def kunci_selalu(sid, alat, perintah):
    """'Selalu' untuk Bash terikat ke perintah persisnya, alat lain ke namanya."""
    return (sid, alat, perintah if alat == "Bash" else "")


def sesi_demo(sekarang):
    reg = {}
    for ev, label, jenis in [
        ({"hook_event_name": "UserPromptSubmit", "session_id": "demo-1",
          "cwd": "/home/demo/toko", "prompt": "Tambahkan pill Midtrans"}, "", ""),
        ({"hook_event_name": "PreToolUse", "session_id": "demo-1", "tool_name": "Read"},
         "Read integrasi.py", "baca"),
        ({"hook_event_name": "PostToolUse", "session_id": "demo-1", "tool_name": "Edit",
          "memo_diff": {"berkas": "integrasi.py", "tambah": 42, "kurang": 7}}, "", ""),
        ({"hook_event_name": "PreToolUse", "session_id": "demo-1", "tool_name": "Edit"},
         "Edit integrasi.py", "edit"),
        ({"hook_event_name": "UserPromptSubmit", "session_id": "demo-2",
          "cwd": "/home/demo/blog", "memo_agen": "opencode", "prompt": "Perbaiki hook"}, "", ""),
    ]:
        agen_pola.terapkan(reg, ev, sekarang, label, jenis)
    s2 = reg["demo-2"]
    agen_pola.minta_izin(s2, "Bash: pytest tests/ -q", "pytest tests/ -q", "demo-izin", "Bash")
    izin = [{"id": "demo-izin", "sesi": "demo-2", "agen": s2["agen"], "proyek": s2["proyek"],
             "alat": "Bash", "aksi": "Bash: pytest tests/ -q", "perintah": "pytest tests/ -q",
             "sejak": sekarang, "demo": True}]
    return list(reg.values()), izin


class Daemon:
    def __init__(self, jalur_soket):
        self.jalur = jalur_soket
        self.sel = selectors.DefaultSelector()
        self.registri = {}
        self.tertunda = {}          # id izin -> {conn, sid, alat, perintah, sejak}
        self.selalu = set()
        self.nomor = 0
        self.kotor = True
        self.terakhir_tulis = 0.0
        self.ekspresi = None
        self.terakhir_finish = 0.0

    # --- soket -----------------------------------------------------------
    def buka(self):
        if os.path.exists(self.jalur):
            uji = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            try:
                uji.connect(self.jalur)
                uji.close()
                raise SystemExit(f"memo-agen sudah jalan di {self.jalur}")
            except OSError:
                os.unlink(self.jalur)
        lama = os.umask(0o177)
        try:
            srv = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            srv.bind(self.jalur)
        finally:
            os.umask(lama)
        srv.listen(32)
        srv.setblocking(False)
        self.sel.register(srv, selectors.EVENT_READ, ("terima", None))
        self.srv = srv

    def _terima(self):
        try:
            conn, _ = self.srv.accept()
        except OSError:
            return
        conn.setblocking(False)
        self.sel.register(conn, selectors.EVENT_READ, ("baca", {"buf": b"", "sejak": time.monotonic()}))

    def _tutup(self, conn):
        try:
            self.sel.unregister(conn)
        except (KeyError, ValueError):
            pass
        conn.close()

    def _baca(self, conn, st):
        try:
            data = conn.recv(65536)
        except BlockingIOError:
            return
        except OSError:
            data = b""
        izin_id = st.get("izin")
        if izin_id:
            # Hook yang menunggu tidak pernah mengirim lagi: data kosong
            # berarti ia menyerah atau dibunuh (dijawab di terminal).
            if not data:
                self._lepas_izin(izin_id)
            return
        if not data:
            self._tutup(conn)
            return
        st["buf"] += data
        if b"\n" not in st["buf"] and len(st["buf"]) < BATAS_BARIS:
            return
        baris = st["buf"].split(b"\n", 1)[0]
        try:
            ev = json.loads(baris.decode("utf-8", "replace"))
        except ValueError:
            ev = None
        if not isinstance(ev, dict):
            self._tutup(conn)
            return
        if not self.terima_event(ev, conn, st):
            self._tutup(conn)

    # --- event -----------------------------------------------------------
    def terima_event(self, ev, conn=None, st=None, sekarang=None):
        """Terapkan satu event. True bila koneksi ditahan untuk izin."""
        sekarang = time.time() if sekarang is None else sekarang
        nama = ev.get("hook_event_name", "")
        alat = ev.get("tool_name", "")
        masukan = ev.get("tool_input")
        label = hook_pola.label_alat(alat, masukan)
        lama = self.registri.get(str(ev.get("session_id") or "tanpa-id"), {}).get("status")
        s = agen_pola.terapkan(self.registri, ev, sekarang, label, hook_pola.jenis_langkah(alat))
        self.kotor = True

        if s is None:
            for iid, t in list(self.tertunda.items()):
                if t["sid"] == str(ev.get("session_id")):
                    self._lepas_izin(iid)
            return False

        if nama in ("PostToolUse", "PostToolUseFailure"):
            # Alat yang diminta izinnya sudah jalan -> dijawab di terminal.
            # Dicocokkan per alat+masukan karena alat lain bisa jalan paralel.
            for iid, t in list(self.tertunda.items()):
                if t["sid"] == s["id"] and t["alat"] == alat and t["sidik"] == sidik(masukan):
                    self._lepas_izin(iid)
        elif nama in ("Stop", "StopFailure", "UserPromptSubmit"):
            for iid, t in list(self.tertunda.items()):
                if t["sid"] == s["id"]:
                    self._lepas_izin(iid)

        if nama == "Stop" and lama in ("kerja", "berpikir", "butuh_izin", "tanya"):
            if sekarang - self.terakhir_finish > 3:
                bunyikan("finish")
                self.terakhir_finish = sekarang
        elif nama == "StopFailure":
            bunyikan("error")
        elif nama == "PreToolUse" and alat == "AskUserQuestion":
            bunyikan("approval")

        if nama != "PermissionRequest" or not hook_pola.harus_menunggu(ev) or conn is None:
            return False

        perintah = hook_pola.detail_izin(alat, masukan)
        kunci = kunci_selalu(s["id"], alat, perintah)
        if kunci in self.selalu:
            self._kirim(conn, "allow")
            agen_pola.tambah_langkah(s, f"diizinkan otomatis (Selalu): {label}", "info")
            s["status"] = "kerja"
            return False

        self.nomor += 1
        iid = f"{s['id'][:8]}-{self.nomor}"
        agen_pola.minta_izin(s, label, perintah, iid, alat)
        self.tertunda[iid] = {"conn": conn, "sid": s["id"], "alat": alat, "perintah": perintah,
                              "aksi": label, "sidik": sidik(masukan), "sejak": sekarang}
        st["izin"] = iid
        bunyikan("approval")
        return True

    def _kirim(self, conn, keputusan):
        try:
            conn.setblocking(True)
            conn.settimeout(1.0)
            conn.sendall((keputusan + "\n").encode())
        except OSError:
            pass

    def _lepas_izin(self, iid, keputusan=None):
        t = self.tertunda.pop(iid, None)
        if not t:
            return False
        if keputusan:
            self._kirim(t["conn"], keputusan)
        self._tutup(t["conn"])
        s = self.registri.get(t["sid"])
        if s and keputusan:
            kata = {"allow": "diizinkan", "always": "selalu diizinkan", "deny": "ditolak"}[keputusan]
            agen_pola.tambah_langkah(s, f"{kata} dari Memo: {t['aksi']}", "info")
        if s and (s.get("butuh_izin") or {}).get("id") == iid:
            if keputusan:
                agen_pola.jawab_izin(s, keputusan)
            else:
                s["butuh_izin"] = None
                s["status"] = "kerja"
            # Izin lain dari sesi yang sama yang masih menunggu naik ke kartu.
            for iid2, t2 in self.tertunda.items():
                if t2["sid"] == s["id"]:
                    agen_pola.minta_izin(s, t2["aksi"], t2["perintah"], iid2, t2["alat"])
                    break
        self.kotor = True
        return True

    def jawab(self, iid, keputusan):
        """Keputusan dari island. False bila izinnya sudah tidak menunggu."""
        if keputusan not in agen_pola.JENIS_KEPUTUSAN:
            return False
        t = self.tertunda.get(iid)
        if not t:
            return False
        if keputusan == "always":
            self.selalu.add(kunci_selalu(t["sid"], t["alat"], t["perintah"]))
        return self._lepas_izin(iid, keputusan)

    def _cek_keputusan(self):
        try:
            with open(BERKAS_KEPUTUSAN, encoding="utf-8") as f:
                kep = json.load(f)
            os.unlink(BERKAS_KEPUTUSAN)
        except (OSError, ValueError):
            return
        if isinstance(kep, dict):
            if str(kep.get("id", "")).startswith("demo"):
                try:
                    os.unlink(BERKAS_DEMO)
                except OSError:
                    pass
                self.kotor = True
                return
            self.jawab(str(kep.get("id", "")), str(kep.get("keputusan", "")))

    # --- keluaran --------------------------------------------------------
    def keadaan(self, sekarang):
        demo = os.path.exists(BERKAS_DEMO)
        if demo:
            try:
                if sekarang - os.path.getmtime(BERKAS_DEMO) > DETIK_DEMO:
                    os.unlink(BERKAS_DEMO)
                    demo = False
            except OSError:
                demo = False
        if demo:
            sesi, izin = sesi_demo(sekarang)
        else:
            sesi = list(self.registri.values())
            izin = []
            for iid, t in sorted(self.tertunda.items(), key=lambda kv: kv[1]["sejak"]):
                s = self.registri.get(t["sid"], {})
                bi = s.get("butuh_izin") or {}
                izin.append({"id": iid, "sesi": t["sid"], "agen": s.get("agen", "?"),
                             "proyek": s.get("proyek", ""), "alat": t["alat"],
                             "aksi": bi.get("aksi", t["alat"]), "perintah": t["perintah"],
                             "sejak": t["sejak"]})
        return {"sesi": agen_pola.sesi_terbaru_dulu(sesi), "izin": izin,
                "diperbarui": sekarang, "demo": demo, "pid": os.getpid()}

    def detak(self, sekarang=None):
        sekarang = time.time() if sekarang is None else sekarang
        self._cek_keputusan()
        jumlah = len(self.registri)
        status_lama = {k: v["status"] for k, v in self.registri.items()}
        agen_pola.rapikan(self.registri, sekarang)
        if jumlah != len(self.registri) or status_lama != {k: v["status"] for k, v in self.registri.items()}:
            self.kotor = True
        if self.kotor or sekarang - self.terakhir_tulis >= DETAK_TULIS or os.path.exists(BERKAS_DEMO):
            data = self.keadaan(sekarang)
            tulis_atomik(BERKAS_KELUARAN, data)
            self.terakhir_tulis = sekarang
            self.kotor = False
            eks = agen_pola.ekspresi_untuk(data["sesi"])
            if eks != self.ekspresi:
                set_ekspresi(eks, 3000 if eks in ("senang", "error") else 0)
                self.ekspresi = eks

    def jalan(self):
        self.buka()
        bunyikan("sapa")
        try:
            while True:
                for kunci, _ in self.sel.select(timeout=DETAK):
                    jenis, st = kunci.data
                    if jenis == "terima":
                        self._terima()
                    else:
                        self._baca(kunci.fileobj, st)
                self.detak()
        finally:
            for iid in list(self.tertunda):
                self._lepas_izin(iid)
            try:
                os.unlink(self.jalur)
            except OSError:
                pass
            tulis_atomik(BERKAS_KELUARAN, {"sesi": [], "izin": [], "diperbarui": time.time(),
                                           "demo": False, "mati": True})


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--demo", action="store_true", help="tampilkan sesi contoh 60 detik")
    args = ap.parse_args(argv)
    if args.demo:
        with open(BERKAS_DEMO, "w", encoding="utf-8") as f:
            f.write("1")
        print(f"demo aktif {DETIK_DEMO} detik (memo-agen harus sedang jalan)")
        return 0
    import signal
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
    try:
        Daemon(hook_pola.jalur_soket()).jalan()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
