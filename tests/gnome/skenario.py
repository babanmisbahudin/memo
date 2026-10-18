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
keadaan = lambda: ev(I + "return {label: i._label.text, kotak: i._current === i._event ? 'event' : i._current === i._dot ? 'dot' : 'normal', kartu: !!i._panel.kartuIzin, perintah: i._panel.izinPerintah?.text ?? '', hidup: i._agen.hidup, eks: i.expression, sesi: i._panel.teksKartu, pills: i._panel.teksPill, mini: i._mini.visible ? i._mini.get_n_children() : 0, pintasan: Main.extensionManager.lookup('dynamic-island@local').stateObj._shortcuts._terpasang};".replace("Main.", "memoUji.Main."))
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
st = ev("return {s: memoUji.status(), g: memoUji.galat()}")
cek("extension aktif tanpa galat", st == {"s": 1, "g": ""}, st)
if st != {"s": 1, "g": ""}:
    print("\n".join(b for b in open(f"{T}/shell.log", errors="ignore").read().splitlines()
                    if "CRITICAL" in b or "JS ERROR" in b or "@file://" in b)[:3000])
    sys.exit(1)
cek("panel tertutup tidak tergambar", ev("return memoUji.island().menu.actor.visible;") is False)
for _ in range(40):
    k = keadaan()
    if "__galat" not in k:
        break
    time.sleep(0.25)
cek("pintasan terpasang lewat getSettings()", k.get("pintasan") == ["toggle-menu", "voice", "allow", "deny"], k)
cek("daemon mati -> menu bilang tidak jalan", any("tidak jalan" in x for x in k.get("sesi", [])), k)
potret("0-diam")

daemon = subprocess.Popen([sys.executable, f"{R}/bin/memo-agen.py"], env=env)
k = tunggu(lambda k: k["hidup"])
cek("daemon hidup terdeteksi", k["hidup"], k)
cek("tanpa sesi -> kartu 'Belum ada agen bekerja'", any("Belum ada agen" in x for x in k["sesi"]), k["sesi"])
base = {"session_id": "ses-uji-1", "cwd": "/home/himisbah/Projects/toko"}
hook({**base, "hook_event_name": "UserPromptSubmit", "prompt": "rapikan checkout"})
k = tunggu(lambda k: "berpikir" in k["label"])
cek("prompt -> island 'berpikir…'", "berpikir" in k["label"] and k["kotak"] == "event", k)
cek("ekspresi berpikir", k["eks"] == "berpikir", k["eks"])
hook({**base, "hook_event_name": "PreToolUse", "tool_name": "Edit", "tool_input": {"file_path": "/x/checkout.js"}})
hook({**base, "hook_event_name": "PostToolUse", "tool_name": "Edit", "tool_input": {"file_path": "/x/checkout.js", "old_string": "a\nb", "new_string": "a\nc\nd"}})
k = tunggu(lambda k: "checkout.js +2" in k["label"])
cek("ticker edit +N −M di island", k["label"] == "claude · toko — checkout.js +2 −1", k["label"])
cek("kartu utama: proyek + langkah", "toko" in k["sesi"] and any("checkout.js" in x for x in k["sesi"]), k["sesi"])
cek("island tertutup: avatar pill mini muncul", k["mini"] >= 1, k["mini"])
potret("1-aktivitas")

