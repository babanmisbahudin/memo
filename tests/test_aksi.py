"""Uji Memo mengelola laptop: "buka youtube/terminal/folder" dan gerbang izin.

Tidak membuka apa pun sungguhan: proses (gdbus/gio) dan pemanggil
memo-suara dipalsukan.
"""
import importlib.util
import os
import pathlib
import sys
import tempfile
import types

BIN = pathlib.Path(__file__).resolve().parent.parent / "bin"
sys.path.insert(0, str(BIN))
import aksi_laptop  # noqa: E402
import aksi_pola  # noqa: E402

gagal = lolos = 0


def cek(label, syarat, info=""):
    global gagal, lolos
    if syarat:
        lolos += 1
    else:
        gagal += 1
        print(f"GAGAL | {label}  [{info}]")


with tempfile.TemporaryDirectory() as home:
    for d in ("Projects/memo", "Projects/lebihteratur-api", "Unduhan", "Documents/Kuliah", "Pictures"):
        os.makedirs(os.path.join(home, d))
    os.makedirs(os.path.join(home, ".config"))
    with open(os.path.join(home, ".config", "user-dirs.dirs"), "w") as f:
        f.write('XDG_DOWNLOAD_DIR="$HOME/Unduhan"\nXDG_DOCUMENTS_DIR="$HOME/Documents"\n')

    def p(teks):
        return aksi_pola.pahami(teks, home)

    # --- Situs -------------------------------------------------------------
    cek("buka youtube", p("buka youtube") == {"jenis": "url", "target": "https://www.youtube.com", "label": "YouTube"})
    cek("kata sopan & tanda baca dibuang", p("Memo, tolong bukain YouTube dong!") == p("buka youtube"))
    cek("putar ... di youtube -> pencarian",
        p("putar lagu sheila on 7 di youtube")["target"] == "https://www.youtube.com/results?search_query=lagu+sheila+on+7")
    cek("buka youtube <kueri> -> pencarian", "search_query=tutorial+flutter" in p("buka youtube tutorial flutter")["target"])
    cek("cari ... di google", p("cari resep rendang di google")["target"] == "https://www.google.com/search?q=resep+rendang")
    cek("domain apa adanya", p("buka github.com/anthropics")["target"] == "https://github.com/anthropics")
    cek("nama berkas bukan domain", p("buka laporan.pdf") is None)
    cek("buka gmail", p("buka gmail")["target"] == "https://mail.google.com")

    # --- Aplikasi ----------------------------------------------------------
    t = p("buka terminal")
    cek("buka terminal -> Ptyxis dulu", t["jenis"] == "aplikasi" and t["target"][0] == "org.gnome.Ptyxis.desktop")
    cek("buka aplikasi vs code", p("buka aplikasi vs code")["label"] == "VS Code")
    cek("aplikasi lain dicari", p("buka spotify") == {"jenis": "aplikasi", "target": ["?spotify"], "label": "spotify"})
    cek("kalimat panjang diserahkan ke AI", p("buka puasa jam berapa ya") is None)

    # --- Folder & terminal di folder ---------------------------------------
    cek("buka folder memo -> ~/Projects/memo", p("buka folder memo")["target"] == f"{home}/Projects/memo")
    cek("folder XDG ikut user-dirs (Unduhan)", p("buka downloads")["target"] == f"{home}/Unduhan")
    cek("folder unduhan", p("buka folder unduhan")["target"] == f"{home}/Unduhan")
    cek("huruf besar & spasi->tanda hubung", p("buka folder lebihteratur api")["target"] == f"{home}/Projects/lebihteratur-api")
    cek("proyek <nama>", p("buka folder proyek memo")["target"] == f"{home}/Projects/memo")
    cek("subfolder dokumen", p("buka folder kuliah")["target"] == f"{home}/Documents/Kuliah")
    cek("jalur ~/", p("buka folder ~/Pictures")["target"] == f"{home}/Pictures")
    cek("folder tidak ada -> pesan, bukan AI", p("buka folder rahasia")["jenis"] == "tidak_ketemu")
    t = p("buka terminal di folder memo")
    cek("terminal di folder", t == {"jenis": "terminal", "target": f"{home}/Projects/memo", "label": "Terminal di memo"})

    # --- Bukan perintah ----------------------------------------------------
    for teks in ("apa kabar", "jelaskan cara kerja git rebase", "", "   "):
        cek(f"bukan perintah: {teks!r}", p(teks) is None)

    # --- Aksi usulan AI divalidasi -----------------------------------------
    cek("AI: https diterima", aksi_pola.dari_ai({"jenis": "url", "target": "https://youtube.com/watch?v=x"}, home))
    for buruk in ("file:///etc/passwd", "javascript:alert(1)", "ftp://x.com", "https://", "https://a b.com"):
        cek(f"AI: url ditolak {buruk}", aksi_pola.dari_ai({"jenis": "url", "target": buruk}, home) is None)
    cek("AI: folder harus ada", aksi_pola.dari_ai({"jenis": "folder", "target": "~/tidak-ada"}, home) is None)
    cek("AI: folder ~/Projects/memo", aksi_pola.dari_ai({"jenis": "folder", "target": "~/Projects/memo"}, home)["target"]
        == f"{home}/Projects/memo")
    cek("AI: aplikasi dengan karakter aneh ditolak", aksi_pola.dari_ai({"jenis": "aplikasi", "target": "x; rm -rf ~"}, home) is None)
    cek("AI: jenis tak dikenal ditolak", aksi_pola.dari_ai({"jenis": "perintah", "target": "ls"}, home) is None)
    cek("AI: bukan dict ditolak", aksi_pola.dari_ai("buka youtube", home) is None)

