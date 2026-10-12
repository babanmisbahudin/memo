"""Uji integrasi: kunci, parse Vercel/Notion — tanpa jaringan."""
import json
import os
import pathlib
import sys
import tempfile
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "bin"))
import integrasi
from integrasi import (hapus_kunci, kunci, muat_config, parse_notion,
                       parse_vercel, simpan_kunci)

gagal = lolos = 0
def cek(label, syarat):
    global gagal, lolos
    if syarat: lolos += 1
    else:
        gagal += 1
        print(f"GAGAL | {label}")

with tempfile.TemporaryDirectory() as d:
    cfg = os.path.join(d, "integrasi.json")
    cek("config kosong dict", muat_config(cfg) == {})
    cek("simpan ok", simpan_kunci("vercel", "tok_123", cfg) is True)
    cek("layanan asing ditolak", simpan_kunci("paypal", "x", cfg) is False)
    cek("kunci kosong ditolak", simpan_kunci("vercel", "  ", cfg) is False)
    cek("mode 0600", (os.stat(cfg).st_mode & 0o777) == 0o600)
    cek("terbaca lagi", muat_config(cfg).get("vercel") == "tok_123")
    cek("hapus ok", hapus_kunci("vercel", cfg) is True)
    cek("sudah hilang", muat_config(cfg).get("vercel") is None)

os.environ["MEMO_VERCEL_KEY"] = "env_abc"
cek("env menang", kunci("vercel") == "env_abc")
del os.environ["MEMO_VERCEL_KEY"]
os.environ["XDG_CONFIG_HOME"] = tempfile.mkdtemp()
cek("tanpa kunci None", kunci("vercel") is None)
cek("stripe sudah tidak dikenal", kunci("stripe") is None)
cek("layanan asing None", kunci("paypal") is None)

dep = parse_vercel({"deployments": [{"name": "toko", "state": "READY"},
                                    {"name": "blog", "state": "ERROR"}]})
cek("vercel dua", len(dep) == 2 and dep[0]["state"] == "READY")
cek("vercel rusak []", parse_vercel(None) == [])

notion = {"results": [
    {"properties": {"title": {"type": "title",
                              "title": [{"plain_text": "Catatan"}]}}},
    {"object": "database", "properties": {},
     "title": [{"plain_text": "DB Proyek"}]},
]}
cek("notion dua judul", parse_notion(notion) == ["Catatan", "DB Proyek"])
cek("notion rusak []", parse_notion({}) == [])

# Pill tanpa kunci: nonaktif + ada petunjuk, tanpa jaringan sama sekali.
for fn in (integrasi.vercel_status, integrasi.notion_status):
    p = fn()
    cek(f"{p['id']} nonaktif tanpa kunci",
        p["aktif"] is False and "memo-integrasi.py" in p["sub"])

print(f"\n{lolos} lolos, {gagal} gagal")
sys.exit(1 if gagal else 0)
