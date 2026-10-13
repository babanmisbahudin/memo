"""Memahami perintah "buka ..." untuk laptop: situs, aplikasi, folder, terminal.

Murni (tanpa D-Bus, tanpa proses); yang menjalankan ada di aksi_laptop.py.

Dua sumber aksi:
- pahami(teks): kalimat pengguna sendiri ("buka youtube", "buka terminal di
  folder memo", "putar lofi di youtube") dikenali tanpa AI, jadi instan dan
  langsung dijalankan — sama seperti pengguna mengklik peluncur.
- dari_ai(data): aksi usulan AI (field "aksi" di JSON jawaban) hanya
  divalidasi di sini; pemanggil tetap meminta klik di kartu izin.

Aksi = dict {"jenis", "target", "label"}:
  url       target https://...                 label "YouTube"
  aplikasi  target daftar kandidat (id .desktop, atau "?kata" untuk dicari)
  folder    target jalur absolut yang ada
  terminal  target jalur absolut folder kerja
  tidak_ketemu  label pesan untuk pengguna (mis. folder tidak ada)
"""

import os
import re
from urllib.parse import quote_plus, urlparse

SITUS = {
    "youtube": ("https://www.youtube.com", "YouTube"),
    "yt": ("https://www.youtube.com", "YouTube"),
    "yutub": ("https://www.youtube.com", "YouTube"),
    "google": ("https://www.google.com", "Google"),
    "gmail": ("https://mail.google.com", "Gmail"),
    "email": ("https://mail.google.com", "Gmail"),
    "surel": ("https://mail.google.com", "Gmail"),
    "google drive": ("https://drive.google.com", "Google Drive"),
    "drive": ("https://drive.google.com", "Google Drive"),
    "google maps": ("https://maps.google.com", "Google Maps"),
    "maps": ("https://maps.google.com", "Google Maps"),
    "peta": ("https://maps.google.com", "Google Maps"),
    "github": ("https://github.com", "GitHub"),
    "whatsapp": ("https://web.whatsapp.com", "WhatsApp Web"),
    "wa": ("https://web.whatsapp.com", "WhatsApp Web"),
    "chatgpt": ("https://chatgpt.com", "ChatGPT"),
    "claude": ("https://claude.ai", "Claude"),
    "instagram": ("https://www.instagram.com", "Instagram"),
    "ig": ("https://www.instagram.com", "Instagram"),
    "facebook": ("https://www.facebook.com", "Facebook"),
    "fb": ("https://www.facebook.com", "Facebook"),
    "tiktok": ("https://www.tiktok.com", "TikTok"),
    "twitter": ("https://x.com", "X"),
    "netflix": ("https://www.netflix.com", "Netflix"),
    "vercel": ("https://vercel.com/dashboard", "Vercel"),
    "render": ("https://dashboard.render.com", "Render"),
    "notion": ("https://www.notion.so", "Notion"),
    "lebihteratur": ("https://own.lebihteratur.com/admin", "LebihTeratur"),
    "lebih teratur": ("https://own.lebihteratur.com/admin", "LebihTeratur"),
}

