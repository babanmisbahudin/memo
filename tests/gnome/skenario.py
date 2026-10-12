"""Skenario island Memo di GNOME Shell headless. Dijalankan oleh uji-island.sh."""
import json, os, subprocess, sys, time
T = os.environ["MEMO_UJI_DIR"]
R = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
for _ in range(40):
    if os.path.exists(f"{T}/bus") and "[dynamic-island] enabled" in open(f"{T}/shell.log", errors="ignore").read():
        break
    time.sleep(0.5)
BUS = open(f"{T}/bus").read().strip()
env = dict(os.environ, DBUS_SESSION_BUS_ADDRESS=BUS, MEMO_SHM=f"{T}/shm", XDG_RUNTIME_DIR=os.environ["MEMO_UJI_RUN"], MEMO_TANPA_BUNYI="1")
hasil = []
def cek(label, syarat, info=""):
    hasil.append(bool(syarat)); print(("OK    " if syarat else "GAGAL ") + label + (f"  [{info}]" if info and not syarat else ""), flush=True)
def ev(js):
    r = subprocess.run(["gdbus", "call", "--session", "--dest", "org.gnome.Shell", "--object-path", "/org/gnome/Shell",
                        "--method", "org.gnome.Shell.Eval", f"encodeURIComponent(JSON.stringify((() => {{ {js} }})()))"], env=env, capture_output=True, text=True)
    out = r.stdout.strip()
    if not out.startswith("(true"):
        return {"__galat": out or r.stderr}
    from urllib.parse import unquote
    isi = unquote(out[len("(true, '"):-2].strip('"'))
    try: return json.loads(isi)
    except Exception: return {"__mentah": isi}
def potret(nama):
    path = f"{T}/{nama}.png"
    subprocess.run(["gdbus", "call", "--session", "--dest", "org.gnome.Shell.Screenshot", "--object-path", "/org/gnome/Shell/Screenshot",
                    "--method", "org.gnome.Shell.Screenshot.ScreenshotArea", "300", "0", "1000", "560", "false", path], env=env, capture_output=True)
    return path
def hook(p, latar=False):
    a = [sys.executable, f"{R}/bin/memo-hook.py"]
    if latar:
        pr = subprocess.Popen(a, env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE); pr.stdin.write(json.dumps(p).encode()); pr.stdin.close(); return pr
    return subprocess.run(a, env=env, input=json.dumps(p).encode(), capture_output=True)
I = "const i = memoUji.island();"
keadaan = lambda: ev(I + "return {label: i._label.text, kotak: i._current === i._event ? 'event' : i._current === i._dot ? 'dot' : 'normal', kartu: i._kartuIzin.visible, judul: i._izinJudul.text, perintah: i._izinPerintah.text, hidup: i._agen.hidup, eks: i.expression, sesi: i._seksiSesi._getMenuItems().map(m => m.label.text), pills: i._seksiPills._getMenuItems().map(m => m.label.text), pintasan: Main.extensionManager.lookup('dynamic-island@local').stateObj._shortcuts._terpasang};".replace("Main.", "memoUji.Main."))
def tunggu(syarat, batas=6):
    akhir = time.time() + batas
    while time.time() < akhir:
        k = keadaan()
        try:
            if syarat(k): return k
        except Exception: pass
        time.sleep(0.25)
    return keadaan()

k = keadaan()
cek("extension aktif tanpa galat", ev("return {s: memoUji.status(), g: memoUji.galat()}") == {"s": 1, "g": ""}, k)
cek("pintasan terpasang lewat getSettings()", k.get("pintasan") == ["toggle-menu", "voice", "allow", "deny"], k.get("pintasan"))
cek("daemon mati -> menu bilang tidak jalan", any("tidak jalan" in x for x in k.get("sesi", [])), k.get("sesi"))
potret("0-diam")

daemon = subprocess.Popen([sys.executable, f"{R}/bin/memo-agen.py"], env=env)
k = tunggu(lambda k: k["hidup"])
cek("daemon hidup terdeteksi", k["hidup"], k)
cek("tanpa sesi -> pesan kosong", any("Tidak ada sesi" in x for x in k["sesi"]), k["sesi"])
base = {"session_id": "ses-uji-1", "cwd": "/home/himisbah/Projects/toko"}
hook({**base, "hook_event_name": "UserPromptSubmit", "prompt": "rapikan checkout"})
k = tunggu(lambda k: "berpikir" in k["label"])
cek("prompt -> island 'berpikir…'", "berpikir" in k["label"] and k["kotak"] == "event", k)
cek("ekspresi berpikir", k["eks"] == "berpikir", k["eks"])
hook({**base, "hook_event_name": "PreToolUse", "tool_name": "Edit", "tool_input": {"file_path": "/x/checkout.js"}})
hook({**base, "hook_event_name": "PostToolUse", "tool_name": "Edit", "tool_input": {"file_path": "/x/checkout.js", "old_string": "a\nb", "new_string": "a\nc\nd"}})
k = tunggu(lambda k: "checkout.js +2" in k["label"])
cek("ticker edit +N −M di island", k["label"] == "claude · toko — checkout.js +2 −1", k["label"])
cek("sesi tampil di menu", any("checkout.js" in x for x in k["sesi"]), k["sesi"])
potret("1-aktivitas")

