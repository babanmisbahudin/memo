"""Skenario uji layar login (GDM) & layar kunci Memo; dipanggil uji-login.sh.

  skenario_login.py memo-uji-gdm   layar login GDM dengan tema Memo
  skenario_login.py user           layar kunci dengan extension memo-kunci

Alur GDM sungguhan (sesi greeter, PAM) tidak ada di bus palsu, jadi keadaan
dialog (daftar pengguna, prompt sandi) digerakkan lewat metode internalnya.
Yang diuji tampilannya: CSS dan aktor hiasan, bukan logika GDM.
"""
import json
import os
import subprocess
import sys
import time
from urllib.parse import unquote

MODE = sys.argv[1]
T = os.environ["MEMO_UJI_DIR"]
hasil = []


def cek(label, syarat, info=""):
    hasil.append(bool(syarat))
    print(f"{'OK   ' if syarat else 'GAGAL'} [{MODE}] {label}" + ("" if syarat else f"  [{info}]"))


for _ in range(100):
    if os.path.exists(f"{T}/bus") and open(f"{T}/bus").read().strip():
        break
    time.sleep(0.1)
env = dict(os.environ, DBUS_SESSION_BUS_ADDRESS=open(f"{T}/bus").read().strip())


def ev(js):
    r = subprocess.run(["gdbus", "call", "--session", "--dest", "org.gnome.Shell", "--object-path", "/org/gnome/Shell",
                        "--method", "org.gnome.Shell.Eval", f"encodeURIComponent(JSON.stringify((() => {{ {js} }})()))"],
                       env=env, capture_output=True, text=True)
    out = r.stdout.strip()
    if not out.startswith("(true"):
        return {"__galat": out or r.stderr}
    isi = unquote(out[len("(true, '"):-2].strip('"'))
    try:
        return json.loads(isi)
    except ValueError:
        return {"__mentah": isi}


def potret(nama):
    subprocess.run(["gdbus", "call", "--session", "--dest", "org.gnome.Shell.Screenshot", "--object-path",
                    "/org/gnome/Shell/Screenshot", "--method", "org.gnome.Shell.Screenshot.Screenshot",
                    "false", "false", f"{T}/{nama}.png"], env=env, capture_output=True)


for _ in range(120):
    if ev("return typeof memoUji;") == "object":
        break
    time.sleep(0.25)
else:
    cek("shell uji siap (memoUji)", False, open(f"{T}/shell.log", errors="ignore").read()[-600:])
    sys.exit(1)

# Pencari aktor menurut kelas gaya, dan berkas gambar latar dari tema.
CARI = """const cari = (a, k) => { if (a.has_style_class_name?.(k)) return a;
  for (const c of a.get_children()) { const x = cari(c, k); if (x) return x; } return null; };
const gambar = a => { const f = a?.get_theme_node().get_background_image(); return f ? f.get_uri() : ''; };
const warna = a => { const c = a.get_theme_node().get_background_color(); return [c.red, c.green, c.blue, c.alpha]; };
"""

BAGIAN = os.environ.get("UJI_BAGIAN", "")
LATAR = os.environ.get("UJI_LATAR", "")
SUDUT = "const sudut = a => { const n = a.get_theme_node(); return [n.get_border_radius(0), n.get_border_width(0)]; };"


def bagian_sekarang():
    j = time.localtime().tm_hour
    return "pagi" if 4 <= j < 11 else "siang" if 11 <= j < 15 else "sore" if 15 <= j < 18 else "malam"