# Kandidat .desktop berurutan; "?kata" = cari lewat pencarian aplikasi GNOME.
APLIKASI = {
    "terminal": (["org.gnome.Ptyxis.desktop", "org.gnome.Terminal.desktop", "?terminal"], "Terminal"),
    "konsol": (["org.gnome.Ptyxis.desktop", "org.gnome.Terminal.desktop", "?terminal"], "Terminal"),
    "console": (["org.gnome.Ptyxis.desktop", "org.gnome.Terminal.desktop", "?terminal"], "Terminal"),
    "file manager": (["org.gnome.Nautilus.desktop"], "Berkas"),
    "files": (["org.gnome.Nautilus.desktop"], "Berkas"),
    "berkas": (["org.gnome.Nautilus.desktop"], "Berkas"),
    "nautilus": (["org.gnome.Nautilus.desktop"], "Berkas"),
    "chrome": (["google-chrome.desktop", "com.google.Chrome.desktop", "?chrome"], "Chrome"),
    "google chrome": (["google-chrome.desktop", "com.google.Chrome.desktop", "?chrome"], "Chrome"),
    "browser": (["google-chrome.desktop", "firefox_firefox.desktop", "firefox.desktop", "?browser"], "browser"),
    "peramban": (["google-chrome.desktop", "firefox_firefox.desktop", "firefox.desktop", "?browser"], "browser"),
    "firefox": (["firefox_firefox.desktop", "firefox.desktop", "?firefox"], "Firefox"),
    "vscode": (["code.desktop", "com.microsoft.VSCode.desktop", "?visual studio code"], "VS Code"),
    "vs code": (["code.desktop", "com.microsoft.VSCode.desktop", "?visual studio code"], "VS Code"),
    "visual studio code": (["code.desktop", "com.microsoft.VSCode.desktop", "?visual studio code"], "VS Code"),
    "code": (["code.desktop", "com.microsoft.VSCode.desktop", "?visual studio code"], "VS Code"),
    "pengaturan": (["org.gnome.Settings.desktop"], "Pengaturan"),
    "setelan": (["org.gnome.Settings.desktop"], "Pengaturan"),
    "settings": (["org.gnome.Settings.desktop"], "Pengaturan"),
    "kalkulator": (["org.gnome.Calculator.desktop"], "Kalkulator"),
    "calculator": (["org.gnome.Calculator.desktop"], "Kalkulator"),
    "text editor": (["org.gnome.TextEditor.desktop"], "Editor Teks"),
    "editor teks": (["org.gnome.TextEditor.desktop"], "Editor Teks"),
    "notepad": (["org.gnome.TextEditor.desktop"], "Editor Teks"),
    "steam": (["steam.desktop", "?steam"], "Steam"),
}

# Nama folder umum -> kunci XDG (xdg-user-dir) atau jalur relatif home.
FOLDER = {
    "download": "DOWNLOAD", "downloads": "DOWNLOAD", "unduhan": "DOWNLOAD",
    "dokumen": "DOCUMENTS", "documents": "DOCUMENTS", "document": "DOCUMENTS",
    "gambar": "PICTURES", "foto": "PICTURES", "pictures": "PICTURES",
    "musik": "MUSIC", "music": "MUSIC", "lagu": "MUSIC",
    "video": "VIDEOS", "videos": "VIDEOS", "film": "VIDEOS",
    "desktop": "DESKTOP",
    "home": "", "rumah": "", "beranda": "", "~": "",
    "proyek": "Projects", "projects": "Projects", "project": "Projects", "projek": "Projects",
}
XDG_BAWAAN = {"DOWNLOAD": "Downloads", "DOCUMENTS": "Documents", "PICTURES": "Pictures",
              "MUSIC": "Music", "VIDEOS": "Videos", "DESKTOP": "Desktop"}

AWAL = {"memo", "tolong", "coba", "bisa", "please", "plis", "hai", "hei", "halo", "eh", "bantu", "mau", "aku", "saya"}
# "memo" sengaja tidak dibuang di akhir: "buka folder memo" adalah nama folder.
AKHIR = {"dong", "donk", "ya", "yah", "yuk", "sih", "deh", "please", "plis", "sekarang", "aja", "saja",
         "nggak", "gak", "ga", "enggak", "kah"}
KATA_BUKA = r"(?:buka|bukain|bukakan|bukaan|open|jalankan|jalanin|nyalakan|tampilkan)"
PENANDA_FOLDER = r"(?:folder|direktori|directory|map)"
PENANDA_APLIKASI = r"(?:aplikasi|app|apps|program)"
PENANDA_SITUS = r"(?:situs|website|web|laman|halaman|link)"
POLA_DOMAIN = re.compile(r"^(?:https?://)?([a-z0-9-]+(?:\.[a-z0-9-]+)*\.([a-z]{2,}))(/\S*)?$")
# "buka laporan.pdf" adalah berkas, bukan situs.
EKSTENSI_BERKAS = {"txt", "pdf", "md", "py", "js", "ts", "json", "png", "jpg", "jpeg", "gif", "svg", "doc",
                   "docx", "xls", "xlsx", "ppt", "pptx", "zip", "tar", "gz", "sh", "csv", "mp3", "mp4", "mkv"}


def _rapikan(teks):
    t = str(teks or "").lower()
    t = re.sub(r"[^\w\s./~:-]", " ", t)
    kata = t.split()
    while kata and kata[0] in AWAL:
        kata.pop(0)
    while kata and kata[-1] in AKHIR:
        kata.pop()
    # "ke youtube", "aja" di tengah tidak dibuang; cukup ujung kalimat.
    return " ".join(kata)