izin = {**base, "hook_event_name": "PermissionRequest", "tool_name": "Bash", "tool_input": {"command": "npm run migrate -- --env production"}}
pr = hook(izin, latar=True)
k = tunggu(lambda k: k["kartu"])
cek("kartu izin muncul", k["kartu"], k)
cek("perintah persis di kartu", k["perintah"] == "npm run migrate -- --env production", k["perintah"])
cek("island menempel izin", k["label"].startswith("claude: izin? Bash: npm run migrate"), k["label"])
cek("ekspresi bingung saat izin", k["eks"] == "bingung", k["eks"])
ev("const i = memoUji.island(); i.menu.open(); return true;"); time.sleep(0.6)
potret("2-kartu-izin")
klik = ev("const i = memoUji.island(); const b = i._tombolIzin.allow; b.emit('clicked', 1); return b.label;")
cek("tombol pertama = Izinkan", klik == "Izinkan", klik)
out = pr.stdout.read().decode(); pr.wait(5)
cek("klik tombol -> agen menerima allow", out and json.loads(out)["hookSpecificOutput"]["decision"]["behavior"] == "allow", out)
k = tunggu(lambda k: not k["kartu"])
cek("kartu hilang setelah klik", not k["kartu"], k)

pr = hook(dict(izin, tool_input={"command": "rm -rf dist"}), latar=True)
tunggu(lambda k: k["kartu"])
r = subprocess.run(["gdbus", "call", "--session", "--dest", "org.gnome.Shell", "--object-path", "/org/gnome/Shell", "--method", "org.gnome.Shell.Eval",
                    "memoUji.Main.extensionManager.lookup('dynamic-island@local').stateObj._island.jawabIzin('deny')"], env=env, capture_output=True)
out = pr.stdout.read().decode(); pr.wait(5)
cek("jalur pintasan Super+Shift+Y (jawabIzin deny) -> agen menerima deny", out and json.loads(out)["hookSpecificOutput"]["decision"]["behavior"] == "deny", out)

hook({**base, "hook_event_name": "Stop"})
k = tunggu(lambda k: "selesai" in k["label"])
cek("Stop -> 'selesai +N −M'", k["label"] == "claude · toko — selesai +2 −1", k["label"])
cek("ekspresi senang saat selesai", k["eks"] == "senang", k["eks"])
k = tunggu(lambda k: k["kotak"] == "normal", 9)
cek("setelah 5 dtk island kembali ke jam", k["kotak"] == "normal", k)

pills = {"pills": [{"id": "github", "judul": "Git", "sub": "bersih", "aktif": False},
                   {"id": "lebihteratur", "judul": "LebihTeratur", "sub": "2 kabar hari ini · Pembayaran otomatis masuk", "aktif": True, "angka": 2,
                    "kabar": [{"judul": "Pembayaran otomatis masuk", "pesan": "Rp 199.000 paket Pro", "url": "https://own.lebihteratur.com/admin/subscriptions/history"},
                              {"judul": "Chat dari Dekor Indah", "pesan": "halo admin", "url": "javascript:alert(1)"}]}]}
json.dump(pills, open(f"{T}/shm/memo-pills.json", "w"))
k = tunggu(lambda k: any("LebihTeratur" in x for x in k["pills"]))
cek("pill LebihTeratur tampil", any(x.startswith("● LebihTeratur") for x in k["pills"]), k["pills"])
cek("kabar https bisa diklik, javascript: tidak", ev("const i = memoUji.island(); return i._seksiPills._getMenuItems().filter(m => m.label.text.includes('—')).map(m => m.reactive);") == [True, False])
ev("const i = memoUji.island(); i.menu.open(); return true;"); time.sleep(0.6)
potret("3-menu-pill")
ev("const i = memoUji.island(); i.menu.close(); return true;")

subprocess.run(["notify-send", "--app-name=LebihTeratur", "Vendor Baru Terdaftar", "Dekor Indah mendaftar"], env=env)
k = tunggu(lambda k: k["label"] == "Vendor Baru Terdaftar", 4)
cek("notifikasi LebihTeratur muncul di island", k["label"] == "Vendor Baru Terdaftar", k["label"])
potret("4-notif")

subprocess.run([sys.executable, f"{R}/bin/memo-agen.py", "--demo"], env=env, capture_output=True)
k = tunggu(lambda k: k["kartu"] and "demo" in " ".join(k["sesi"]))
cek("mode demo mengisi sesi + kartu", k["kartu"] and any("mode demo" in x for x in k["sesi"]), k["sesi"])
ev("const i = memoUji.island(); i.jawabIzin('allow'); return true;")
k = tunggu(lambda k: not k["kartu"])
cek("menjawab kartu demo menutup demo", not k["kartu"], k)

daemon.terminate(); daemon.wait(5)
k = tunggu(lambda k: not k["hidup"])
cek("daemon berhenti -> menu tahu", not k["hidup"] and any("tidak jalan" in x for x in k["sesi"]), k)
log = open(f"{T}/shell.log", errors="ignore").read()
galat = [b for b in log.splitlines() if "JS ERROR" in b or ("dynamic-island" in b and "CRITICAL" in b)]
cek("tidak ada JS ERROR / CRITICAL dynamic-island di log shell", not galat, galat[:5])
print(f"\n{sum(hasil)} lolos, {len(hasil) - sum(hasil)} gagal")
print(f"tangkapan layar: {T}/*.png")
sys.exit(0 if all(hasil) else 1)