izin = {**base, "hook_event_name": "PermissionRequest", "tool_name": "Bash", "tool_input": {"command": "npm run migrate -- --env production"}}
pr = hook(izin, latar=True)
k = tunggu(lambda k: k["kartu"])
cek("kartu izin muncul", k["kartu"], k)
cek("perintah persis di kartu", k["perintah"] == "npm run migrate -- --env production", k["perintah"])
cek("island menempel izin", k["label"].startswith("claude: izin? Bash: npm run migrate"), k["label"])
cek("ekspresi bingung saat izin", k["eks"] == "bingung", k["eks"])
ev("const i = memoUji.island(); i.menu.open(); return true;"); time.sleep(0.6)
potret("2-kartu-izin", (300, 0, 1000, 420))
u = ev("const i = memoUji.island(); const [, y] = i.menu.box.get_transformed_position(); const [, py] = i._pill.get_transformed_position(); return {lebar: Math.round(i.menu.box.width), atas: Math.round(y), pillAtas: Math.round(py), tab: i._panel._tab};")
cek("panel ala Coucou: lebar 640 px", u.get("lebar") == 640, u)
cek("panel naik menutupi strip island (baris teratas = tab, bukan jam/notifikasi)", u.get("atas") == u.get("pillAtas"), u)
cek("ada izin -> panel membuka Beranda", u.get("tab") == "beranda", u)
klik = ev("const i = memoUji.island(); const b = i._panel.tombolIzin.allow; b.emit('clicked', 1); return b.get_child().get_children()[0].text;")
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
ev("const i = memoUji.island(); i.menu.open(); return true;"); time.sleep(0.6)
teks = ev("return memoUji.island()._panel.teksKartu;")
cek("kartu selesai ala Coucou: '... selesai' + ringkasan +N −M", any("selesai" in x for x in teks) and any("+2 −1" in x for x in teks), teks)
potret("10-selesai", (300, 0, 1000, 420))
ev("const i = memoUji.island(); i.menu.close(); return true;")
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
cek("pill LebihTeratur tampil di kisi", "LebihTeratur" in k["pills"], k["pills"])
ev("const i = memoUji.island(); i.menu.open(); i._panel._kisi.get_children().find(b => b._memoId === 'lebihteratur').emit('clicked', 1); return true;"); time.sleep(0.6)
kelas = ev("return memoUji.island()._panel._info.get_children().map(c => c.style_class);")
cek("klik pill -> kartu detail layanan; kabar https jadi tautan, javascript: tidak", kelas.count("memo-baris-tautan") == 1 and "memo-kabar" in kelas, kelas)
potret("3-menu-pill", (300, 0, 1000, 420))
ev("const i = memoUji.island(); i._panel._kisi.get_children().find(b => b._memoId === 'lebihteratur').emit('clicked', 1); i._panel.pilihTab('chat'); return true;"); time.sleep(0.3)
ev("const c = memoUji.island()._panel._chat; c.entri.set_text('halo memo'); c.entri.clutter_text.emit('activate'); return true;"); time.sleep(0.4)
cek("tab Chat: ketikan terkirim ke memo-suara", open(f"{T}/shm/memo-ngobrol.teks").read() == "halo memo")
cek("tab Chat: muncul di riwayat", any("halo memo" in x for x in ev("const c = memoUji.island()._panel._chat; return c.riwayat.get_children().map(b => b.get_children()[1].text);")))
potret("8-chat", (300, 0, 1000, 420))
ev("const p = memoUji.island()._panel; p.pilihTab('atur'); p._tombolOtak.find(b => b._memoId === 'claude').emit('clicked', 1); return true;"); time.sleep(0.3)
cek("Pengaturan: pilih Otak AI tersimpan", open(f"{T}/shm/memo-ngobrol.backend").read() == "claude")
ev("const p = memoUji.island()._panel; p._ikonSuara.get_parent().emit('clicked', 1); return true;"); time.sleep(0.2)
cek("tombol suara: Memo dibisukan (config uji)", os.path.exists(f"{T}/config/memo/bisu"))
potret("9-atur", (300, 0, 1000, 420))
ev("const p = memoUji.island()._panel; p._ikonSuara.get_parent().emit('clicked', 1); return true;"); time.sleep(0.2)
cek("tombol suara lagi: suara kembali", not os.path.exists(f"{T}/config/memo/bisu"))
ev("const i = memoUji.island(); i._panel.pilihTab('beranda'); i.menu.close(); return true;")
ev("memoUji.island().menu.open(); return true;"); time.sleep(0.6)
j = ev("""const i = memoUji.island(); const p = i._panel; const dm = memoUji.Main.panel.statusArea.dateMenu;
          const [bx] = i.menu.box.get_transformed_position(); const [jx] = p._tombolJam.get_transformed_position();
          return {jam: p._jam.text, asli: dm._clockDisplay.text, tengahPanel: Math.round(bx + i.menu.box.width / 2),
                  tengahJam: Math.round(jx + p._tombolJam.width / 2), tampak: p._tombolJam.visible && p._tombolJam.mapped};""")
