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

if MODE == "memo-uji-gdm":
    k = ev("const m = memoUji.Main; return [m.sessionMode.currentMode, m.sessionMode.isGreeter, String(m.screenShield?._dialog?.constructor?.name)];")
    cek("shell berjalan sebagai layar login GDM", k == ["memo-uji-gdm", True, "LoginDialog"], k)
    k = ev(CARI + "return warna(memoUji.Main.screenShield._lockDialogGroup);")
    cek("latar layar login hitam pekat", k == [0, 0, 0, 255], k)
    k = ev(CARI + """const d = memoUji.Main.screenShield._dialog; const u = d._userManager.list_users()[0];
        d._userList.addUser(u); d._authPrompt.hide(); d._showUserList();
        const item = d._userList._items.get(u.get_user_name());
        return {n: d._userList._items.size, nama: u.get_real_name(), kartu: warna(item), avatar: gambar(cari(item, 'user-icon'))};""")
    cek("daftar pengguna: satu kartu dari AccountsService palsu", k.get("n") == 1 and k.get("nama") == "Baban Misbahudin", k)
    cek("kartu pengguna #16171b", k.get("kartu") == [0x16, 0x17, 0x1b, 255], k)
    cek("avatar bawaan diganti Memo piksel", str(k.get("avatar")).endswith("/memo-avatar.png"), k)
    time.sleep(0.6)
    potret("1-gdm-daftar")
    k = ev(CARI + """const d = memoUji.Main.screenShield._dialog; const u = d._userManager.list_users()[0];
        d._hideUserList(); d._authPrompt.setUser(u); d._authPrompt._updateEntry(true);
        d._authPrompt.setQuestion('Password'); d._authPrompt.updateSensitivity(true); d._showPrompt();
        const e = d._authPrompt._entry; const n = e.get_theme_node();
        return {sudut: n.get_border_radius(0), avatar: gambar(cari(d._authPrompt, 'user-icon')), latar: warna(e)};""")
    cek("kolom sandi berbentuk pil", (k.get("sudut") or 0) >= 15, k)
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
    k = ev(CARI + """const m = memoUji.Main; const d = m.screenShield._dialog; const [redup, wajah] = d._memoKunci ?? [];
        return {mode: m.sessionMode.currentMode, aktif: m.extensionManager.lookup('memo-kunci@local')?.state,
          redup: redup ? warna(redup) : null, redupReaktif: redup?.reactive, ukuran: redup ? [redup.width, redup.height] : null,
          wajah: gambar(wajah), pertama: d._clock.get_first_child() === wajah, wajahReaktif: wajah?.reactive};""")
    cek("terkunci: mode unlock-dialog, memo-kunci tetap aktif", k.get("mode") == "unlock-dialog" and k.get("aktif") == 1, k)
    cek("peredup hitam 60% menutupi layar", k.get("redup") == [0, 0, 0, 153] and k.get("ukuran") == [1600, 900], k)
    cek("Memo tidur di atas jam", str(k.get("wajah")).endswith("/memo-tidur.png") and k.get("pertama"), k)
    cek("hiasan layar kunci tidak reaktif", k.get("redupReaktif") is False and k.get("wajahReaktif") is False, k)
    potret("1-kunci-jam")
    k = ev(CARI + """const d = memoUji.Main.screenShield._dialog; d._showPrompt();
        return {avatar: gambar(cari(d._promptBox, 'user-icon')), sudut: d._authPrompt._entry.get_theme_node().get_border_radius(0)};""")
    cek("prompt layar kunci: avatar Memo + kolom pil", str(k.get("avatar")).endswith("/memo-avatar.png") and (k.get("sudut") or 0) >= 15, k)
    time.sleep(1)
    potret("2-kunci-sandi")
    k = ev("""const s = memoUji.Main.extensionManager.lookup('memo-kunci@local').stateObj; const d = memoUji.Main.screenShield._dialog;
        s.disable(); const sesudah = [d._memoKunci === undefined, d._clock.get_children().length];
        s.enable(); return [...sesudah, (d._memoKunci ?? []).length];""")
    cek("disable() melepas hiasan, enable() memasang lagi", k == [True, 3, 2], k)
    ev("memoUji.Main.screenShield.deactivate(false); return true;")
    time.sleep(2)
    k = ev("const m = memoUji.Main; return [m.sessionMode.currentMode, m.screenShield._dialog === null, m.extensionManager.lookup('memo-kunci@local')?.state];")
    cek("dibuka: kembali ke sesi user, extension tetap aktif", k == ["user", True, 1], k)

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
