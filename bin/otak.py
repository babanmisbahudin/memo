"""Menghubungkan Memo ke AI yang terpasang.

Dua backend: opencode (disarankan — ingat obrolan lewat --continue, dan bisa
menempel ke server tetap sehingga tidak membayar ongkos start-up tiap giliran)
dan claude CLI sebagai cadangan.

Angka yang terukur di mesin ini:
  claude -p                        3-19 detik, 17.500 token, tanpa memori
  opencode run                     8,6 detik, 13.500 token, ada memori
  opencode --attach --continue     5,4 detik, ada memori

Fungsi tanya() murni soal proses: tidak menyentuh kamera, mikrofon, maupun
D-Bus, jadi bisa diuji sendiri.
"""

import json
import shutil
import subprocess

PORT_SERVER = 4096
ALAMAT_SERVER = f"http://localhost:{PORT_SERVER}"
BATAS_DETIK = 90

PROMPT = (
    "Kamu Memo, robot asisten desktop milik Baban. "
    "Keluarkan respons HANYA berupa satu objek JSON dengan format:\n"
    "{\n"
    '  "say": "Jawabanmu (bahasa Indonesia, ringkas, maksimal dua kalimat, tanpa markdown/emoji)",\n'
    '  "command": "Perintah CLI untuk menjalankan aksi (misal git, gh, vercel, render) jika ada, atau null jika hanya sekadar ngobrol"\n'
    "}\n"
    "Jangan tambahkan teks apa pun di luar JSON."
)


def backend_tersedia():
    ada = []
    if shutil.which("opencode"):
        ada.append("opencode")
    if shutil.which("claude"):
        ada.append("claude")
    ada.append('gemini')
    ada.append('ollama')
    return ada


def pilih_backend(diminta="otomatis"):
    ada = backend_tersedia()
    if diminta in ada:
        return diminta
    # "otomatis" memilih opencode lebih dulu: terukur paling cepat dan
    # satu-satunya yang mengingat obrolan sebelumnya.
    return ada[0] if ada else None


_sesi_cache = {"id": None, "waktu": 0.0}
UMUR_CACHE_SESI = 20.0       # detik


def sesi_terakhir(paksa=False):
    """ID sesi opencode yang paling baru dipakai, atau None.

    Hasilnya di-cache 20 detik: memanggil `opencode session list` makan 2,3
    detik, dan sesi yang sedang kamu pakai tidak berganti secepat itu.

    Dipakai supaya Memo menyambung ke obrolan yang sedang kamu kerjakan,
    bukan memulai dari nol. `opencode session list` sudah mengurutkan dari
    yang terbaru, jadi barisnya diambil dari atas.
    """
    import time as _t
    if not paksa and _t.monotonic() - _sesi_cache["waktu"] < UMUR_CACHE_SESI:
        return _sesi_cache["id"]

    try:
        hasil = subprocess.run(["opencode", "session", "list"],
                               capture_output=True, text=True, timeout=20)
    except Exception:                                        # noqa: BLE001
        return _sesi_cache["id"]

    ketemu = None
    for baris in hasil.stdout.splitlines():
        bagian = baris.split()
        if bagian and bagian[0].startswith("ses_"):
            ketemu = bagian[0]
            break

    _sesi_cache["id"] = ketemu
    _sesi_cache["waktu"] = _t.monotonic()
    return ketemu


def server_hidup():
    try:
        import urllib.request
        with urllib.request.urlopen(f"{ALAMAT_SERVER}/app", timeout=1.5):
            return True
    except Exception:                                        # noqa: BLE001
        return False


def _teks_dari_opencode(keluaran):
    """Mengambil jawaban dari aliran JSON opencode.

    Keluarannya satu objek JSON per baris; yang dicari bagian bertipe "text".
    Baris yang tidak bisa dibaca dilewati, bukan menggagalkan semuanya —
    format aliran bisa berubah antar versi dan satu baris asing tidak boleh
    membuat Memo bisu.
    """
    potongan = []
    for baris in keluaran.splitlines():
        baris = baris.strip()
        if not baris.startswith("{"):
            continue
        try:
            data = json.loads(baris)
        except json.JSONDecodeError:
            continue
        if data.get("type") == "text":
            teks = data.get("part", {}).get("text")
            if teks:
                potongan.append(teks)
    return "\n".join(potongan).strip()


def _tanya_opencode(pertanyaan, lanjutkan, ikut_sesi=True):
    # Tanpa --no-bash: flag itu tidak ada di opencode 1.18.23, dan memakainya
    # membuat perintah gagal lalu Memo melaporkan "menjawab kosong".
    argumen = ["opencode", "run", "--format", "json"]
    if server_hidup():
        argumen += ["--attach", ALAMAT_SERVER]

    sesi = sesi_terakhir() if ikut_sesi else None
    if sesi:
        # --fork penting: Memo ikut membaca konteks sesi kerjamu, tapi
        # jawabannya masuk ke salinan. Tanpa itu, prompt Memo dan pertanyaan
        # lisanmu akan menumpuk di riwayat sesi kerja yang sedang kamu pakai
        # dan mengubah cara agent menjawabmu setelahnya.
        argumen += ["--session", sesi, "--fork"]
    elif lanjutkan:
        argumen.append("--continue")

    argumen.append(f"{PROMPT}\n\nPertanyaan: {pertanyaan}")

    hasil = subprocess.run(argumen, capture_output=True, text=True,
                           timeout=BATAS_DETIK)
    if hasil.returncode != 0:
        pesan = (hasil.stderr or "").strip().splitlines()
        raise RuntimeError(f"opencode exit {hasil.returncode}: "
                           f"{pesan[-1] if pesan else 'tanpa pesan galat'}")
    return _teks_dari_opencode(hasil.stdout)