if MODE == "memo-uji-gdm":
    k = ev("const m = memoUji.Main; return [m.sessionMode.currentMode, m.sessionMode.isGreeter, String(m.screenShield?._dialog?.constructor?.name)];")
    cek("shell berjalan sebagai layar login GDM", k == ["memo-uji-gdm", True, "LoginDialog"], k)
    k = ev(CARI + "return warna(memoUji.Main.screenShield._lockDialogGroup);")
    cek("di bawah pemandangan: hitam pekat", k == [0, 0, 0, 255], k)
    k = ev(CARI + "return gambar(memoUji.Main.screenShield._dialog);")
    cek(f"pemandangan piksel = tautan latar dari latar-login.sh ({BAGIAN})",
        k == "file://" + LATAR and os.path.realpath(LATAR).endswith(f"/latar-{BAGIAN}.png"), k)
    k = ev(CARI + SUDUT + """const d = memoUji.Main.screenShield._dialog; const u = d._userManager.list_users()[0];
        d._userList.addUser(u); d._authPrompt.hide(); d._showUserList();
        const item = d._userList._items.get(u.get_user_name());
        return {n: d._userList._items.size, nama: u.get_real_name(), kartu: warna(item), sudut: sudut(item), avatar: gambar(cari(item, 'user-icon'))};""")
    cek("daftar pengguna: satu kartu dari AccountsService palsu", k.get("n") == 1 and k.get("nama") == "Baban Misbahudin", k)
    cek("kartu pengguna CRT: hitam fosfor, siku, bingkai 2px", (k.get("kartu") or [])[:3] == [5, 6, 8] and k.get("sudut") == [0, 2], k)
    cek("avatar bawaan diganti Memo piksel", str(k.get("avatar")).endswith("/memo-avatar.png"), k)
    time.sleep(0.6)
    potret("1-gdm-daftar")
    k = ev(CARI + SUDUT + """const d = memoUji.Main.screenShield._dialog; const u = d._userManager.list_users()[0];
        d._hideUserList(); d._authPrompt.setUser(u); d._authPrompt._updateEntry(true);
        d._authPrompt.setQuestion('Password'); d._authPrompt.updateSensitivity(true); d._showPrompt();
        const e = d._authPrompt._entry;
        return {kolom: sudut(e), kartu: sudut(d._authPrompt._inputWell), luar: warna(d._authPrompt), avatar: gambar(cari(d._authPrompt, 'user-icon')), latar: warna(e)};""")
    cek("kolom sandi: baris terminal hitam bersudut siku", k.get("kolom") == [0, 1] and k.get("latar") == [0, 0, 0, 255], k)
    cek("kotak sandi = kartu CRT; avatar & nama di luar kartu", k.get("kartu") == [0, 2] and (k.get("luar") or [1])[3] == 0, k)
    cek("prompt sandi: avatar Memo", str(k.get("avatar")).endswith("/memo-avatar.png"), k)
    time.sleep(0.8)
    potret("2-gdm-sandi")
