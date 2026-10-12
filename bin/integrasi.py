"""Poller integrasi ala Coucou — logika + pengumpul ringan.

Coucou memberi tiap layanan (GitHub, Vercel, Stripe, ...) pill berwarna
sendiri. Di Memo, modul ini menyediakan:
  - bentuk pill layanan yang seragam,
  - pengumpul GitHub/git lokal yang hanya memakai CLI yang sudah ada,
  - pengumpul LebihTeratur/Vercel/Notion via HTTPS stdlib (tanpa
    dependensi baru), semuanya opsional dan gagal diam-diam.

Kunci dibaca berlapis: environ MEMO_<LAYANAN>_KEY dulu, lalu
~/.config/memo/integrasi.json (0600). Tanpa kunci, pill-nya tetap ada tapi
nonaktif dengan petunjuk pasang — privasi ala Coucou: tanpa akun, tanpa
telemetri, aplikasi hanya bicara ke layanan yang dipasang pengguna.
"""

import json
import os
import subprocess
import urllib.error
import urllib.parse
import urllib.request

import lebihteratur_pola

BERKAS_PILLS = "/dev/shm/memo-pills.json"

LAYANAN_BERKUNCI = ("lebihteratur", "vercel", "notion")
# Bukan rahasia, tapi disimpan di tempat yang sama.
KUNCI_TAMBAHAN = ("lebihteratur_url",)

PETUNJUK = "memo-integrasi.py --simpan {layanan} <kunci>"


def pill(id_pill, judul, sub="", aktif=False, angka=None):
    d = {"id": id_pill, "judul": judul, "sub": str(sub or "")[:120],
         "aktif": bool(aktif)}
    if angka is not None:
        d["angka"] = angka
    return d


def jalur_config():
    dasar = os.environ.get("XDG_CONFIG_HOME") or os.path.expanduser("~/.config")
    return os.path.join(dasar, "memo", "integrasi.json")


