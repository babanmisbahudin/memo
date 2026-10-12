"""Uji sesi agen ala Coucou: model murni, aturan relay, dan rantai nyata
memo-hook.py -> soket -> memo-agen.py -> keputusan -> balasan ke agen."""
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import time

BIN = pathlib.Path(__file__).resolve().parent.parent / "bin"
sys.path.insert(0, str(BIN))
import agen_pola  # noqa: E402
import hook_pola  # noqa: E402

gagal = lolos = 0


def cek(label, syarat):
    global gagal, lolos
    if syarat:
        lolos += 1
    else:
        gagal += 1
        print(f"GAGAL | {label}")


# --- agen_pola: registri ---------------------------------------------------
reg = {}
ev = lambda nama, **kw: {"hook_event_name": nama, "session_id": "s1", "cwd": "/p/toko", **kw}
s = agen_pola.terapkan(reg, ev("SessionStart"), 100)
cek("sesi dibuat idle", s["status"] == "idle" and s["proyek"] == "toko")
agen_pola.terapkan(reg, ev("UserPromptSubmit", prompt="tambah fitur"), 101)
cek("prompt -> berpikir", reg["s1"]["status"] == "berpikir" and reg["s1"]["prompt"] == "tambah fitur")
agen_pola.terapkan(reg, ev("PreToolUse", tool_name="Edit"), 102, "Edit app.js", "edit")
cek("PreToolUse -> kerja + langkah", reg["s1"]["status"] == "kerja" and reg["s1"]["langkah"][-1]["ringkasan"] == "Edit app.js")
agen_pola.terapkan(reg, ev("PostToolUse", tool_name="Edit",
                           memo_diff={"berkas": "/p/toko/app.js", "tambah": 3, "kurang": 1}), 103)
agen_pola.terapkan(reg, ev("PostToolUse", tool_name="Edit",
                           memo_diff={"berkas": "/p/toko/app.js", "tambah": 2, "kurang": 0}), 104)
cek("berkas sama dijumlah", reg["s1"]["file_diubah"] == [{"berkas": "app.js", "tambah": 5, "kurang": 1}])
cek("total +N -M", reg["s1"]["tambah"] == 5 and reg["s1"]["kurang"] == 1)
cek("ticker edit", agen_pola.ringkasan_ticker(reg["s1"]) == "claude · toko — app.js +5 -1")
agen_pola.terapkan(reg, ev("Stop"), 105)
cek("Stop -> selesai", reg["s1"]["status"] == "selesai")
cek("ekspresi selesai senang", agen_pola.ekspresi_untuk(list(reg.values())) == "senang")
agen_pola.rapikan(reg, 109)
cek("selesai bertahan < 5 dtk", reg["s1"]["status"] == "selesai")
agen_pola.rapikan(reg, 111)
cek("selesai -> idle setelah 5 dtk", reg["s1"]["status"] == "idle")
agen_pola.rapikan(reg, 111 + agen_pola.DETIK_BUANG)
cek("idle lama dibuang", "s1" not in reg)

agen_pola.terapkan(reg, ev("PreToolUse", tool_name="Bash"), 200, "Bash: ls", "jalan")
agen_pola.rapikan(reg, 200 + agen_pola.DETIK_BASI_KERJA)
cek("kerja basi -> idle", reg["s1"]["status"] == "idle")
agen_pola.terapkan(reg, ev("SessionEnd"), 201)
cek("SessionEnd membuang", "s1" not in reg)

s = agen_pola.sesi_baru("robot-asing", "x")
cek("agen asing -> lainnya", s["agen"] == "lainnya")
agen_pola.minta_izin(s, "Bash: rm x", "rm x", "i1", "Bash")
cek("ekspresi izin bingung", agen_pola.ekspresi_untuk([s]) == "bingung")
cek("keputusan asing ditolak", agen_pola.jawab_izin(s, "mungkin") is False)
cek("allow -> kerja", agen_pola.jawab_izin(s, "allow") and s["status"] == "kerja" and s["butuh_izin"] is None)
a = agen_pola.sesi_baru("claude", "a"); a["status"] = "idle"
b = agen_pola.sesi_baru("codex", "b"); b["status"] = "kerja"
c = agen_pola.sesi_baru("opencode", "c"); c["status"] = "butuh_izin"
cek("urutan: izin, kerja, idle", [x["id"] for x in agen_pola.sesi_terbaru_dulu([a, b, c])] == ["c", "b", "a"])