def xdg_dirs(home):
    """Isi ~/.config/user-dirs.dirs (XDG_DOWNLOAD_DIR="$HOME/Unduhan") -> dict."""
    hasil = {}
    try:
        with open(os.path.join(home, ".config", "user-dirs.dirs"), encoding="utf-8") as f:
            for baris in f:
                m = re.match(r'\s*XDG_([A-Z]+)_DIR="(.*)"', baris)
                if m:
                    hasil[m.group(1)] = m.group(2).replace("$HOME", home)
    except OSError:
        pass
    return hasil


def _dir_xdg(kunci, home, xdg):
    if kunci == "":
        return home
    if kunci in XDG_BAWAAN:
        return xdg.get(kunci) or os.path.join(home, XDG_BAWAAN[kunci])
    return os.path.join(home, kunci)


def _cocok_di(dasar, nama):
    """Subfolder `dasar` bernama `nama` (tanpa peduli huruf besar), atau None."""
    try:
        with os.scandir(dasar) as isi:
            for e in isi:
                if e.is_dir() and e.name.lower() == nama.lower():
                    return e.path
    except OSError:
        pass
    return None


def cari_folder(nama, home):
    """Jalur folder untuk nama ucapan ("unduhan", "proyek memo", "~/x"), atau None."""
    nama = nama.strip()
    if len(nama) > 1:
        nama = nama.rstrip("/")
    if not nama:
        return None
    xdg = xdg_dirs(home)
    if nama in FOLDER:
        p = _dir_xdg(FOLDER[nama], home, xdg)
        return p if os.path.isdir(p) else None
    if nama.startswith("~/") or nama.startswith("/"):
        # Kalimat sudah diubah ke huruf kecil: cocokkan tiap komponen tanpa
        # peduli huruf besar ("~/pictures" -> ~/Pictures).
        p = home if nama.startswith("~") else "/"
        for bagian in nama.lstrip("~").strip("/").split("/"):
            if bagian:
                p = _cocok_di(p, bagian)
                if not p:
                    return None
        return p if os.path.isdir(p) else None
    kata = nama.split()
    # "proyek memo" / "memo di proyek": cari di folder dasar itu dulu.
    dasar_dulu = []
    if len(kata) > 1 and kata[0] in FOLDER:
        dasar_dulu.append(_dir_xdg(FOLDER[kata[0]], home, xdg))
        kata = kata[1:]
    elif len(kata) > 2 and kata[-2] == "di" and kata[-1] in FOLDER:
        dasar_dulu.append(_dir_xdg(FOLDER[kata[-1]], home, xdg))
        kata = kata[:-2]
    sasaran = " ".join(kata)
    dasar = dasar_dulu + [home, os.path.join(home, "Projects")] + [
        _dir_xdg(k, home, xdg) for k in ("DOCUMENTS", "DESKTOP", "DOWNLOAD")]
    for d in dasar:
        for calon in (sasaran, sasaran.replace(" ", "-"), sasaran.replace(" ", "_"), sasaran.replace(" ", "")):
            p = _cocok_di(d, calon)
            if p:
                return p
    return None


def _situs(rest):
    if rest in SITUS:
        url, label = SITUS[rest]
        return {"jenis": "url", "target": url, "label": label}
    m = POLA_DOMAIN.match(rest)
    if m and m.group(2) not in EKSTENSI_BERKAS:
        url = rest if rest.startswith(("http://", "https://")) else f"https://{rest}"
        return {"jenis": "url", "target": url, "label": m.group(1)}
    return None


def _youtube(kueri):
    return {"jenis": "url", "target": f"https://www.youtube.com/results?search_query={quote_plus(kueri)}",
            "label": f"YouTube: {kueri}"}


def _google(kueri):
    return {"jenis": "url", "target": f"https://www.google.com/search?q={quote_plus(kueri)}",
            "label": f"Google: {kueri}"}


def _folder_atau_galat(nama, home):
    p = cari_folder(nama, home)
    if p:
        return {"jenis": "folder", "target": p, "label": os.path.basename(p) or p}
    return {"jenis": "tidak_ketemu", "target": None, "label": f"Folder {nama} tidak ketemu."}


