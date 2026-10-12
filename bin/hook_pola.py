"""Aturan relay hook agen coding ala Coucou — murni, tanpa I/O.

Port dari coucou/windows/hook/src/{main,normalize,reply}.rs:

- Payload hook tiap agen (Claude Code, Gemini CLI, Copilot CLI, OpenCode)
  dinormalkan ke nama event & field Claude Code.
- Hanya `PermissionRequest` yang menunggu jawaban, dan hanya dari agen yang
  keputusannya bisa diberikan dari island.
- Aturan utama: TIDAK ADA balasan yang mengizinkan apa pun tanpa keputusan
  yang diklik manusia. Tanpa keputusan, balasannya diam / "{}" / "ask", dan
  agen bertanya di terminalnya sendiri seperti Memo tidak terpasang.
"""

import difflib
import json
import os

# Gemini CLI, Copilot CLI (camelCase), Antigravity -> nama Claude Code.
PETA_EVENT = {
    "BeforeTool": "PreToolUse",
    "AfterTool": "PostToolUse",
    "BeforeAgent": "UserPromptSubmit",
    "AfterAgent": "Stop",
    "PreInvocation": "UserPromptSubmit",
    "PostInvocation": "PostToolUse",
    "sessionStart": "SessionStart",
    "userPromptSubmitted": "UserPromptSubmit",
    "preToolUse": "PreToolUse",
    "permissionRequest": "PermissionRequest",
    "postToolUse": "PostToolUse",
    "agentStop": "Stop",
    "sessionEnd": "SessionEnd",
    "notification": "Notification",
    "stop": "Stop",
}

EVENT_DIKENAL = (
    "SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse",
    "PostToolUseFailure", "PermissionRequest", "Notification", "Stop",
    "StopFailure", "SessionEnd", "SubagentStart", "SubagentStop",
)

# Field yang tidak berguna untuk island dan bisa sangat besar.
FIELD_DIBUANG = ("tool_response", "tool_output", "transcript_path")
BATAS_FIELD = 2000

ALAT_DIFF = ("Edit", "MultiEdit", "Write")
BATAS_BARIS_DIFF = 5000

BATAS_TUNGGU_DETIK = 110


def jalur_soket(env=None):
    """Soket Unix memo-agen: $XDG_RUNTIME_DIR/memo-agen.sock."""
    env = os.environ if env is None else env
    dasar = env.get("XDG_RUNTIME_DIR") or f"/run/user/{os.getuid()}"
    return os.path.join(dasar, "memo-agen.sock")


def nama_event(mentah):
    mentah = (mentah or "").strip()
    return PETA_EVENT.get(mentah, mentah)


def agen_valid(nama):
    """Nama agen dari --agent: huruf kecil/angka/strip, 1-24 karakter."""
    if not nama or len(nama) > 24:
        return False
    return all(c.isdigit() or c == "-" or ("a" <= c <= "z") for c in nama)


def menerima_keputusan(agen):
    """Agen yang kartu izinnya bisa dijawab dari island."""
    return agen in ("", "claude", "codex", "copilot")


def _ingin_json(agen):
    return agen in ("gemini", "antigravity", "copilot")


def _potong(s, batas):
    if len(s) <= batas:
        return s
    return s[:batas] + "…"


def _potong_semua(nilai):
    if isinstance(nilai, str):
        return _potong(nilai, BATAS_FIELD)
    if isinstance(nilai, list):
        return [_potong_semua(v) for v in nilai]
    if isinstance(nilai, dict):
        return {k: _potong_semua(v) for k, v in nilai.items()}
    return nilai


def _jumlah_baris(teks):
    if not teks:
        return 0
    return teks.count("\n") + (0 if teks.endswith("\n") else 1)


def hitung_baris_berubah(lama, baru):
    """(+tambah, -kurang) baris antara dua teks, seperti ticker Coucou."""
    a = (lama or "").splitlines()
    b = (baru or "").splitlines()
    if len(a) > BATAS_BARIS_DIFF or len(b) > BATAS_BARIS_DIFF:
        return len(b), len(a)
    tambah = kurang = 0
    for op, i1, i2, j1, j2 in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
        if op in ("replace", "delete"):
            kurang += i2 - i1
        if op in ("replace", "insert"):
            tambah += j2 - j1
    return tambah, kurang