# --- hook_pola: normalisasi + balasan -------------------------------------
p = hook_pola.siapkan(b'\xef\xbb\xbf{"hook_event_name":"PostToolUse","tool_name":"Edit",'
                      b'"tool_input":{"file_path":"/a/b.py","old_string":"x\\ny\\n","new_string":"x\\nz\\nw\\n"},'
                      b'"tool_response":"besar","transcript_path":"/t"}', "", "", "/cwd")
cek("BOM tidak menggagalkan", p is not None)
cek("diff Edit dihitung", p["memo_diff"] == {"berkas": "/a/b.py", "tambah": 2, "kurang": 1})
cek("field besar dibuang", "tool_response" not in p and "transcript_path" not in p)
cek("cwd diisi", p["cwd"] == "/cwd")
cek("bukan JSON -> None", hook_pola.siapkan(b"bukan json") is None)
cek("array -> None", hook_pola.siapkan(b"[1,2]") is None)
g = hook_pola.siapkan(b'{"hook_event_name":"BeforeTool","toolCall":{"name":"shell","args":{"CommandLine":"ls"}}}', "gemini")
cek("Gemini BeforeTool -> PreToolUse", g["hook_event_name"] == "PreToolUse" and g["memo_agen"] == "gemini")
cek("Gemini CommandLine -> command", g["tool_input"]["command"] == "ls")
cek("agen tak sah dibuang", "memo_agen" not in hook_pola.siapkan(b'{"hook_event_name":"Stop"}', "Agen!!"))
w = hook_pola.siapkan(json.dumps({"hook_event_name": "PreToolUse", "tool_input": {"content": "é" * 5000}}).encode())
cek("string dipotong", len(w["tool_input"]["content"]) <= hook_pola.BATAS_FIELD + 1)
cek("Write: semua baris tambah", hook_pola.hitung_diff("Write", {"file_path": "f", "content": "a\nb\nc"}) == {"berkas": "f", "tambah": 3, "kurang": 0})
cek("MultiEdit dijumlah", hook_pola.hitung_diff("MultiEdit", {"file_path": "f", "edits": [
    {"old_string": "a", "new_string": "b"}, {"old_string": "", "new_string": "c\nd"}]}) == {"berkas": "f", "tambah": 3, "kurang": 1})

AGEN = ["", "claude", "gemini", "antigravity", "cursor", "codex", "copilot", "opencode", "amp"]
EVENT = ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "PermissionRequest",
         "Notification", "Stop", "StopFailure", "SessionEnd", ""]


def mengizinkan(keluar):
    v = json.loads(keluar)
    teks = json.dumps(v)
    keputusan = v.get("decision")
    return "allow" in teks or (keputusan is not None and keputusan != "ask")


aman = True
for ag in AGEN:
    for evn in EVENT:
        for kep in (None, "", "ask", "mungkin", '{"permissionDecision":"allow"}'):
            out = hook_pola.balasan(ag, evn, kep)
            if out and mengizinkan(out):
                aman = False
                print(f"   bocor: {ag!r} {evn} {kep!r} -> {out}")
        if evn != "PermissionRequest":
            out = hook_pola.balasan(ag, evn, "allow")
            if out and mengizinkan(out):
                aman = False
                print(f"   bocor di luar izin: {ag!r} {evn} -> {out}")
cek("TIDAK ADA izin tanpa klik, untuk agen & event apa pun", aman)
cek("allow bentuk Claude Code", hook_pola.balasan("", "PermissionRequest", "allow") ==
    '{"hookSpecificOutput": {"hookEventName": "PermissionRequest", "decision": {"behavior": "allow"}}}')
cek("deny bentuk Claude Code", json.loads(hook_pola.balasan("", "PermissionRequest", "deny"))["hookSpecificOutput"]["decision"]["behavior"] == "deny")
saran = [{"type": "addRules", "rules": [{"toolName": "Bash"}], "destination": "session"}]
al = json.loads(hook_pola.balasan("", "PermissionRequest", "always", saran))
cek("always membawa updatedPermissions", al["hookSpecificOutput"]["decision"]["updatedPermissions"] == saran)
cek("allow biasa tanpa updatedPermissions", "updatedPermissions" not in hook_pola.balasan("", "PermissionRequest", "allow", saran))
cek("tanpa keputusan: Claude diam", hook_pola.balasan("", "PermissionRequest", None) is None)
cek("copilot tanpa keputusan: ask", hook_pola.balasan("copilot", "PermissionRequest", None) == '{"permissionDecision": "ask"}')
cek("gemini selalu {}", hook_pola.balasan("gemini", "PreToolUse") == "{}")
cek("opencode tidak menerima keputusan", hook_pola.balasan("opencode", "PermissionRequest", "allow") is None)
cek("AskUserQuestion tidak ditunggu", not hook_pola.harus_menunggu(
    {"hook_event_name": "PermissionRequest", "tool_name": "AskUserQuestion"}))