def pahami(teks, home=None):
    """Aksi untuk kalimat pengguna, atau None bila bukan perintah membuka."""
    home = home or os.path.expanduser("~")
    t = _rapikan(teks)
    if not t:
        return None

    # Cari / putar di YouTube atau Google.
    m = re.match(r"^(?:cari(?:kan|in)?|putar(?:kan|in)?|puter(?:in)?|play|setel(?:in)?|tonton|nonton)\s+(.+?)\s+"
                 r"(?:di|lewat|pakai|ke)\s+(?:youtube|yt|yutub)$", t)
    if m:
        return _youtube(m.group(1))
    m = re.match(r"^(?:youtube|yt)\s+(.+)$", t) or re.match(rf"^{KATA_BUKA}\s+(?:youtube|yt|yutub)\s+(?:cari\s+)?(.+)$", t)
    if m:
        return _youtube(m.group(1))
    m = (re.match(r"^(?:cari(?:kan|in)?|search)\s+(.+?)\s+(?:di|lewat|pakai)\s+google$", t)
         or re.match(r"^(?:googling|googlein)\s+(.+)$", t))
    if m:
        return _google(m.group(1))

    m = re.match(rf"^{KATA_BUKA}\s+(.+)$", t)
    if not m:
        return None
    rest = m.group(1).strip()

    # Terminal di folder tertentu.
    m = re.match(rf"^(?:terminal|konsol|console)\s+(?:di|ke|pada)\s+(?:{PENANDA_FOLDER}\s+)?(.+)$", rest)
    if m:
        f = _folder_atau_galat(m.group(1), home)
        if f["jenis"] == "folder":
            return {"jenis": "terminal", "target": f["target"], "label": f"Terminal di {f['label']}"}
        return f

    m = re.match(rf"^{PENANDA_FOLDER}\s+(.+)$", rest)
    if m:
        return _folder_atau_galat(m.group(1), home)

    hint_aplikasi = re.match(rf"^{PENANDA_APLIKASI}\s+(.+)$", rest)
    if hint_aplikasi:
        rest = hint_aplikasi.group(1)
    m = re.match(rf"^{PENANDA_SITUS}\s+(.+)$", rest)
    if m:
        return _situs(m.group(1)) or _google(m.group(1))

    if rest in APLIKASI:
        kandidat, label = APLIKASI[rest]
        return {"jenis": "aplikasi", "target": list(kandidat), "label": label}
    if not hint_aplikasi:
        s = _situs(rest)
        if s:
            return s
        if rest in FOLDER:
            return _folder_atau_galat(rest, home)
    # Nama aplikasi lain (1-2 kata) dicari lewat pencarian aplikasi GNOME;
    # bila tidak ketemu, pemanggil menyerahkan kalimatnya ke AI.
    if len(rest.split()) <= 2 and re.fullmatch(r"[\w -]+", rest):
        return {"jenis": "aplikasi", "target": [f"?{rest}"], "label": rest}
    return None


def url_aman(url):
    """Hanya http(s) dengan host: tidak ada file://, javascript:, dsb."""
    try:
        u = urlparse(str(url))
    except ValueError:
        return False
    return u.scheme in ("http", "https") and bool(u.netloc) and " " not in str(url)


def dari_ai(data, home=None):
    """Validasi field "aksi" dari jawaban AI -> aksi, atau None bila tidak sah."""
    home = home or os.path.expanduser("~")
    if not isinstance(data, dict):
        return None
    jenis, target = data.get("jenis"), data.get("target")
    if not isinstance(target, str) or not target.strip():
        return None
    target = target.strip()
    if jenis == "url":
        return {"jenis": "url", "target": target, "label": urlparse(target).netloc} if url_aman(target) else None
    if jenis == "aplikasi":
        kunci = target.lower()
        if kunci in APLIKASI:
            kandidat, label = APLIKASI[kunci]
            return {"jenis": "aplikasi", "target": list(kandidat), "label": label}
        if re.fullmatch(r"[\w .-]{1,40}", target):
            return {"jenis": "aplikasi", "target": [f"?{target}"], "label": target}
        return None
    if jenis in ("folder", "terminal"):
        p = cari_folder(target, home)
        return {"jenis": jenis, "target": p, "label": os.path.basename(p) or p} if p else None
    return None


def uraian(aksi):
    """Teks satu baris untuk kartu izin / riwayat chat."""
    if aksi["jenis"] == "aplikasi":
        return f"buka aplikasi {aksi['label']}"
    if aksi["jenis"] == "terminal":
        return f"buka terminal di {aksi['target']}"
    return f"buka {aksi['target']}"
