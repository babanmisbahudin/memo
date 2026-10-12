"""Model sesi agen + antrean izin ala Coucou, murni tanpa I/O.

Coucou menampilkan tiap sesi agen coding (Claude Code, Codex, Gemini,
OpenCode, ...) sebagai pill hidup: apa yang dibaca, diedit (+N -M),
dijalankan, plus kartu Allow/Deny saat agen minta izin. Modul ini memegang
bentuk datanya dan aturan perpindahan statusnya; memo-agen.py yang memberi
makan event hook, extension (agenStore.js) yang menggambarnya.

Sengaja murni supaya bisa diuji dengan python biasa.
"""

import os

AGEN_DIDUKUNG = (
    "claude", "claude-desktop", "codex", "cursor", "gemini", "opencode",
    "copilot", "amp", "antigravity", "muse", "hermes", "memo",
)

STATUS_SAH = ("idle", "berpikir", "kerja", "butuh_izin", "tanya", "selesai", "galat")

JENIS_KEPUTUSAN = ("allow", "deny", "always")

BATAS_LANGKAH = 20
BATAS_BERKAS = 30

# Coucou: "Stop -> finished for 5 s", lalu kembali diam.
DETIK_SELESAI = 5.0
# Sesi kerja tanpa kabar selama ini dianggap ditinggal (Ctrl+C tanpa Stop).
DETIK_BASI_KERJA = 10 * 60
# Sesi diam tanpa kabar selama ini dibuang dari daftar.
DETIK_BUANG = 30 * 60


def sesi_baru(nama_agen, id_sesi, proyek="", prompt="", sekarang=0.0):
    agen = nama_agen if nama_agen in AGEN_DIDUKUNG else "lainnya"
    return {
        "agen": agen,
        "id": str(id_sesi),
        "proyek": str(proyek or ""),
        "cwd": "",
        "prompt": str(prompt or "")[:500],
        "status": "idle",
        "langkah": [],
        "file_diubah": [],
        "tambah": 0,
        "kurang": 0,
        "butuh_izin": None,
        "pesan": "",
        "mulai": sekarang,
        "diperbarui": sekarang,
        "selesai_pada": None,
    }


def tambah_langkah(sesi, ringkasan, jenis="baca"):
    sesi.setdefault("langkah", []).append({
        "jenis": jenis if jenis in ("baca", "edit", "jalan", "tanya", "info") else "baca",
        "ringkasan": str(ringkasan)[:300],
    })
    del sesi["langkah"][:-BATAS_LANGKAH]
    return sesi


def _angka(nilai):
    try:
        return max(0, int(nilai))
    except (TypeError, ValueError):
        return 0


def catat_edit(sesi, berkas, tambah=0, kurang=0):
    """Satu berkas diubah. Berkas yang sama dijumlahkan, bukan diduplikasi."""
    tambah, kurang = _angka(tambah), _angka(kurang)
    daftar = sesi.setdefault("file_diubah", [])
    berkas = str(berkas)[:200]
    for f in daftar:
        if f["berkas"] == berkas:
            f["tambah"] += tambah
            f["kurang"] += kurang
            daftar.remove(f)
            daftar.append(f)
            break
    else:
        daftar.append({"berkas": berkas, "tambah": tambah, "kurang": kurang})
        del daftar[:-BATAS_BERKAS]
    sesi["tambah"] = _angka(sesi.get("tambah")) + tambah
    sesi["kurang"] = _angka(sesi.get("kurang")) + kurang
    return sesi


def minta_izin(sesi, aksi, perintah="", id_permintaan="", alat=""):
    sesi["status"] = "butuh_izin"
    sesi["butuh_izin"] = {
        "id": str(id_permintaan or sesi["id"]),
        "alat": str(alat or ""),
        "aksi": str(aksi)[:300],
        "perintah": str(perintah or "")[:1000],
    }
    return sesi


def jawab_izin(sesi, keputusan):
    """Menerapkan keputusan ke sesi. False bila tidak sah."""
    if keputusan not in JENIS_KEPUTUSAN or not sesi.get("butuh_izin"):
        return False
    sesi["butuh_izin"] = None
    sesi["status"] = "kerja" if keputusan in ("allow", "always") else "berpikir"
    return True


def tandai_selesai(sesi, berhasil=True, sekarang=0.0):
    sesi["status"] = "selesai" if berhasil else "galat"
    sesi["butuh_izin"] = None
    sesi["selesai_pada"] = sekarang
    return sesi