cek("label Bash", hook_pola.label_alat("Bash", {"command": "npm   test"}) == "Bash: npm test")
cek("label Edit", hook_pola.label_alat("Edit", {"file_path": "/x/y/app.js"}) == "Edit app.js")

# --- rantai nyata: hook -> soket -> daemon -> keputusan -> balasan ---------
with tempfile.TemporaryDirectory() as d:
    env = dict(os.environ, XDG_RUNTIME_DIR=d, MEMO_SHM=d, MEMO_TANPA_EFEK="1")
    keluaran = os.path.join(d, "memo-agen.json")

    def hook(payload, *arg, batas=15):
        return subprocess.run([sys.executable, str(BIN / "memo-hook.py"), *arg],
                              input=json.dumps(payload).encode(), capture_output=True,
                              env=env, timeout=batas)

    def baca():
        with open(keluaran, encoding="utf-8") as f:
            return json.load(f)

    def tunggu(syarat, batas=5.0):
        akhir = time.time() + batas
        while time.time() < akhir:
            try:
                data = baca()
                if syarat(data):
                    return data
            except (OSError, ValueError):
                pass
            time.sleep(0.05)
        return None

    t0 = time.monotonic()
    r = hook({"hook_event_name": "PermissionRequest", "session_id": "x", "tool_name": "Bash",
              "tool_input": {"command": "ls"}})
    cek("daemon mati: hook langsung keluar 0", r.returncode == 0 and time.monotonic() - t0 < 2)
    cek("daemon mati: tanpa pendapat", r.stdout.strip() == b"")

    daemon = subprocess.Popen([sys.executable, str(BIN / "memo-agen.py")], env=env,
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        cek("daemon membuat soket", tunggu(lambda dt: True) is not None and os.path.exists(os.path.join(d, "memo-agen.sock")))
        cek("soket hanya milik pengguna", (os.stat(os.path.join(d, "memo-agen.sock")).st_mode & 0o077) == 0)
        dobel = subprocess.run([sys.executable, str(BIN / "memo-agen.py")], env=env, capture_output=True, timeout=5)
        cek("daemon kedua menolak jalan", dobel.returncode != 0 and b"sudah jalan" in dobel.stderr)

        base = {"session_id": "ses-uji", "cwd": "/home/x/proyekku"}
        hook({**base, "hook_event_name": "UserPromptSubmit", "prompt": "rapikan kode"})
        hook({**base, "hook_event_name": "PreToolUse", "tool_name": "Edit", "tool_input": {"file_path": "/home/x/proyekku/a.py"}})
        hook({**base, "hook_event_name": "PostToolUse", "tool_name": "Edit",
              "tool_input": {"file_path": "/home/x/proyekku/a.py", "old_string": "a", "new_string": "b\nc"}})
        data = tunggu(lambda dt: dt["sesi"] and dt["sesi"][0]["tambah"] == 2)
        cek("edit +2 -1 sampai ke island", data is not None and data["sesi"][0]["kurang"] == 1
            and data["sesi"][0]["proyek"] == "proyekku")

        izin = {**base, "hook_event_name": "PermissionRequest", "tool_name": "Bash",
                "tool_input": {"command": "rm -rf build"},
                "permission_suggestions": [{"type": "addRules", "destination": "session"}]}
        proses = subprocess.Popen([sys.executable, str(BIN / "memo-hook.py")], env=env,
                                  stdin=subprocess.PIPE, stdout=subprocess.PIPE)
        proses.stdin.write(json.dumps(izin).encode()); proses.stdin.close()
        data = tunggu(lambda dt: dt["izin"])
        cek("kartu izin muncul", data is not None and data["izin"][0]["perintah"] == "rm -rf build")
        cek("sesi berstatus butuh_izin", data is not None and data["sesi"][0]["status"] == "butuh_izin")
        cek("hook masih menunggu klik", proses.poll() is None)
        with open(os.path.join(d, "memo-agen.keputusan.json"), "w") as f:
            json.dump({"id": data["izin"][0]["id"], "keputusan": "allow"}, f)
        out = proses.stdout.read().decode(); proses.wait(5)
        cek("Allow dari island sampai ke agen",
            json.loads(out)["hookSpecificOutput"]["decision"] == {"behavior": "allow"})
        data = tunggu(lambda dt: not dt["izin"])
        cek("kartu hilang setelah dijawab", data is not None and data["sesi"][0]["status"] == "kerja")

        proses = subprocess.Popen([sys.executable, str(BIN / "memo-hook.py")], env=env,
                                  stdin=subprocess.PIPE, stdout=subprocess.PIPE)
        proses.stdin.write(json.dumps(izin).encode()); proses.stdin.close()
        data = tunggu(lambda dt: dt["izin"])
        with open(os.path.join(d, "memo-agen.keputusan.json"), "w") as f:
            json.dump({"id": data["izin"][0]["id"], "keputusan": "always"}, f)
        out = json.loads(proses.stdout.read().decode()); proses.wait(5)
        cek("Selalu: allow + updatedPermissions", out["hookSpecificOutput"]["decision"].get("updatedPermissions")
            == [{"type": "addRules", "destination": "session"}])
        r = hook(izin)
        cek("Selalu: perintah sama diizinkan langsung",
            json.loads(r.stdout)["hookSpecificOutput"]["decision"]["behavior"] == "allow")
        lain = dict(izin, tool_input={"command": "rm -rf /"})
        proses = subprocess.Popen([sys.executable, str(BIN / "memo-hook.py")], env=env,
                                  stdin=subprocess.PIPE, stdout=subprocess.PIPE)
        proses.stdin.write(json.dumps(lain).encode()); proses.stdin.close()
        data = tunggu(lambda dt: dt["izin"])
        cek("Selalu tidak berlaku untuk perintah lain", data is not None and data["izin"][0]["perintah"] == "rm -rf /")
        hook({**base, "hook_event_name": "PostToolUse", "tool_name": "Bash", "tool_input": {"command": "rm -rf /"}})
        out = proses.stdout.read().decode(); proses.wait(5)
        cek("dijawab di terminal: kartu dilepas, hook diam", out.strip() == "")
        data = tunggu(lambda dt: not dt["izin"])
        cek("kartu hilang setelah alat jalan", data is not None)

        proses = subprocess.Popen([sys.executable, str(BIN / "memo-hook.py")], env=env,
                                  stdin=subprocess.PIPE, stdout=subprocess.PIPE)
        proses.stdin.write(json.dumps(dict(izin, tool_input={"command": "make deploy"})).encode()); proses.stdin.close()
        data = tunggu(lambda dt: dt["izin"])
        with open(os.path.join(d, "memo-agen.keputusan.json"), "w") as f:
            json.dump({"id": data["izin"][0]["id"], "keputusan": "deny"}, f)
        out = json.loads(proses.stdout.read().decode()); proses.wait(5)
        cek("Deny sampai ke agen", out["hookSpecificOutput"]["decision"]["behavior"] == "deny")

        proses = subprocess.Popen([sys.executable, str(BIN / "memo-hook.py")], env=env,
                                  stdin=subprocess.PIPE, stdout=subprocess.PIPE)
        proses.stdin.write(json.dumps(dict(izin, tool_input={"command": "sleep 1"})).encode()); proses.stdin.close()
        tunggu(lambda dt: dt["izin"])
        proses.kill(); proses.wait(5)
        data = tunggu(lambda dt: not dt["izin"])
        cek("hook dibunuh: kartu dilepas", data is not None)

        hook({**base, "hook_event_name": "Stop"})
        data = tunggu(lambda dt: dt["sesi"][0]["status"] == "selesai")
        cek("Stop sampai ke island", data is not None)
        hook({**base, "hook_event_name": "SessionEnd"})
        data = tunggu(lambda dt: not dt["sesi"])
        cek("SessionEnd membersihkan", data is not None)
    finally:
        daemon.terminate()
        daemon.wait(5)
    cek("daemon mati: soket dibersihkan", not os.path.exists(os.path.join(d, "memo-agen.sock")))

print(f"\n{lolos} lolos, {gagal} gagal")
sys.exit(1 if gagal else 0)