def muat_config(jalur=None):
    try:
        with open(jalur or jalur_config(), encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def simpan_kunci(layanan, kunci, jalur=None):
    """Simpan kunci ke config 0600. Mengembalikan True bila berhasil."""
    if layanan not in LAYANAN_BERKUNCI + KUNCI_TAMBAHAN or not kunci or not kunci.strip():
        return False
    tujuan = jalur or jalur_config()
    try:
        os.makedirs(os.path.dirname(tujuan), exist_ok=True)
        data = muat_config(tujuan)
        data[layanan] = kunci.strip()
        with open(f"{tujuan}.tmp", "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
        os.chmod(f"{tujuan}.tmp", 0o600)
        os.replace(f"{tujuan}.tmp", tujuan)
        return True
    except OSError:
        return False


def hapus_kunci(layanan, jalur=None):
    tujuan = jalur or jalur_config()
    try:
        data = muat_config(tujuan)
        data.pop(layanan, None)
        with open(f"{tujuan}.tmp", "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
        os.chmod(f"{tujuan}.tmp", 0o600)
        os.replace(f"{tujuan}.tmp", tujuan)
        return True
    except OSError:
        return False


def kunci(layanan):
    """Kunci untuk layanan, atau None bila belum dipasang."""
    if layanan not in LAYANAN_BERKUNCI:
        return None
    dari_env = os.environ.get(f"MEMO_{layanan.upper()}_KEY", "").strip()
    if dari_env:
        return dari_env
    dari_config = muat_config().get(layanan, "")
    return dari_config.strip() or None


def _jalan(cmd, timeout=8):
    try:
        hasil = subprocess.run(cmd, capture_output=True, text=True,
                               timeout=timeout)
        if hasil.returncode != 0:
            return ""
        return (hasil.stdout or "").strip()
    except Exception:  # noqa: BLE001
        return ""


def github_status():
    """PR terbuka + CI — memakai `gh` bila ada, kosong bila tidak."""
    if not _jalan(["which", "gh"]):
        return pill("github", "GitHub", "gh belum dipasang")
    pr = _jalan(["gh", "pr", "list", "--limit", "5",
                 "--json", "number,title,statusCheckRollup",
                 "--jq", ".[] | \"#\\(.number) \\(.title)\""])
    baris = [b for b in pr.splitlines() if b.strip()][:5]
    if not baris:
        return pill("github", "GitHub", "tidak ada PR terbuka", aktif=False)
    return pill("github", "GitHub", " | ".join(baris[:2]), aktif=True,
                angka=len(baris))


def git_lokal(path_proyek=""):
    """Perubahan git lokal: setara ticker +N -M di notch Coucou."""
    target = path_proyek or os.path.expanduser("~/Projects/memo")
    stat = _jalan(["git", "-C", target, "diff", "--shortstat"])
    if not stat:
        bersih = _jalan(["git", "-C", target, "status", "--porcelain"])
        n = len([b for b in bersih.splitlines() if b.strip()])
        return pill("github", "Git", "bersih" if not n else f"{n} berkas berubah",
                    aktif=bool(n), angka=n)
    return pill("github", "Git", stat, aktif=True)


def kumpulkan(path_proyek=""):
    pills = [github_status()]
    g = git_lokal(path_proyek)
    # Gabung info git lokal ke pill github bila gh tidak ada.
    if "belum dipasang" in pills[0]["sub"]:
        pills[0] = pill("github", "Git", g["sub"], g["aktif"], g.get("angka"))
    pills += [vercel_status(), notion_status()]
    return pills


# --- HTTP stdlib: satu gerbang, gagal diam-diam ----------------------------

BATAS_HTTP = 15


def _ambil(url, headers=None, data=None, metode="GET"):
    """GET/POST JSON, kembalikan dict/list, atau None bila apa pun gagal.

    Timeout pendek + semua galat ditelan: poller integrasi tidak boleh
    mematikan watcher atau membanjiri log saat jaringan putus.
    """
    try:
        req = urllib.request.Request(url, data=data,
                                     headers=headers or {},
                                     method=metode)
        with urllib.request.urlopen(req, timeout=BATAS_HTTP) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception:  # noqa: BLE001
        return None


# --- Vercel: deployment terakhir --------------------------------------------

def parse_vercel(data):
    """Daftar 'nama state' dari GET /v6/deployments."""
    hasil = []
    try:
        for d in (data.get("deployments") or [])[:3]:
            nama = str(d.get("name", "?"))[:40]
            state = str(d.get("state", "?")).upper()
            hasil.append({"nama": nama, "state": state})
    except (AttributeError, TypeError, ValueError):
        pass
    return hasil


def vercel_status():
    key = kunci("vercel")
    if not key:
        return pill("vercel", "Vercel", "belum ada kunci — " +
                    PETUNJUK.format(layanan="vercel"))
    h = {"Authorization": f"Bearer {key}"}
    data = _ambil("https://api.vercel.com/v6/deployments?limit=3", h)
    if data is None:
        return pill("vercel", "Vercel", "tak terjangkau")
    dep = parse_vercel(data)
    if not dep:
        return pill("vercel", "Vercel", "tidak ada deployment", aktif=False)
    utama = dep[0]
    ikon = {"READY": "●", "ERROR": "✖", "BUILDING": "◌"}.get(utama["state"], "○")
    return pill("vercel", "Vercel",
                f"{ikon} {utama['nama']} {utama['state']}",
                aktif=utama["state"] in ("READY", "BUILDING"),
                angka=len(dep))


# --- Notion: halaman yang baru diubah ---------------------------------------

def parse_notion(data):
    """Daftar judul dari POST /v1/search."""
    hasil = []
    try:
        for r in (data.get("results") or [])[:3]:
            props = (r.get("properties") or {})
            judul = "?"
            for v in props.values():
                if isinstance(v, dict) and v.get("type") == "title":
                    teks = "".join(t.get("plain_text", "")
                                   for t in v.get("title", []))
                    if teks.strip():
                        judul = teks.strip()[:50]
                        break
            if judul == "?" and r.get("object") == "database":
                t = r.get("title", [])
                teks = "".join(x.get("plain_text", "") for x in t)
                if teks.strip():
                    judul = teks.strip()[:50]
            hasil.append(judul)
    except (AttributeError, TypeError, ValueError):
        pass
    return hasil


def notion_status():
    key = kunci("notion")
    if not key:
        return pill("notion", "Notion", "belum ada kunci — " +
                    PETUNJUK.format(layanan="notion"))
    h = {"Authorization": f"Bearer {key}",
         "Notion-Version": "2022-06-28",
         "Content-Type": "application/json"}
    data = _ambil("https://api.notion.com/v1/search", h,
                  data=json.dumps({"page_size": 3,
                                   "sort": {"direction": "descending",
                                            "timestamp": "last_edited_time"}
                                   }).encode(), metode="POST")
    if data is None:
        return pill("notion", "Notion", "tak terjangkau")
    halaman = parse_notion(data)
    if not halaman:
        return pill("notion", "Notion", "tidak ada halaman", aktif=False)
    return pill("notion", "Notion", " | ".join(halaman[:2]), aktif=True,
                angka=len(halaman))


# --- LebihTeratur: kabar admin (vendor daftar, chat, pembayaran, ...) -------

def url_lebihteratur():
    dari_env = os.environ.get("MEMO_LEBIHTERATUR_URL", "").strip()
    dari_config = str(muat_config().get("lebihteratur_url", "")).strip()
    return (dari_env or dari_config or lebihteratur_pola.URL_BAWAAN).rstrip("/")


def ambil_kabar(sejak=""):
    """(daftar kabar, galat). `galat` teks pendek untuk pill, '' bila sukses.

    Tanpa `sejak` hanya 5 kabar terakhir diambil: dipakai sebagai titik awal
    tanpa membunyikan apa pun, supaya pemasangan pertama tidak membanjiri.
    """
    token = kunci("lebihteratur")
    if not token:
        return [], "belum ada token — memo-integrasi.py --buat-token"
    q = f"?sejak={urllib.parse.quote(sejak)}&batas=50" if sejak else "?batas=5"
    req = urllib.request.Request(
        f"{url_lebihteratur()}/api/kabar-admin{q}",
        headers={"Authorization": f"Bearer {token}", "User-Agent": "memo-asisten/1"})
    try:
        with urllib.request.urlopen(req, timeout=BATAS_HTTP) as resp:
            return lebihteratur_pola.parse_feed(json.loads(resp.read().decode("utf-8"))), ""
    except urllib.error.HTTPError as e:
        if e.code == 401:
            return [], "token ditolak server"
        if e.code == 404:
            return [], "server belum memasang KABAR_ADMIN_TOKEN"
        return [], f"server galat {e.code}"
    except Exception:  # noqa: BLE001
        return [], "tak terjangkau"


def tulis(pills):
    import time
    try:
        with open(f"{BERKAS_PILLS}.tmp", "w", encoding="utf-8") as f:
            json.dump({"pills": pills, "diperbarui": time.time()}, f,
                      ensure_ascii=False)
        os.replace(f"{BERKAS_PILLS}.tmp", BERKAS_PILLS)
    except OSError:
        pass