cek("jam bawaan Ubuntu tampil di panel, sama dengan jam bilah atas", j.get("jam") and j.get("jam") == j.get("asli") and j.get("tampak"), j)
cek("jam tepat di tengah baris atas panel", abs(j.get("tengahPanel", 0) - j.get("tengahJam", 999)) <= 2, j)
potret("11-jam", (300, 0, 1000, 420))
ev("memoUji.island()._panel._tombolJam.emit('clicked', 1); return true;"); time.sleep(0.9)
k = ev("""const i = memoUji.island(); const dm = memoUji.Main.panel.statusArea.dateMenu;
          return {memo: i.menu.isOpen, kalender: dm.menu.isOpen, kotak: i._current === i._normal ? 'normal' : 'lain'};""")
cek("klik jam -> panel Memo tertutup, kalender & notifikasi bawaan terbuka", k == {"memo": False, "kalender": True, "kotak": "normal"}, k)
potret("12-kalender", (300, 0, 1000, 560))
ev("memoUji.Main.panel.statusArea.dateMenu.menu.close(); return true;"); time.sleep(0.6)
cek("kalender ditutup -> island kembali normal", ev("return memoUji.island()._paksaNormal;") is None)

# Ikon sistem (Pengaturan Cepat) - juga saat jendela dimaksimalkan (island ringkas)
ev("const i = memoUji.island(); i._covered = true; i._pointerNear = false; i._update(); return true;"); time.sleep(0.6)
cek("simulasi jendela maksimal: island ringkas", ev("const i = memoUji.island(); return i._current === i._dot;") is True)
ev("memoUji.island().menu.open(); return true;"); time.sleep(0.6)
q = ev("const s = memoUji.island()._panel._tombolSistem; return {lebar: Math.round(s.width), tinggi: Math.round(s.height), tampak: s.mapped, klon: s.get_child().constructor.name};")
cek("ikon sistem bilah atas tampil di panel (walau island ringkas)", q.get("tampak") and q.get("lebar", 0) > 30 and q.get("tinggi", 0) > 10, q)
t = ev("""const p = memoUji.island()._panel; const kotak = a => { const [x] = a.get_transformed_position(); return [Math.round(x), Math.round(x + a.width)]; };
          return {jam: kotak(p._tombolJam.get_child()), status: p._statusAtas.visible ? kotak(p._statusAtas) : null, sistem: kotak(p._tombolSistem)};""")
cek("baris atas tidak bertabrakan: status < jam < ikon sistem", (t["status"] is None or t["status"][1] < t["jam"][0]) and t["jam"][1] < t["sistem"][0], t)
potret("13-ikon-sistem", (300, 0, 1000, 420))
cek("bingkai wajah tetap 100 px (tidak melebar)", ev("return Math.round(memoUji.island()._panel._wajah.bingkai.width);") == 100)
ev("memoUji.island()._panel._tombolSistem.emit('clicked', 1); return true;"); time.sleep(0.9)
k = ev("""const i = memoUji.island(); const qs = memoUji.Main.panel.statusArea.quickSettings;
          return {memo: i.menu.isOpen, qs: qs.menu.isOpen, kotak: i._current === i._normal ? 'normal' : 'lain'};""")
cek("klik ikon sistem -> Pengaturan Cepat bawaan terbuka (restart/matikan dll)", k == {"memo": False, "qs": True, "kotak": "normal"}, k)
potret("14-pengaturan-cepat", (300, 0, 1300, 700))
ev("memoUji.Main.panel.statusArea.quickSettings.menu.close(); return true;"); time.sleep(0.6)
k = ev("const i = memoUji.island(); return {paksa: i._paksaNormal, dot: i._current === i._dot};")
cek("Pengaturan Cepat ditutup -> island kembali ringkas", k == {"paksa": None, "dot": True}, k)
ev("const i = memoUji.island(); i._covered = false; i._update(); return true;"); time.sleep(0.4)

