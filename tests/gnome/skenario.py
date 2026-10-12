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
def potret(nama, area=(300, 0, 1000, 560)):
    path = f"{T}/{nama}.png"
    subprocess.run(["gdbus", "call", "--session", "--dest", "org.gnome.Shell.Screenshot", "--object-path", "/org/gnome/Shell/Screenshot",
                    "--method", "org.gnome.Shell.Screenshot.ScreenshotArea", *map(str, area), "false", path], env=env, capture_output=True)
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


# --- gerak ala Mochi: island & Memo desktop -------------------------------
def sampel(js, detik):
    hasil, akhir = [], time.time() + detik
    while time.time() < akhir:
        hasil.append(ev(js)); time.sleep(0.03)
    return hasil
G = "const i = memoUji.island(); const a = i._face.actor;"
POSE = G + "return {e: i._gerak.emoteAktif, ty: a.translation_y, tx: a.translation_x, sy: a.scale_y, rz: a.rotation_angle_z, timer: i._gerak._id, p: i._gerak.jumlahPartikel};"
# Gerak iseng acak dimatikan dulu supaya tidak menyela pengukuran.
ev("memoUji.island()._isengBerikut = 9999; return true;")
gb = {"session_id": "ses-gerak", "cwd": "/home/himisbah/Projects/memo"}
hook({**gb, "hook_event_name": "UserPromptSubmit", "prompt": "uji gerak"})
hook({**gb, "hook_event_name": "PreToolUse", "tool_name": "Read", "tool_input": {"file_path": "/x/a.py"}})
tunggu(lambda k: "memo" in " ".join(k["sesi"]))
time.sleep(1.2)
hook({**gb, "hook_event_name": "Stop"})
s = sampel(POSE, 3.6)
urutan = [x.get("e") for x in s if x.get("e")]
cek("agen selesai -> Memo melompat", "lompat" in urutan, urutan[:8])
cek("lalu berguling (putar) sesudah lompat", "putar" in urutan and urutan.index("putar") > urutan.index("lompat"), urutan)
cek("berguling sungguhan (rotasi mencapai >= 90 derajat)", max(abs(x.get("rz", 0)) for x in s) >= 90)
cek("bintang piksel bertebaran saat selesai", max(x.get("p", 0) for x in s) >= 3, max(x.get("p", 0) for x in s))
cek("gaya piksel: geser selalu piksel bulat", all(float(x.get("ty", 0)).is_integer() and float(x.get("tx", 0)).is_integer() for x in s))
cek("gaya piksel: rotasi per 10 derajat", all(round(x.get("rz", 0)) % 10 == 0 for x in s))
cek("lompatan benar-benar naik (translation_y < 0)", min(x.get("ty", 0) for x in s) < -1, min(x.get("ty", 0) for x in s))
cek("gepeng-melar terjadi (scale_y berubah)", any(abs(x.get("sy", 1) - 1) > 0.05 for x in s))
akhir = ev(POSE)
cek("setelah emote kembali diam, timer & partikel habis", akhir.get("e") is None and abs(akhir.get("ty", 1)) < 0.01 and akhir.get("timer") == 0 and akhir.get("p") == 0, akhir)

ev("const i = memoUji.island(); i._face.onClick(); i._face.onClick(); i._face.onClick(); i.menu.close(); return true;")
s = sampel(POSE, 0.6)
cek("tiga klik cepat -> Memo pusing", any(x.get("e") == "pusing" for x in s), [x.get("e") for x in s][:6])
time.sleep(1.2)
ev("memoUji.island()._isengBerikut = 1; return true;")
s = sampel(POSE, 2.4)
cek("gerak iseng muncul sendiri saat diam", any(x.get("e") in ("lirik", "kedip", "angguk") for x in s), [x.get("e") for x in s if x.get("e")][:4])
ev("memoUji.island()._isengBerikut = 9999; return true;")

pr = hook({**gb, "hook_event_name": "PermissionRequest", "tool_name": "Bash", "tool_input": {"command": "git push"}}, latar=True)
s = sampel(POSE, 1.8)
cek("izin baru -> Memo kaget", any(x.get("e") == "kaget" for x in s), [x.get("e") for x in s][:8])
ev("memoUji.island().jawabIzin('deny'); return true;")
s = sampel(POSE, 0.8)
cek("ditolak -> Memo menggeleng (geser kiri-kanan)", any(x.get("e") == "geleng" for x in s) and min(x.get("tx", 0) for x in s) < -0.5 < 0.5 < max(x.get("tx", 0) for x in s))
pr.stdout.read(); pr.wait(5)