def _tanya_claude(pertanyaan, lanjutkan):
    argumen = ["claude", "-p", "--output-format", "json", "--model", "sonnet",
               "--append-system-prompt", PROMPT]
    if lanjutkan:
        argumen.append("--continue")
    argumen.append(pertanyaan)

    hasil = subprocess.run(argumen, capture_output=True, text=True,
                           timeout=BATAS_DETIK)
    try:
        return (json.loads(hasil.stdout).get("result") or "").strip()
    except json.JSONDecodeError:
        return ""


def _tanya_gemini(pertanyaan):
    import os, urllib.request
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        key_path = os.path.expanduser("~/.gemini-api-key")
        if os.path.exists(key_path):
            with open(key_path, "r") as f:
                api_key = f.read().strip()
                
    if not api_key:
        return '{"say": "Kunci API Gemini belum diatur. Buat file ~/.gemini-api-key berisi kunci Anda.", "command": null}'
        
    # Alias "-latest" selalu menunjuk Flash terbaru; versi bernomor dipensiunkan Google.
    model = os.environ.get("MEMO_GEMINI_MODEL", "gemini-flash-latest")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    payload = {
        "system_instruction": {
            "parts": [{"text": PROMPT}]
        },
        "contents": [
            {"role": "user", "parts": [{"text": pertanyaan}]}
        ],
        "generationConfig": {
            "responseMimeType": "application/json"
        }
    }
    
    req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"),
                                 headers={"Content-Type": "application/json", "x-goog-api-key": api_key})
    try:
        with urllib.request.urlopen(req, timeout=BATAS_DETIK) as response:
            res_data = json.loads(response.read().decode("utf-8"))
            return res_data["candidates"][0]["content"]["parts"][0]["text"]
    except Exception as e:
        return json.dumps({"say": f"Gagal menghubungi Gemini: {e}", "command": None}, ensure_ascii=False)

def _tanya_ollama(pertanyaan, model="llama3.1"):
    """Chat lokal via Ollama — setara 'local model' di Coucou.

    Server diharapkan di localhost:11434 (bawaan `ollama serve`). Model bisa
    diganti lewat environ OLLAMA_MODEL. Tanpa API key, tanpa telemetri.
    """
    import os
    import urllib.request
    model = os.environ.get("OLLAMA_MODEL", model)
    host = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
    payload = {
        "model": model,
        "stream": False,
        "messages": [
            {"role": "system", "content": PROMPT},
            {"role": "user", "content": pertanyaan},
        ],
        "format": "json",
    }
    req = urllib.request.Request(f"{host}/api/chat",
                                 data=json.dumps(payload).encode("utf-8"),
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=BATAS_DETIK) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return (data.get("message", {}).get("content") or "").strip()
    except Exception as e:
        return f'{{"say": "Ollama tidak terjangkau ({e}). Jalankan `ollama serve` dulu.", "command": null}}'


def tanya(pertanyaan, backend="otomatis", lanjutkan=True, ikut_sesi=True):

    """Mengembalikan (say, command, backend_terpakai, galat)."""
    pilihan = pilih_backend(backend)
    if not pilihan:
        return "", None, None, "tidak ada CLI AI yang terpasang"

    try:
        if pilihan == "gemini":
            jawab = _tanya_gemini(pertanyaan)
        elif pilihan == "ollama":
            jawab = _tanya_ollama(pertanyaan)
        elif pilihan == "opencode":
            jawab = _tanya_opencode(pertanyaan, lanjutkan, ikut_sesi)
            if not jawab and ikut_sesi:
                # Fork sesi yang besar (mis. sesi agent yang sedang berjalan
                # dan puluhan ribu token) kadang pulang kosong walau exit 0.
                # Coba sekali lagi dari sesi BARU (tanpa --continue dan tanpa
                # --session, supaya tidak menempel ke sesi besar itu lagi)
                # supaya Memo tidak bisu; kalau ini pun kosong, galat
                # dilaporkan seperti biasa.
                jawab = _tanya_opencode(pertanyaan, False, False)
        else:
            jawab = _tanya_claude(pertanyaan, lanjutkan)
    except subprocess.TimeoutExpired:
        return "", None, pilihan, f"{pilihan} tidak menjawab dalam {BATAS_DETIK} detik"
    except Exception as e:                                   # noqa: BLE001
        return "", None, pilihan, f"{pilihan} gagal: {e}"

    if not jawab:
        return "", None, pilihan, f"{pilihan} menjawab kosong"
        
    try:
        import re
        # Cari blok JSON jika dibungkus dengan markdown
        match = re.search(r'\{.*\}', jawab.strip(), re.DOTALL)
        if match:
            jawab_bersih = match.group(0)
        else:
            jawab_bersih = jawab.strip()
            
        data = json.loads(jawab_bersih)
        return data.get("say", ""), data.get("command"), pilihan, None
    except json.JSONDecodeError:
        return jawab, None, pilihan, None