subprocess.run(["notify-send", "--app-name=LebihTeratur", "Vendor Baru Terdaftar", "Dekor Indah mendaftar"], env=env)
k = tunggu(lambda k: k["label"] == "Vendor Baru Terdaftar", 4)
cek("notifikasi LebihTeratur muncul di island", k["label"] == "Vendor Baru Terdaftar", k["label"])
potret("4-notif")

subprocess.run([sys.executable, f"{R}/bin/memo-agen.py", "--demo"], env=env, capture_output=True)
k = tunggu(lambda k: k["kartu"] and "demo" in " ".join(k["sesi"]))
cek("mode demo mengisi sesi + kartu", k["kartu"] and ev("return memoUji.island()._agen.demo;") is True, k["sesi"])
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

# --- Memo hidup di desktop (extension/hidup/) --------------------------------
H = "const h = memoUji.island().hidup;"
KH = H + ("const b = h._badan; return {luar: h.diLuar, tampak: h.actor.visible, keadaan: b.keadaan, "
          "pijakan: b.pijakan ?? null, x: b.x, y: b.y, tepi: b.tepi?.jenis ?? null, keg: h._pikiran.kegiatan, "
          "induk: h.actor.get_parent() === global.window_group ? 'jendela' : 'atas', "
          "redup: memoUji.island()._face.actor.opacity};")
def tunggu_hidup(syarat, batas=8):
    akhir, k = time.time() + batas, {}
    while time.time() < akhir:
        k = ev(KH)
        try:
            if syarat(k): return k
        except Exception: pass
        time.sleep(0.25)
    return k
ev("const p = memoUji.island()._panel; p.pilihTab('atur'); p._tombolHidup.emit('clicked', 1); "
   "p._sliderSifat[0].value = 0.9; memoUji.island().menu.close(); memoUji.island()._kabarTerakhir = 0; return true;")
cek("tombol Pengaturan menyalakan jalan-jalan", ev(H + "return h.aktif;") is True)
cek("slider sifat mengubah sifat Memo", abs(ev(H + "return h.sifat.penasaran;") - 0.9) < 0.001)
k = tunggu_hidup(lambda k: k["luar"] and k["keadaan"] == "berdiri", 10)
cek("jalan-jalan dinyalakan -> Memo keluar dari island & mendarat", k.get("luar") and k.get("tampak") and k.get("keadaan") == "berdiri", k)
cek("island meredup saat Memo keluar", k.get("redup") == 70, k)
cek("jalan-jalan tersimpan di config uji, bukan ~/.config asli", json.load(open(f"{T}/config/memo/hidup.json")).get("aktif") is True)
ev("memoUji.island().gerak('lompat'); return true;")
s = sampel(H + "return {e: h._gerak.emoteAktif, ty: h.actor.translation_y};", 0.7)
cek("Memo hidup ikut melompat bersama island", any(x.get("e") == "lompat" for x in s) and min(x.get("ty", 0) for x in s) < -5, s[:3])
potret("5-desktop", (0, 0, 1600, 900))
subprocess.run(["notify-send", "--app-name=LebihTeratur", "Pembayaran otomatis masuk", "Rp 199.000 paket Pro"], env=env)
s = sampel(POSE, 0.9)
cek("pembayaran LebihTeratur -> Memo berjoget + koin", any(x.get("e") == "dansa" for x in s) and max(x.get("p", 0) for x in s) >= 2, [(x.get("e"), x.get("p")) for x in s][:5])
k = tunggu_hidup(lambda k: not k["luar"], 4)
cek("kabar datang -> Memo pulang ke island", k.get("luar") is False and k.get("redup") == 255, k)
ev(H + "h.setAktif(false); return true;")
potret("7-joget", (300, 0, 1300, 900))
time.sleep(2)