ev("""const i = memoUji.island();
      const lain = i.menu._getMenuItems().find(m => m.label?.text?.startsWith('Lainnya'));
      lain.menu._getMenuItems().find(m => m.label.text.startsWith('Lepas Memo')).activate(null); return true;""")
k = ev("const c = memoUji.island()._companion; return {ada: !!c, tampil: c?.visible};")
cek("Memo desktop bisa dilepas", k == {"ada": True, "tampil": True}, k)
cek("posisi Memo desktop disimpan di config uji, bukan ~/.config asli", os.path.exists(f"{T}/config/memo/companion.json"))
ev("memoUji.island().gerak('lompat'); return true;")
s = sampel("const c = memoUji.island()._companion; return {e: c._gerak.emoteAktif, ty: c._face.actor.translation_y, s: c._face.actor.scale_y};", 0.7)
cek("Memo desktop ikut melompat bersama island", any(x.get("e") == "lompat" for x in s) and min(x.get("ty", 0) for x in s) < -5, s[:3])
time.sleep(0.6)
cek("Memo desktop kembali ke skala 2,6x setelah emote", abs(ev("return memoUji.island()._companion._face.actor.scale_y;") - 2.6) < 0.01)
potret("5-desktop", (1000, 0, 600, 900))
subprocess.run(["notify-send", "--app-name=LebihTeratur", "Pembayaran otomatis masuk", "Rp 199.000 paket Pro"], env=env)
s = sampel(POSE, 0.9)
cek("pembayaran LebihTeratur -> Memo berjoget + koin", any(x.get("e") == "dansa" for x in s) and max(x.get("p", 0) for x in s) >= 2, [(x.get("e"), x.get("p")) for x in s][:5])
k = ev("const c = memoUji.island()._companion; return {e: c._gerak.emoteAktif, p: c._gerak.jumlahPartikel};")
cek("Memo desktop ikut berjoget + koin", k.get("e") == "dansa" and k.get("p", 0) >= 1, k)
potret("7-joget", (300, 0, 1300, 900))
time.sleep(2)

# Tidur hanya boleh saat tidak ada agen bekerja: akhiri sesi uji dulu.
hook({**gb, "hook_event_name": "SessionEnd"})
tunggu(lambda k: k["eks"] == "netral" and k["kotak"] != "event", 8)
ev("memoUji.geserKursor(1500, 850); const i = memoUji.island(); i._detikTidur = 1; i._aktifTerakhir = Date.now() - 5000; return true;")
k = None
for _ in range(20):
    k = ev("const i = memoUji.island(); return {tidur: i._tidur, eks: i.expression, gerakTidur: i._gerak.tidur, comp: i._companion?._gerak.tidur};")
    if k.get("tidur"): break
    time.sleep(0.25)
cek("sepi + kursor jauh -> Memo tidur (island & desktop)", k == {"tidur": True, "eks": "tidur", "gerakTidur": True, "comp": True}, k)
s = sampel("return memoUji.island()._gerak.jumlahPartikel;", 4.0)
cek("tidur -> gelembung z piksel naik turun", max(s) >= 1, s[:6])
potret("6-tidur", (300, 0, 1300, 900))
gb = {**gb, "session_id": "ses-gerak-2"}
hook({**gb, "hook_event_name": "UserPromptSubmit", "prompt": "bangun"})
k = None
for _ in range(20):
    k = ev("const i = memoUji.island(); return {tidur: i._tidur, eks: i.expression, gerakTidur: i._gerak.tidur};")
    if not k.get("tidur"): break
    time.sleep(0.25)
cek("agen mulai bekerja -> Memo bangun", k.get("tidur") is False and k.get("eks") != "tidur" and k.get("gerakTidur") is False, k)
ev("memoUji.geserKursor(800, 16); const i = memoUji.island(); i._detikTidur = 120; return true;")
hook({**gb, "hook_event_name": "SessionEnd"})

daemon.terminate(); daemon.wait(5)
k = tunggu(lambda k: not k["hidup"])
cek("daemon berhenti -> menu tahu", not k["hidup"] and any("tidak jalan" in x for x in k["sesi"]), k)
log = open(f"{T}/shell.log", errors="ignore").read()
galat = [b for b in log.splitlines() if "JS ERROR" in b or ("dynamic-island" in b and "CRITICAL" in b)]
cek("tidak ada JS ERROR / CRITICAL dynamic-island di log shell", not galat, galat[:5])
print(f"\n{sum(hasil)} lolos, {len(hasil) - sum(hasil)} gagal")
print(f"tangkapan layar: {T}/*.png")
sys.exit(0 if all(hasil) else 1)