# OpenCode memakai nama alat huruf kecil dan field camelCase.
ALIAS_ALAT = {"edit": "Edit", "write": "Write", "multiedit": "MultiEdit",
              "read": "Read", "bash": "Bash", "grep": "Grep", "glob": "Glob",
              "webfetch": "WebFetch", "task": "Task"}
ALIAS_FIELD = {"filePath": "file_path", "oldString": "old_string", "newString": "new_string"}


def _alias(nama_alat, masukan):
    nama_alat = ALIAS_ALAT.get(str(nama_alat or ""), str(nama_alat or ""))
    if isinstance(masukan, dict):
        masukan = {ALIAS_FIELD.get(k, k): v for k, v in masukan.items()}
        if isinstance(masukan.get("edits"), list):
            masukan["edits"] = [{ALIAS_FIELD.get(k, k): v for k, v in e.items()}
                                if isinstance(e, dict) else e for e in masukan["edits"]]
    return nama_alat, masukan


def hitung_diff(nama_alat, masukan):
    """{"berkas", "tambah", "kurang"} untuk Edit/MultiEdit/Write, atau None.

    Write menimpa berkas utuh dan isi lamanya sudah hilang saat PostToolUse,
    jadi semua barisnya dihitung sebagai tambahan.
    """
    nama_alat, masukan = _alias(nama_alat, masukan)
    if nama_alat not in ALAT_DIFF or not isinstance(masukan, dict):
        return None
    berkas = str(masukan.get("file_path") or masukan.get("path") or "")
    if nama_alat == "Write":
        tambah, kurang = _jumlah_baris(str(masukan.get("content") or "")), 0
    elif nama_alat == "Edit":
        tambah, kurang = hitung_baris_berubah(
            str(masukan.get("old_string") or ""), str(masukan.get("new_string") or ""))
    else:
        tambah = kurang = 0
        for e in masukan.get("edits") or []:
            if isinstance(e, dict):
                t, k = hitung_baris_berubah(
                    str(e.get("old_string") or ""), str(e.get("new_string") or ""))
                tambah += t
                kurang += k
    return {"berkas": berkas, "tambah": tambah, "kurang": kurang}


def _normalkan_field(peta):
    """Field Gemini/Antigravity/Copilot -> tool_name / tool_input / session_id."""
    panggilan = peta.get("toolCall")
    if isinstance(panggilan, dict):
        peta.setdefault("tool_name", panggilan.get("name", ""))
        argumen = panggilan.get("args")
        if isinstance(argumen, dict):
            masukan = dict(argumen)
            if "CommandLine" in masukan and "command" not in masukan:
                masukan["command"] = masukan["CommandLine"]
            peta.setdefault("tool_input", masukan)
    if "toolName" in peta:
        peta.setdefault("tool_name", peta.get("toolName"))
    if "toolArgs" in peta:
        peta.setdefault("tool_input", peta.get("toolArgs"))
    for sumber in ("conversationId", "sessionId", "sessionID"):
        if peta.get(sumber):
            peta.setdefault("session_id", str(peta[sumber]))


def siapkan(mentah, agen="", event_argv="", cwd=""):
    """Payload siap kirim ke memo-agen, atau None bila tidak terbaca.

    `mentah` adalah bytes stdin. Diff Edit/Write dihitung di sini supaya
    string berkas utuh tidak perlu ikut dikirim.
    """
    if isinstance(mentah, bytes):
        mentah = mentah.decode("utf-8", "replace")
    mentah = (mentah or "").lstrip("﻿").strip()
    if not mentah:
        return None
    try:
        peta = json.loads(mentah)
    except ValueError:
        return None
    if not isinstance(peta, dict):
        return None

    if agen_valid(agen):
        peta["memo_agen"] = agen
    _normalkan_field(peta)

    nama = nama_event(peta.get("hook_event_name") or event_argv)
    if nama == "Stop" and str(peta.get("status", "")).lower() in ("error", "failed"):
        nama = "StopFailure"
    peta["hook_event_name"] = nama

    if nama == "PostToolUse":
        diff = hitung_diff(peta.get("tool_name"), peta.get("tool_input"))
        if diff:
            peta["memo_diff"] = diff

    pertanyaan = None
    if peta.get("tool_name") == "AskUserQuestion" and isinstance(peta.get("tool_input"), dict):
        pertanyaan = peta["tool_input"]

    for f in FIELD_DIBUANG:
        peta.pop(f, None)
    if not peta.get("cwd") and cwd:
        peta["cwd"] = cwd
    peta = _potong_semua(peta)
    if pertanyaan is not None:
        peta["memo_pertanyaan_utuh"] = True
    return peta