# Tidur hanya boleh saat tidak ada agen bekerja: akhiri sesi uji dulu.
hook({**gb, "hook_event_name": "SessionEnd"})
tunggu(lambda k: k["eks"] == "netral" and k["kotak"] != "event", 8)
ev("memoUji.geserKursor(1500, 850); const i = memoUji.island(); i._detikTidur = 1; i._aktifTerakhir = Date.now() - 5000; return true;")
k = None
for _ in range(20):
    k = ev("const i = memoUji.island(); return {tidur: i._tidur, eks: i.expression, gerakTidur: i._gerak.tidur};")
    if k.get("tidur"): break
    time.sleep(0.25)
cek("sepi + kursor jauh -> Memo tidur", k == {"tidur": True, "eks": "tidur", "gerakTidur": True}, k)
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
# --- Memo mengelola laptop: D-Bus Buka (pembuka palsu mencatat ke $T/dibuka) --
def buka(jenis, target):
    r = subprocess.run(["gdbus", "call", "--session", "--dest", "org.himisbah.Robot", "--object-path",
                        "/org/himisbah/Robot", "--method", "org.himisbah.Robot.Buka", json.dumps(jenis),
                        json.dumps(target)], env=env, capture_output=True, text=True)
    return (r.stdout or r.stderr).strip()
def dibuka():
    time.sleep(1.2)
    try: return open(f"{T}/dibuka").read().split("\n")
    except OSError: return []
ev("memoUji.island().menu.open(); return true;"); time.sleep(0.5)
k = buka("url", "https://www.youtube.com")
cek("Buka url: dibuka aplikasi bawaan https", k.startswith("(true") and "buka:https://www.youtube.com" in dibuka(), (k, dibuka()))
cek("Buka berhasil -> panel Memo ditutup", ev("return memoUji.island().menu.isOpen;") is False)
os.makedirs(f"{T}/folder-uji", exist_ok=True)
k = buka("folder", f"{T}/folder-uji")
cek("Buka folder: dibuka aplikasi bawaan folder", k.startswith("(true")
    and any(x in (f"buka:{T}/folder-uji", f"buka:file://{T}/folder-uji") for x in dibuka()), (k, dibuka()))
k = buka("aplikasi", "tidak.ada.desktop\n?pembuka")
cek("Buka aplikasi: kandidat dicari lewat pencarian GNOME", k == "(true, 'Memo Uji Pembuka')" and "buka:" in dibuka(), (k, dibuka()))
sebelum = dibuka()
hasil_tolak = [buka("url", "file:///etc/passwd"), buka("url", "javascript:alert(1)"), buka("folder", "/tidak/ada"),
               buka("folder", "relatif"), buka("terminal", "/tidak/ada"), buka("aplikasi", "?zzzz-tidak-ada"), buka("hapus", "/")]
cek("Buka menolak url non-http, folder tak ada, jenis asing", all(x == "(false, '')" for x in hasil_tolak) and dibuka() == sebelum,
    (hasil_tolak, dibuka()[-3:]))

