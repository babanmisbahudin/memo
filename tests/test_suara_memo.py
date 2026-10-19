"""Uji suara Memo (bin/memo): efek tiny robot dan cache-nya — tanpa internet
dan tanpa speaker. edge-tts diganti skrip palsu yang membuat nada sinus, jadi
tidak ada teks yang dikirim ke mana pun; tidak ada yang dibunyikan
(--hanya-cache); bus sesi diarahkan ke alamat kosong supaya ekspresi Memo
yang sungguhan tidak tersentuh."""
import array
import os
import pathlib
import subprocess
import sys
import tempfile

AKAR = pathlib.Path(__file__).resolve().parent.parent
MEMO = AKAR / "bin" / "memo"

gagal = lolos = 0


def cek(label, syarat):
    global gagal, lolos
    if syarat:
        lolos += 1
    else:
        gagal += 1
        print(f"GAGAL | {label}")


def bawaan(nama):
    r = subprocess.run(["bash", "-c", f'eval "$(grep -E "^{nama}=" "$0")"; printf %s "${nama}"', str(MEMO)],
                       capture_output=True, text=True, env={"PATH": os.environ["PATH"]})
    return r.stdout


def nada(berkas):
    """Frekuensi (Hz) nada sinus dalam berkas audio: lintasan naik dari bawah
    -ambang ke atas +ambang per detik (histeresis meredam kresek 9-bit)."""
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(berkas), "-f", "s16le", "-ac", "1", "-ar", "16000", "-"],
                         capture_output=True).stdout
    x = array.array("h", raw)
    x = x[len(x) // 4: 3 * len(x) // 4]
    ambang = max(abs(v) for v in x) * 0.3
    naik, bawah = 0, False
    for v in x:
        if v < -ambang:
            bawah = True
        elif v > ambang and bawah:
            naik, bawah = naik + 1, False
    return naik * 16000 / len(x)


EFEK = bawaan("EFEK_ROBOT")
cek("suara bawaan Gadis (tanpa hidup.json)", bawaan("SUARA_BAWAAN") == "id-ID-GadisNeural")
cek("efek tiny robot: nada naik 1,2x beserta formannya", "rubberband=pitch=1.2:formant=shifted" in EFEK)

with tempfile.TemporaryDirectory() as d:
    d = pathlib.Path(d)
    # Efek bawaan bisa dijalankan ffmpeg mesin ini (filter rubberband dkk ada)
    # dan benar-benar menaikkan nada: sinus 200 Hz -> ±240 Hz.
    asal, hasil = d / "asal.wav", d / "hasil.mp3"
    subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=200:duration=2:sample_rate=24000",
                    str(asal)], check=True)
    r = subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(asal), "-af", EFEK, str(hasil)], capture_output=True, text=True)
    cek(f"efek bawaan diterima ffmpeg ({r.stderr.strip()[:100]})", r.returncode == 0 and hasil.stat().st_size > 0)
    if r.returncode == 0:
        f = nada(hasil)
        cek(f"nada naik ±1,2x (200 Hz -> {f:.0f} Hz)", 225 <= f <= 255)

    # edge-tts palsu: mencatat tiap panggilan, menulis sinus sebagai mp3.
    palsu, log = d / "edge-tts", d / "panggilan"
    palsu.write_text(f"""#!/bin/sh
echo "$*" >> {log}
while [ $# -gt 0 ]; do [ "$1" = --write-media ] && keluar="$2"; shift; done
exec ffmpeg -y -v error -f lavfi -i sine=frequency=200:duration=1:sample_rate=24000 "$keluar"
""")
    palsu.chmod(0o755)
    cache = d / "cache"

    def siapkan(teks, **env_lain):
        # Konfig kosong bawaan: hidup.json asli pengguna tidak ikut menentukan suara.
        env = dict(os.environ, MEMO_EDGE_TTS=str(palsu), MEMO_CACHE=str(cache), XDG_CONFIG_HOME=str(d / "kosong"),
                   DBUS_SESSION_BUS_ADDRESS="unix:path=/nonexistent")
        env.update(env_lain)
        return subprocess.run([str(MEMO), "--hanya-cache", teks], capture_output=True, text=True, env=env, timeout=60)

    # Jenis kelamin dari hidup.json: laki-laki -> Ardi, perempuan -> Gadis.
    konfig = d / "konfig" / "memo"
    konfig.mkdir(parents=True)
    for kelamin, harap in [("laki-laki", "ArdiNeural"), ("perempuan", "GadisNeural")]:
        (konfig / "hidup.json").write_text('{"aktif":true,"hayat":{"nama":"Memo","kelamin":"%s"}}' % kelamin)
        siapkan("tes kelamin", XDG_CONFIG_HOME=str(d / "konfig"))
        cek(f"suara ikut jenis kelamin {kelamin}", log.read_text().splitlines()[-1].startswith(f"--voice id-ID-{harap}"))
    log.write_text("")
    for f in cache.glob("*.mp3"):
        f.unlink()
    r = siapkan("halo")
    berkas = sorted(cache.glob("*.mp3"))
    cek(f"--hanya-cache membuat satu berkas ({r.stderr.strip()[:100]})", r.returncode == 0 and len(berkas) == 1)
    cek("berkas cache sudah berefek (nada naik)", berkas and 225 <= nada(berkas[0]) <= 255)
    cek("edge-tts dipanggil dengan suara Gadis", "--voice id-ID-GadisNeural" in log.read_text())
    siapkan("halo")
    cek("kalimat sama: dari cache, edge-tts tidak dipanggil lagi", len(log.read_text().splitlines()) == 1)
    siapkan("halo", MEMO_EFEK="highpass=f=300")
    cek("efek berganti: dibuat ulang (efek bagian kunci cache)",
        len(log.read_text().splitlines()) == 2 and len(list(cache.glob("*.mp3"))) == 2)
    siapkan("halo", MEMO_EFEK="filter_tidak_ada")
    cek("efek rusak: tetap tersimpan tanpa efek, tidak bisu", len(list(cache.glob("*.mp3"))) == 3)

print(f"\n{lolos} lolos, {gagal} gagal")
sys.exit(1 if gagal else 0)