# --- Pelaksana: extension dulu, cadangan bila metode belum ada --------------
class Hasil:
    def __init__(self, rc=0, out="", err=""):
        self.returncode, self.stdout, self.stderr = rc, out, err


def palsu(jawaban_dbus):
    catat = []

    def proses(argv, timeout=8):
        catat.append(argv)
        if argv[0] == "gdbus":
            return jawaban_dbus
        return Hasil()
    return proses, catat


proses, catat = palsu(Hasil(0, "(true, 'https://www.youtube.com')\n"))
ok, pesan = aksi_laptop.jalankan({"jenis": "url", "target": "https://www.youtube.com", "label": "YouTube"}, proses)
cek("lewat extension", ok and pesan == "Siap, YouTube dibuka." and len(catat) == 1, (ok, pesan, catat))
cek("argumen gdbus dikutip GVariant", catat[0][-2:] == ['"url"', '"https://www.youtube.com"'], catat)

proses, catat = palsu(Hasil(1, "", "GDBus.Error:org.freedesktop.DBus.Error.UnknownMethod"))
ok, pesan = aksi_laptop.jalankan({"jenis": "folder", "target": "/tmp", "label": "tmp"}, proses)
cek("extension lama -> cadangan gio open", ok and catat[-1] == ["gio", "open", "/tmp"], catat)

proses, catat = palsu(Hasil(0, "(false, '')\n"))
ok, pesan = aksi_laptop.jalankan({"jenis": "aplikasi", "target": ["?spotify"], "label": "spotify"}, proses)
cek("aplikasi tidak ketemu: tanpa cadangan", not ok and "tidak ketemu" in pesan and len(catat) == 1, (pesan, catat))

proses, catat = palsu(Hasil(0, "(true, 'Terminal')\n"))
ok, pesan = aksi_laptop.jalankan({"jenis": "aplikasi", "target": ["org.gnome.Ptyxis.desktop", "?terminal"],
                                  "label": "Terminal"}, proses)
cek("kandidat aplikasi dikirim per baris", catat[0][-1] == '"org.gnome.Ptyxis.desktop\\n?terminal"', catat)

