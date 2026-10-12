"""Uji kabar LebihTeratur: pola murni + klien HTTP terhadap server lokal."""
import http.server
import importlib.util
import json
import os
import pathlib
import sys
import tempfile
import threading

BIN = pathlib.Path(__file__).resolve().parent.parent / "bin"
sys.path.insert(0, str(BIN))
os.environ["XDG_CONFIG_HOME"] = tempfile.mkdtemp()
os.environ["XDG_STATE_HOME"] = tempfile.mkdtemp()
import integrasi  # noqa: E402
import lebihteratur_pola as lp  # noqa: E402

spec = importlib.util.spec_from_file_location("memo_integrasi", BIN / "memo-integrasi.py")
daemon = importlib.util.module_from_spec(spec)
spec.loader.exec_module(daemon)

gagal = lolos = 0


def cek(label, syarat):
    global gagal, lolos
    if syarat:
        lolos += 1
    else:
        gagal += 1
        print(f"GAGAL | {label}")


feed = {"success": True, "data": [
    {"id": "6a0000000000000000000001", "jenis": "system", "judul": "Vendor Baru Terdaftar",
     "pesan": "Vendor baru \"Dekor Indah\"", "url": "https://own.lebihteratur.com/vendors/1", "waktu": "2026-10-12T01:00:00Z"},
    {"id": "6a0000000000000000000002", "jenis": "penting", "judul": "Pembayaran otomatis masuk",
     "pesan": "Rp 199.000", "url": "javascript:alert(1)"},
    {"id": "", "judul": "tanpa id dibuang"},
    "sampah",
]}
k = lp.parse_feed(feed)
cek("parse membuang yang rusak", [x["id"][-1] for x in k] == ["1", "2"])
cek("parse rusak -> []", lp.parse_feed(None) == [] and lp.parse_feed({"data": "x"}) == [])
cek("lebih_baru menyaring", [x["id"][-1] for x in lp.lebih_baru(k, "6a0000000000000000000001")] == ["2"])
cek("lebih_baru tanpa titik", len(lp.lebih_baru(k, "")) == 2)
cek("pembayaran dikenali", lp.apakah_bayar(k[1]) and not lp.apakah_bayar(k[0]))
cek("bunyi bayar", lp.bunyi_untuk(k[1]) == "bayar")
cek("bunyi chat", lp.bunyi_untuk({"jenis": "chat", "judul": "Chat dari X"}) == "pesan")
cek("url javascript: ditolak", lp.url_aman(k[1]["url"]) == "")
cek("url https diterima", lp.url_aman(k[0]["url"]) == k[0]["url"])
st = lp.catat({}, k, "2026-10-12")
cek("catat: id terakhir", st["terakhir_id"] == "6a0000000000000000000002" and st["hari_ini"] == 2)
st2 = lp.catat(st, [], "2026-10-13")
cek("hari berganti: hitungan nol, riwayat tetap", st2["hari_ini"] == 0 and len(st2["riwayat"]) == 2)
p = lp.pill(st)
cek("pill memuat kabar terbaru dulu", p["kabar"][0]["judul"] == "Pembayaran otomatis masuk" and p["angka"] == 2)
cek("pill galat nonaktif", lp.pill(st, "tak terjangkau")["aktif"] is False)
cek("riwayat dibatasi", len(lp.catat({}, [dict(k[0], id=f"{i:024x}") for i in range(30)], "d")["riwayat"]) == lp.BATAS_RIWAYAT)

# --- klien HTTP terhadap server lokal --------------------------------------
TOKEN = "rahasia-uji-" + "x" * 30
kabar_server = [
    {"id": f"6a00000000000000000000{i:02d}", "jenis": "chat", "judul": f"Chat {i}", "pesan": "halo", "url": ""}
    for i in range(1, 4)
]
mode = {"kode": 200}
diminta = []


class Penangan(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        diminta.append(self.path)
        if mode["kode"] != 200:
            self.send_response(mode["kode"]); self.end_headers(); return
        if self.headers.get("Authorization") != f"Bearer {TOKEN}":
            self.send_response(401); self.end_headers(); return
        from urllib.parse import parse_qs, urlparse
        q = parse_qs(urlparse(self.path).query)
        sejak = q.get("sejak", [""])[0]
        isi = [x for x in kabar_server if x["id"] > sejak] if sejak else kabar_server[-int(q.get("batas", ["20"])[0]):]
        badan = json.dumps({"success": True, "data": isi}).encode()
        self.send_response(200); self.send_header("Content-Type", "application/json"); self.end_headers()
        self.wfile.write(badan)


srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Penangan)
threading.Thread(target=srv.serve_forever, daemon=True).start()
os.environ["MEMO_LEBIHTERATUR_URL"] = f"http://127.0.0.1:{srv.server_address[1]}"

daftar, galat = integrasi.ambil_kabar()
cek("tanpa token: tanpa request", galat.startswith("belum ada token") and diminta == [])
os.environ["MEMO_LEBIHTERATUR_KEY"] = "salah"
cek("token salah -> pesan jelas", integrasi.ambil_kabar()[1] == "token ditolak server")
os.environ["MEMO_LEBIHTERATUR_KEY"] = TOKEN
mode["kode"] = 404
cek("server belum aktif -> pesan jelas", "KABAR_ADMIN_TOKEN" in integrasi.ambil_kabar()[1])
mode["kode"] = 200

dikabarkan = []
daemon.kabarkan = lambda kb: dikabarkan.append(kb["judul"])
keadaan, p = daemon.periksa_kabar({})
cek("pemasangan pertama: tidak ada notifikasi", dikabarkan == [])
cek("pemasangan pertama: titik awal dicatat", keadaan["terakhir_id"] == kabar_server[-1]["id"] and keadaan["hari_ini"] == 0)
cek("pemasangan pertama: pill tersambung", p["aktif"] is True)
kabar_server.append({"id": "6a0000000000000000000010", "jenis": "penting",
                     "judul": "Pembayaran otomatis masuk", "pesan": "Rp 99.000", "url": ""})
keadaan, p = daemon.periksa_kabar(keadaan)
cek("kabar baru -> tepat satu notifikasi", dikabarkan == ["Pembayaran otomatis masuk"])
cek("sejak dikirim ke server", "sejak=6a0000000000000000000003" in diminta[-1])
keadaan, p = daemon.periksa_kabar(keadaan)
cek("tidak ada yang baru -> tidak ada notifikasi ulang", dikabarkan == ["Pembayaran otomatis masuk"])
cek("pill menghitung kabar hari ini", p["angka"] == 1 and "Pembayaran" in p["sub"])
srv.shutdown()
srv.server_close()
keadaan2, p = daemon.periksa_kabar(keadaan)
cek("server mati: pill tak terjangkau, keadaan tetap", p["sub"] == "tak terjangkau" and keadaan2["terakhir_id"] == keadaan["terakhir_id"])

print(f"\n{lolos} lolos, {gagal} gagal")
sys.exit(1 if gagal else 0)