else:
    k = ev("return [memoUji.Main.sessionMode.currentMode, memoUji.Main.extensionManager.lookup('memo-kunci@local')?.state];")
    cek("extension memo-kunci aktif di sesi user", k == ["user", 1], k)
    ev("memoUji.Main.screenShield.lock(false); return true;")
    time.sleep(2.5)
    ev("memoUji.geserKursor(700, 500); memoUji.geserKursor(720, 520); return true;")
    time.sleep(1.5)
    k = ev(CARI + """const m = memoUji.Main; const d = m.screenShield._dialog; const k = d._memoKunci ?? {}; const anak = d.get_children();
        return {mode: m.sessionMode.currentMode, aktif: m.extensionManager.lookup('memo-kunci@local')?.state,
          bagian: k.bagian, kelas: d.has_style_class_name('memo-' + k.bagian), langit: gambar(k.langit),
          ukuran: k.langit ? [k.langit.width, k.langit.height] : null,
          urutan: [anak.indexOf(d._backgroundGroup), anak.indexOf(k.langit), anak.indexOf(k.titik)],
          titik: k.titik?.get_children().filter(a => a.visible).length ?? 0,
          reaktif: [k.langit?.reactive, k.titik?.reactive, k.waktu?.actor.reactive, k.tanggal?.actor.reactive,
            ...(k.titik?.get_children() ?? []).map(a => a.reactive)].some(r => r !== false),
          jam: k.waktu?.text, piksel: Boolean(k.waktu?._piksel && k.tanggal?._piksel), jamAsli: d._clock._time.text, asliTampil: d._clock._time.visible || d._clock._date.visible,
          pertama: d._clock.get_first_child() === k.waktu?.actor, tanggal: k.tanggal?.text};""")
    cek("terkunci: mode unlock-dialog, memo-kunci tetap aktif", k.get("mode") == "unlock-dialog" and k.get("aktif") == 1, k)
    cek(f"langit menurut jam sekarang ({bagian_sekarang()}) + kelas warna pada dialog",
        k.get("bagian") == bagian_sekarang() and k.get("kelas") and str(k.get("langit")).endswith(f"/latar-{bagian_sekarang()}.png"), k)
    u = k.get("urutan") or [0, 0, 0]
    cek("pemandangan menutupi latar blur, titik animasi di atasnya", k.get("ukuran") == [1600, 900] and u[1] == u[0] + 1 and u[2] == u[1] + 1, k)
    cek("titik animasi tampil", k.get("titik", 0) > 0, k)
    cek("hiasan layar kunci tidak reaktif", k.get("reaktif") is False, k)
    cek("jam huruf piksel = jam bawaan, label bawaan disembunyikan",
        k.get("jam") == k.get("jamAsli") and k.get("piksel") and k.get("pertama") and k.get("asliTampil") is False, k)
    cek("tanggal berbahasa Indonesia", str(k.get("tanggal")).split(",")[0] in
        ["minggu", "senin", "selasa", "rabu", "kamis", "jumat", "sabtu"], k)
    sebelum = ev("const k = memoUji.Main.screenShield._dialog._memoKunci; return [k.f, k.titik.get_children().map(a => [a.x, a.y, a.opacity, a.visible])];")
    time.sleep(1)
    sesudah = ev("const k = memoUji.Main.screenShield._dialog._memoKunci; return [k.f, k.titik.get_children().map(a => [a.x, a.y, a.opacity, a.visible])];")
    cek("animasi berjalan ~12 bingkai/dtk", 8 <= sesudah[0] - sebelum[0] <= 16 and sesudah[1] != sebelum[1], [sebelum[0], sesudah[0]])
    for i, b in enumerate(["pagi", "siang", "sore", "malam"]):
        ev(f"memoUji.Main.extensionManager.lookup('memo-kunci@local').stateObj._aturBagian('{b}'); return true;")
        time.sleep(0.7)
        potret(f"1-kunci-{i + 1}-{b}")
    k = ev(CARI + SUDUT + """const d = memoUji.Main.screenShield._dialog; d._showPrompt();
        return {avatar: gambar(cari(d._promptBox, 'user-icon')), kolom: sudut(d._authPrompt._entry)};""")
    cek("prompt layar kunci: avatar Memo + kolom siku", str(k.get("avatar")).endswith("/memo-avatar.png") and k.get("kolom") == [0, 1], k)
    time.sleep(1)
    potret("2-kunci-sandi")
    k = ev("""const s = memoUji.Main.extensionManager.lookup('memo-kunci@local').stateObj; const d = memoUji.Main.screenShield._dialog;
        s.disable(); return [d._memoKunci === undefined, d._clock.get_children().length, d._clock._time.visible && d._clock._date.visible,
          ['pagi', 'siang', 'sore', 'malam'].some(b => d.has_style_class_name('memo-' + b)), s._id];""")
    cek("disable() melepas hiasan & memulihkan jam bawaan", k == [True, 3, True, False, 0], k)
    ev("memoUji.Main.extensionManager.lookup('memo-kunci@local').stateObj.enable(); return true;")
    time.sleep(0.5)
    k = ev("const d = memoUji.Main.screenShield._dialog; return [Boolean(d._memoKunci?.langit), d._clock.get_children().length];")
    cek("enable() memasang lagi", k == [True, 5], k)
    ev("memoUji.Main.screenShield.deactivate(false); return true;")
    time.sleep(2)
    k = ev("""const m = memoUji.Main; const s = m.extensionManager.lookup('memo-kunci@local');
        return [m.sessionMode.currentMode, m.screenShield._dialog === null, s?.state, s?.stateObj._id, s?.stateObj._k];""")
    cek("dibuka: kembali ke sesi user, timer animasi berhenti", k == ["user", True, 1, 0, None], k)

log = open(f"{T}/shell.log", errors="ignore").read()
# OpenSession memang ditolak bus palsu (tidak ada sesi login sungguhan).
galat = [b for b in log.splitlines() if "JS ERROR" in b and "tidak ada sesi login" not in b]
cek("tidak ada JS ERROR lain di log shell", not galat, galat[:4])
alamat = open(f"{T}/sistem").read().strip()
lingkungan = []
for p in subprocess.run(["pgrep", "-x", "gnome-shell"], capture_output=True, text=True).stdout.split():
    try:
        isi = open(f"/proc/{p}/environ", "rb").read().decode(errors="ignore").split("\0")
    except OSError:
        continue
    if f"MEMO_UJI_DIR={T}" in isi:
        lingkungan = isi
cek("shell uji memakai bus sistem palsu, bukan bus sistem asli",
    f"DBUS_SYSTEM_BUS_ADDRESS={alamat}" in lingkungan and alamat, alamat)
print(f"[{MODE}] {sum(hasil)} lolos, {len(hasil) - sum(hasil)} gagal; tangkapan layar: {T}/*.png")
sys.exit(0 if all(hasil) else 1)