def harus_menunggu(peta):
    """True bila relay perlu menunggu klik dari island."""
    return (peta.get("hook_event_name") == "PermissionRequest"
            and menerima_keputusan(peta.get("memo_agen", ""))
            and peta.get("tool_name") != "AskUserQuestion")


def balasan(agen, event, keputusan=None, saran_izin=None):
    """Baris stdout untuk agen, atau None (diam). Port dari reply.rs.

    `keputusan`: "allow" | "deny" | "always" | None (tidak ada yang klik).
    `saran_izin`: permission_suggestions dari Claude Code; dipakai hanya
    untuk "always", supaya Claude sendiri berhenti bertanya — sama dengan
    pilihan "Yes, and don't ask again" di terminal.
    """
    if event != "PermissionRequest":
        if agen == "antigravity" and event == "PreToolUse":
            return '{"decision":"ask"}'
        return "{}" if _ingin_json(agen) else None

    if not menerima_keputusan(agen):
        keputusan = None
    keputusan = (keputusan or "").strip() if isinstance(keputusan, str) else None

    if agen == "copilot":
        kata = {"allow": "allow", "always": "allow", "deny": "deny"}.get(keputusan or "")
        return json.dumps({"permissionDecision": kata or "ask"})

    if keputusan in ("allow", "always"):
        keputusan_json = {"behavior": "allow"}
        if keputusan == "always" and isinstance(saran_izin, list) and saran_izin:
            keputusan_json["updatedPermissions"] = saran_izin
    elif keputusan == "deny":
        keputusan_json = {"behavior": "deny", "message": "Ditolak dari Memo"}
    else:
        return None
    return json.dumps({"hookSpecificOutput": {
        "hookEventName": "PermissionRequest", "decision": keputusan_json}},
        ensure_ascii=False)


def label_alat(nama_alat, masukan):
    """Satu baris pendek untuk ticker: 'Edit extension.js', 'Bash: npm test'."""
    nama_alat, masukan = _alias(nama_alat or "alat", masukan)
    m = masukan if isinstance(masukan, dict) else {}
    berkas = m.get("file_path") or m.get("path") or m.get("notebook_path")
    if nama_alat in ("Bash", "shell", "run_shell_command", "bash"):
        perintah = " ".join(str(m.get("command") or "").split())
        return f"Bash: {perintah[:80]}" if perintah else "Bash"
    if berkas and nama_alat in ("Read", "Edit", "MultiEdit", "Write", "NotebookEdit",
                                "read", "edit", "write"):
        return f"{nama_alat} {os.path.basename(str(berkas))}"
    if nama_alat in ("Grep", "Glob", "grep", "glob"):
        return f"Cari {str(m.get('pattern') or '')[:60]}".strip()
    if nama_alat in ("WebFetch", "WebSearch"):
        return f"{nama_alat} {str(m.get('url') or m.get('query') or '')[:60]}".strip()
    if nama_alat in ("Task", "Agent"):
        return f"Subagen: {str(m.get('description') or '')[:60]}".strip()
    if nama_alat == "AskUserQuestion":
        qs = m.get("questions") or []
        if qs and isinstance(qs[0], dict):
            return f"Tanya: {str(qs[0].get('question') or '')[:80]}"
        return "Tanya"
    return nama_alat


def jenis_langkah(nama_alat):
    nama_alat, _ = _alias(nama_alat, None)
    if nama_alat in ("Edit", "MultiEdit", "Write", "NotebookEdit", "edit", "write"):
        return "edit"
    if nama_alat in ("Bash", "shell", "run_shell_command", "bash"):
        return "jalan"
    if nama_alat == "AskUserQuestion":
        return "tanya"
    return "baca"


def detail_izin(nama_alat, masukan):
    """Teks persis yang ditunjukkan di kartu izin — bukan parafrasa."""
    _, masukan = _alias(nama_alat, masukan)
    m = masukan if isinstance(masukan, dict) else {}
    if m.get("command"):
        return str(m["command"])
    berkas = m.get("file_path") or m.get("path")
    if berkas:
        return str(berkas)
    if m.get("url"):
        return str(m["url"])
    try:
        return json.dumps(m, ensure_ascii=False)[:400]
    except (TypeError, ValueError):
        return ""