# --- Layar sambutan (login/logout/restart/shutdown/suspend), mode uji ---------
# Klien GTK diarahkan ke soket Wayland shell uji (bukan sesi yang sedang dipakai).
envG = dict(env, WAYLAND_DISPLAY=open(f"{T}/wayland").read().strip(), GDK_BACKEND="wayland")
envG.pop("DISPLAY", None)
SAMBUTAN = os.path.join(R, "sambutan", "sambutan.js")
for jenis in ["masuk", "keluar", "restart", "matikan", "tidur"]:
    pr = subprocess.Popen(["gjs", "-m", SAMBUTAN, jenis, "--uji"], env=envG, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    time.sleep(1.6)
    potret(f"20-sambutan-{jenis}", (0, 0, 1600, 900))
    try:
        keluar, galat_g = pr.communicate(timeout=8)
    except subprocess.TimeoutExpired:
        pr.kill(); keluar, galat_g = pr.communicate()
    cek(f"sambutan {jenis}: tampil lalu lanjut sendiri (uji: tanpa aksi)", pr.returncode == 0 and keluar.strip() == "lanjut", (pr.returncode, keluar, galat_g[-400:]))
    cek(f"sambutan {jenis}: tanpa galat GJS", "JS ERROR" not in galat_g and "TypeError" not in galat_g, galat_g[-400:])
pr = subprocess.Popen(["gjs", "-m", SAMBUTAN, "matikan", "--uji"], env=envG, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
time.sleep(1.2)
fokus = ev("return String(global.display.focus_window?.get_wm_class());")
ev("memoUji.tekanTombol(0xff1b); return true;")
keluar, _ = pr.communicate(timeout=8)
cek("sambutan: jendela mendapat fokus keyboard", fokus == "com.local.MemoSambutan.matikan", fokus)
cek("sambutan: Esc membatalkan shutdown", keluar.strip() == "batal", keluar)

# Menu daya (SystemActions) -> sambutan. Shell uji memakai MEMO_SAMBUTAN_UJI=1,
# jadi sambutan berjalan dengan --uji dan tidak benar-benar mematikan.
WM = "return String(global.display.focus_window?.get_wm_class());"
cek("jalurBin menemukan skrip di bin/ repo", str(ev("return memoUji.island().jalurBin('memo-lampirkan.py');")).endswith("/bin/memo-lampirkan.py"))
ev("memoUji.aksiSistem().activatePowerOff(); return true;"); time.sleep(1.2)
cek("menu daya: Power Off membuka sambutan matikan", ev(WM) == "com.local.MemoSambutan.matikan", ev(WM))
ev("memoUji.tekanTombol(0xff1b); return true;"); time.sleep(1.2)
k = ev("return {sambutan: !!global.display.focus_window?.get_wm_class()?.startsWith('com.local.MemoSambutan'), modal: memoUji.Main.modalCount};")
cek("menu daya: Esc menutup sambutan tanpa dialog bawaan", k == {"sambutan": False, "modal": 0}, k)
ev("memoUji.aksiSistem().activateSuspend(); return true;"); time.sleep(1.2)
cek("menu daya: Suspend membuka sambutan tidur", ev(WM) == "com.local.MemoSambutan.tidur", ev(WM))
time.sleep(2.5)
ev("const s = memoUji.Main.extensionManager.lookup('dynamic-island@local').stateObj._sambutan; globalThis.cadanganUji = false; s._tampilkan('/tidak/ada/sambutan.js', 'matikan', () => { globalThis.cadanganUji = true; }); return true;")
k = None
for _ in range(20):
    k = ev("return globalThis.cadanganUji;")
    if k is True: break
    time.sleep(0.25)
cek("menu daya: sambutan gagal -> kembali ke aksi bawaan GNOME", k is True, k)

# --- Memo hidup: jendela uji, digeser, maximize, izin, kursor -----------------
JENDELA = os.path.join(R, "tests", "gnome", "jendela-uji.js")
WJ = "const w = global.display.list_all_windows().find(x => x.get_title() === 'Jendela Uji Memo');"
daemon2 = subprocess.Popen([sys.executable, f"{R}/bin/memo-agen.py"], env=env)
tunggu(lambda k: k["hidup"])
jw = subprocess.Popen(["gjs", "-m", JENDELA, "Jendela Uji Memo"], env=envG, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for _ in range(40):
    if ev(WJ + "return !!w;") is True: break
    time.sleep(0.25)
ev(WJ + "w.move_resize_frame(true, 300, 420, 700, 380); return true;")
ev("memoUji.geserKursor(1500, 100); const i = memoUji.island(); i.menu.close(); i._kabarTerakhir = 0; return true;")
ev(H + "h.setAktif(true); return true;")
k = tunggu_hidup(lambda k: k["luar"] and k["keadaan"] in ("berdiri", "ngintip"), 10)
cek("Memo keluar lagi sesudah dinyalakan", k.get("luar") is True, k)
time.sleep(2)   # pikiran mengenal jendela uji dulu, supaya tidak "menoleh" di tengah uji
wid = ev(WJ + "return w.get_id();")
ev(H + "h._pikiran = {...h._pikiran, kegiatan: 'melamun', sisaMs: 1e9}; "
   f"h._pergiKe({{jenis: 'titik', x: 600, y: 420, jendelaId: {wid}}}); return true;")
k = tunggu_hidup(lambda k: k["keadaan"] == "berdiri" and k["pijakan"] == wid, 8)
cek("Memo pindah ke atas jendela uji", k.get("keadaan") == "berdiri" and k.get("pijakan") == wid and k.get("y") == 420, k)
di_atas = ev(H + WJ + "const a = global.window_group.get_children(); "
             "return a.indexOf(h.actor) === a.indexOf(w.get_compositor_private()) + 1;")
cek("Memo diselipkan tepat di atas jendela pijakannya", k.get("induk") == "jendela" and di_atas is True, (k, di_atas))
potret("30-hidup-jendela", (0, 0, 1600, 900))
ev(WJ + "w.move_frame(true, 340, 440); return true;")
k = tunggu_hidup(lambda k: k["pijakan"] == wid and k["y"] == 440, 4)
cek("jendela digeser pelan -> Memo ikut terbawa", k.get("pijakan") == wid and k.get("y") == 440, k)

jm = subprocess.Popen(["gjs", "-m", JENDELA, "Jendela Maksimal", "--maksimal"], env=envG, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
k = tunggu_hidup(lambda k: k["keadaan"] == "ngintip" and k["tepi"] == "layar", 10)
cek("jendela aktif dimaksimalkan -> Memo ngintip dari tepi layar", k.get("keadaan") == "ngintip" and k.get("tepi") == "layar", k)
potret("31-hidup-ngintip", (0, 0, 1600, 900))
jm.kill(); jm.wait(5)

pr = hook({**gb, "session_id": "ses-hidup", "hook_event_name": "PermissionRequest", "tool_name": "Bash",
           "tool_input": {"command": "ls"}}, latar=True)
k = tunggu_hidup(lambda k: not k["luar"], 5)
cek("izin agen -> Memo pulang ke island", k.get("luar") is False and k.get("redup") == 255, k)
ev("memoUji.island().jawabIzin('deny'); return true;")
pr.stdout.read(); pr.wait(5)

ev("const i = memoUji.island(); i.menu.close(); i._kabarTerakhir = 0; return true;")
k = tunggu_hidup(lambda k: k["luar"] and k["keadaan"] in ("berdiri", "ngintip"), 10)
mx, my = k.get("x", 0), k.get("y", 0)
ev(f"memoUji.geserKursor({mx}, {my - 36}); return true;")
k = tunggu_hidup(lambda k: ((k["x"] - mx) ** 2 + (k["y"] - my) ** 2) ** 0.5 > 150, 6)
cek("kursor mendekat -> Memo menyingkir", ((k.get("x", mx) - mx) ** 2 + (k.get("y", my) - my) ** 2) ** 0.5 > 150, (mx, my, k))

ev(H + "h.setAktif(false); return true;")
jw.kill(); jw.wait(5)
daemon2.terminate(); daemon2.wait(5)
log = open(f"{T}/shell.log", errors="ignore").read()
# "pakai dialog bawaan" sengaja dipicu uji cadangan menu daya di atas.
galat = [b for b in log.splitlines() if ("JS ERROR" in b or ("dynamic-island" in b and "CRITICAL" in b)) and "pakai dialog bawaan" not in b]
cek("tidak ada JS ERROR / CRITICAL dynamic-island di log shell", not galat, galat[:5])
cek("tidak ada galat Memo hidup di log shell", "[dynamic-island] hidup:" not in log)
print(f"\n{sum(hasil)} lolos, {len(hasil) - sum(hasil)} gagal")
print(f"tangkapan layar: {T}/*.png")
sys.exit(0 if all(hasil) else 1)