def terapkan(registri, ev, sekarang, label="", jenis="baca"):
    """Satu event hook (sudah dinormalkan) -> registri {id: sesi}.

    `label`/`jenis` adalah ringkasan alat yang sudah dihitung pemanggil
    (hook_pola.label_alat), supaya modul ini tidak bergantung padanya.
    Mengembalikan sesi yang tersentuh, atau None bila sesinya dibuang.
    """
    nama = ev.get("hook_event_name", "")
    sid = str(ev.get("session_id") or "tanpa-id")
    agen = ev.get("memo_agen") or "claude"
    cwd = str(ev.get("cwd") or "")

    if nama == "SessionEnd":
        registri.pop(sid, None)
        return None

    s = registri.get(sid)
    if s is None:
        s = sesi_baru(agen, sid, os.path.basename(cwd.rstrip("/")), sekarang=sekarang)
        registri[sid] = s
    if cwd:
        s["cwd"] = cwd
        s["proyek"] = os.path.basename(cwd.rstrip("/")) or cwd
    s["diperbarui"] = sekarang

    alat = ev.get("tool_name", "")
    if nama == "SessionStart":
        s["status"] = "idle"
    elif nama == "UserPromptSubmit":
        s["prompt"] = str(ev.get("prompt") or "")[:500]
        s["status"] = "berpikir"
        s["butuh_izin"] = None
        s["pesan"] = ""
    elif nama == "PreToolUse":
        if s["status"] != "butuh_izin":
            s["status"] = "tanya" if alat == "AskUserQuestion" else "kerja"
        tambah_langkah(s, label or alat, jenis)
    elif nama in ("PostToolUse", "PostToolUseFailure"):
        # Alat sudah jalan: izin apa pun yang masih tercatat sudah dijawab
        # di tempat lain (biasanya terminal).
        s["butuh_izin"] = None
        s["status"] = "kerja"
        diff = ev.get("memo_diff")
        if isinstance(diff, dict) and diff.get("berkas"):
            catat_edit(s, os.path.basename(str(diff["berkas"])),
                       diff.get("tambah"), diff.get("kurang"))
        if nama == "PostToolUseFailure":
            tambah_langkah(s, f"gagal: {label or alat}", "info")
    elif nama == "Notification":
        pesan = str(ev.get("message") or "")[:200]
        s["pesan"] = pesan
        if ev.get("notification_type") == "idle_prompt" and s["status"] not in ("butuh_izin",):
            s["status"] = "idle"
    elif nama == "Stop":
        tandai_selesai(s, True, sekarang)
    elif nama == "StopFailure":
        tandai_selesai(s, False, sekarang)
    elif nama in ("SubagentStart", "SubagentStop"):
        kata = "mulai" if nama == "SubagentStart" else "selesai"
        tambah_langkah(s, f"subagen {kata}", "info")
    return s


def rapikan(registri, sekarang):
    """Selesai -> idle setelah 5 detik; buang sesi lama; kerja basi -> idle."""
    for sid in list(registri):
        s = registri[sid]
        umur = sekarang - float(s.get("diperbarui") or 0)
        if s["status"] == "selesai" and sekarang - float(s.get("selesai_pada") or 0) >= DETIK_SELESAI:
            s["status"] = "idle"
        if s["status"] in ("kerja", "berpikir", "tanya") and umur >= DETIK_BASI_KERJA:
            s["status"] = "idle"
        if s["status"] in ("idle", "galat") and umur >= DETIK_BUANG:
            del registri[sid]
    return registri


def ringkasan_ticker(sesi):
    """Satu baris untuk island: 'claude · proyek — extension.js +42 -7'."""
    kepala = sesi.get("agen", "?")
    if sesi.get("proyek"):
        kepala = f"{kepala} · {sesi['proyek']}"
    st = sesi.get("status")
    if st == "butuh_izin":
        aksi = (sesi.get("butuh_izin") or {}).get("aksi", "minta izin")
        return f"{kepala} — izin? {aksi}"
    if st == "selesai":
        return f"{kepala} — selesai +{sesi.get('tambah', 0)} -{sesi.get('kurang', 0)}"
    if st == "galat":
        return f"{kepala} — gagal"
    if st == "berpikir":
        return f"{kepala} — berpikir…"
    if st == "idle":
        if sesi.get("tambah") or sesi.get("kurang"):
            return f"{kepala} — diam · +{sesi.get('tambah', 0)} -{sesi.get('kurang', 0)}"
        return f"{kepala} — diam"
    langkah = sesi.get("langkah") or []
    berkas = sesi.get("file_diubah") or []
    if langkah and langkah[-1]["jenis"] == "edit" and berkas:
        f = berkas[-1]
        return f"{kepala} — {f['berkas']} +{f['tambah']} -{f['kurang']}"
    if langkah:
        return f"{kepala} — {langkah[-1]['ringkasan']}"
    return f"{kepala} — {st or 'idle'}"


BOBOT_STATUS = {"butuh_izin": 0, "tanya": 1, "kerja": 2, "berpikir": 3,
                "selesai": 4, "galat": 5, "idle": 6}


def sesi_terbaru_dulu(daftar):
    """butuh_izin dulu, lalu yang aktif, lalu yang paling baru diperbarui."""
    return sorted(daftar, key=lambda s: (BOBOT_STATUS.get(s.get("status"), 9),
                                         -float(s.get("diperbarui") or 0)))


def ekspresi_untuk(daftar):
    """Nama ekspresi wajah Memo (face.js) untuk keadaan sesi saat ini."""
    status = {s.get("status") for s in daftar}
    if "butuh_izin" in status or "tanya" in status:
        return "bingung"
    if "galat" in status:
        return "error"
    if "selesai" in status:
        return "senang"
    if status & {"kerja", "berpikir"}:
        return "berpikir"
    return "netral"