proses, catat = palsu(Hasil(0, "(true, 'x')\n"))
ok, pesan = aksi_laptop.jalankan({"jenis": "url", "target": "file:///etc/passwd", "label": "x"}, proses)
cek("url tidak aman ditolak sebelum proses apa pun", not ok and catat == [], catat)

# --- memo-suara: perintah langsung tanpa AI; usulan AI lewat kartu izin -----
sys.modules.setdefault("numpy", types.ModuleType("numpy"))
spec = importlib.util.spec_from_file_location("memo_suara", BIN / "memo-suara.py")
ms = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ms)

jejak = {"tanya": 0, "izin": [], "jalan": []}
for nama in ("mulai", "langkah", "selesai"):
    setattr(ms.izin_klien, nama, lambda *a, **k: None)
ms.catat = ms.tulis_status = ms.set_ekspresi = ms.ucapkan = lambda *a, **k: None
ms.konteks_lampiran = lambda: None
izin_jawab = {"v": False}
ms.izin_klien.minta_izin = lambda perintah, **k: jejak["izin"].append(perintah) or izin_jawab["v"]
ms.aksi_laptop.jalankan = lambda aksi, **k: jejak["jalan"].append(aksi) or (True, "Siap.")
jawaban_ai = {"v": ("Halo!", None, "gemini", None, None)}


def tanya_palsu(*a, **k):
    jejak["tanya"] += 1
    return jawaban_ai["v"]


ms.tanya = tanya_palsu

ms.satu_giliran(None, "gemini", tanpa_suara=True, pertanyaan="buka youtube")
cek("buka youtube: tanpa AI, tanpa kartu izin, langsung jalan",
    jejak["tanya"] == 0 and jejak["izin"] == [] and jejak["jalan"][-1]["target"] == "https://www.youtube.com", jejak)

ms.satu_giliran(None, "gemini", tanpa_suara=True, pertanyaan="apa kabar memo")
cek("obrolan biasa ke AI", jejak["tanya"] == 1 and len(jejak["jalan"]) == 1, jejak)

jawaban_ai["v"] = ("Saya bukakan.", None, "gemini", None, {"jenis": "url", "target": "https://www.youtube.com/results?search_query=kucing"})
ms.satu_giliran(None, "gemini", tanpa_suara=True, pertanyaan="aku pengen nonton video kucing lucu")
cek("usulan AI: minta izin dulu, ditolak -> tidak dibuka",
    len(jejak["izin"]) == 1 and len(jejak["jalan"]) == 1, jejak)
izin_jawab["v"] = True
ms.satu_giliran(None, "gemini", tanpa_suara=True, pertanyaan="aku pengen nonton video kucing lucu")
cek("usulan AI: diizinkan -> dibuka", len(jejak["izin"]) == 2 and "kucing" in jejak["jalan"][-1]["target"], jejak)

jawaban_ai["v"] = ("Ini.", None, "gemini", None, {"jenis": "url", "target": "file:///etc/shadow"})
ms.satu_giliran(None, "gemini", tanpa_suara=True, pertanyaan="tunjukkan sesuatu")
cek("usulan AI tidak sah: tidak ditanyakan, tidak dibuka", len(jejak["izin"]) == 2 and len(jejak["jalan"]) == 2, jejak)

# Aplikasi tebakan yang tidak ketemu diserahkan ke AI.
ms.aksi_laptop.jalankan = lambda aksi, **k: jejak["jalan"].append(aksi) or (False, "tidak ketemu")
jawaban_ai["v"] = ("Buka puasa jam 18.00.", None, "gemini", None, None)
sebelum = jejak["tanya"]
ms.satu_giliran(None, "gemini", tanpa_suara=True, pertanyaan="buka puasa")
cek("tebakan aplikasi gagal -> ditanyakan ke AI", jejak["tanya"] == sebelum + 1, jejak)

print(f"\n{lolos} lolos, {gagal} gagal")
sys.exit(1 if gagal else 0)
