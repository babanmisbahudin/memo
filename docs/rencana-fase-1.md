# Rencana Implementasi Fase 1 — Wajah Ekspresif

> **Untuk pekerja agentik:** SUB-SKILL WAJIB: pakai
> `superpowers:subagent-driven-development` (disarankan) atau
> `superpowers:executing-plans` untuk mengerjakan rencana ini task demi task.
> Langkah memakai checkbox (`- [ ]`) untuk penanda kemajuan.

**Goal:** Maskot robot di Dynamic Island punya delapan ekspresi bermata Cairo
yang bisa dikendalikan dari luar lewat D-Bus, tanpa AI apa pun.

**Architecture:** Logika wajah dipisah jadi modul murni (`face.js`) yang tidak
mengimpor St sama sekali, sehingga bisa diuji dan dirender ke PNG dengan `gjs`
polos tanpa menjalankan GNOME Shell. Widget (`robotFace.js`) dan layanan D-Bus
(`robotService.js`) jadi lapisan tipis di atasnya. Tiap ekspresi adalah satu set
angka; transisi = interpolasi angka, bukan animasi khusus per pasangan ekspresi.

**Tech Stack:** GJS ESM, GNOME Shell 50.1, St, Clutter, Cairo, Gio D-Bus.

**Spec:** `~/Projects/asisten-robot/docs/fase-1-wajah-ekspresif.md`
**Arsitektur keseluruhan:** `~/Projects/asisten-robot/docs/arsitektur.md`

## Global Constraints

- Direktori kerja: `~/.local/share/gnome-shell/extensions/dynamic-island@local/`
- GNOME Shell 50.1 di Wayland. Modul JS di-cache: **perubahan kode tidak bisa
  di-reload dengan disable/enable**, hanya logout/login. Karena itu semua
  pengujian dilakukan di sesi headless.
- `face.js` **tidak boleh** mengimpor `gi://St`, `gi://Shell`, atau
  `resource:///org/gnome/shell/...`. Kalau itu terjadi, lapis tes 1 dan 2 mati.
- Nama D-Bus: `org.himisbah.Robot`, path `/org/himisbah/Robot`
- Kanvas wajah: 44×26 px
- Extension tidak boleh pernah melempar error yang tidak tertangkap — satu
  exception yang lolos bisa merusak seluruh sesi GNOME
- Bahasa teks yang tampak pengguna: Indonesia. Nama identifier di kode: Inggris.

## Perintah pengujian yang dipakai berulang

Jalankan dari direktori extension.

Tes unit:
```bash
cd ~/.local/share/gnome-shell/extensions/dynamic-island@local
gjs -m tests/test-face.js
```

Render visual:
```bash
cd ~/.local/share/gnome-shell/extensions/dynamic-island@local
gjs -m tests/render-expressions.js /tmp/ekspresi
```

Sesi headless (pola yang sudah terbukti di fase Dynamic Island sebelumnya):
```bash
# hentikan sesi tes lama — JANGAN pakai pkill -f, pola itu ikut membunuh
# shell perintahnya sendiri
for p in $(pgrep -f "virtual-monitor 1280x720"); do [ "$p" != "$$" ] && kill "$p" 2>/dev/null; done
sleep 2
rm -f /tmp/di-test.log /tmp/di-bus.txt
ADDR=$(dbus-daemon --session --fork --print-address)
echo "$ADDR" > /tmp/di-bus.txt
DBUS_SESSION_BUS_ADDRESS="$ADDR" setsid gnome-shell --headless --virtual-monitor 1280x720 > /tmp/di-test.log 2>&1 &
disown
sleep 14
grep -i "dynamic-island" /tmp/di-test.log
grep -iE "JS ERROR|Extension .*Error" /tmp/di-test.log
```

---

### Task 1: Modul parameter wajah

Membuat model data ekspresi dan interpolasinya. Tidak ada yang tergambar di task
ini — hanya angka, supaya bisa diuji tanpa GNOME Shell.

**Files:**
- Create: `face.js`
- Create: `tests/test-face.js`

**Interfaces:**
- Produces:
  - `NEUTRAL` — objek berisi kedelapan kunci parameter dengan nilai default
  - `EXPRESSIONS` — objek `{ [nama: string]: Partial<Params> }`, 8 entri
  - `resolveExpression(name: string): Params | null`
  - `lerpParams(from: Params, to: Params, t: number): Params`

- [ ] **Step 1: Siapkan repo git supaya tiap task bisa di-commit**

```bash
cd ~/.local/share/gnome-shell/extensions/dynamic-island@local
git init
printf 'tests/out/\n' > .gitignore
git add -A
git commit -m "chore: snapshot extension sebelum fase wajah ekspresif"
```

- [ ] **Step 2: Tulis tes yang gagal**

Buat `tests/test-face.js`:

```js
import system from 'system';

import { NEUTRAL, EXPRESSIONS, resolveExpression, lerpParams } from '../face.js';

let failed = 0;
let passed = 0;

function check(label, condition) {
    if (condition) {
        passed++;
    } else {
        failed++;
        printerr(`GAGAL: ${label}`);
    }
}

function near(a, b) {
    return Math.abs(a - b) < 1e-9;
}

const KEYS = ['open', 'curve', 'width', 'gazeX', 'gazeY', 'tilt', 'glow', 'hue', 'cross'];

check('NEUTRAL punya semua kunci',
    KEYS.every(k => typeof NEUTRAL[k] === 'number'));

check('ada 8 ekspresi', Object.keys(EXPRESSIONS).length === 8);

for (const name of ['netral', 'mendengar', 'berpikir', 'bicara', 'senang', 'bingung', 'error', 'tidur'])
    check(`ekspresi "${name}" terdaftar`, name in EXPRESSIONS);

for (const name of Object.keys(EXPRESSIONS)) {
    const p = resolveExpression(name);
    check(`"${name}" resolve ke objek lengkap`,
        p !== null && KEYS.every(k => typeof p[k] === 'number' && Number.isFinite(p[k])));
}

check('nama tak dikenal mengembalikan null', resolveExpression('ngaco') === null);
check('nama kosong mengembalikan null', resolveExpression('') === null);

const a = resolveExpression('netral');
const b = resolveExpression('senang');

check('lerp t=0 sama dengan awal', KEYS.every(k => near(lerpParams(a, b, 0)[k], a[k])));
check('lerp t=1 sama dengan akhir', KEYS.every(k => near(lerpParams(a, b, 1)[k], b[k])));
check('lerp t=0.5 di tengah',
    KEYS.every(k => near(lerpParams(a, b, 0.5)[k], (a[k] + b[k]) / 2)));
check('lerp menjepit t negatif', KEYS.every(k => near(lerpParams(a, b, -5)[k], a[k])));
check('lerp menjepit t lebih dari 1', KEYS.every(k => near(lerpParams(a, b, 9)[k], b[k])));

check('error berwarna merah', resolveExpression('error').hue === 0);
check('error berbentuk silang', resolveExpression('error').cross === 1);
check('tidur hampir terpejam', resolveExpression('tidur').open < 0.15);
check('senang melengkung ke atas', resolveExpression('senang').curve > 0.5);

print(`${passed} lolos, ${failed} gagal`);
if (failed > 0)
    system.exit(1);
```

- [ ] **Step 3: Jalankan tes, pastikan gagal**

```bash
cd ~/.local/share/gnome-shell/extensions/dynamic-island@local
gjs -m tests/test-face.js
```

Diharapkan: gagal dengan error modul tidak ditemukan (`face.js` belum ada).

- [ ] **Step 4: Tulis implementasi minimal**

Buat `face.js`:

```js
// Logika wajah murni. TIDAK BOLEH mengimpor St/Shell/resource:// —
// modul ini harus tetap bisa dijalankan gjs polos tanpa GNOME Shell.

export const NEUTRAL = {
    open: 1,      // 0 = terpejam, 1 = terbuka penuh
    curve: 0,     // -1 sedih, 0 datar, 1 busur senang
    width: 1,     // pengali lebar/jarak mata
    gazeX: 0,     // -1 kiri, 1 kanan
    gazeY: 0,     // -1 atas, 1 bawah
    tilt: 0,      // satu mata naik, satu turun
    glow: 0.55,   // kuat cahaya sekeliling mata
    hue: 205,     // 205 biru-putih, 0 merah
    cross: 0,     // kadar bentuk silang
};

export const EXPRESSIONS = {
    netral: {},
    mendengar: { open: 1.2, width: 1.1, glow: 0.95 },
    berpikir: { open: 0.55, gazeX: -0.45, gazeY: -0.7, glow: 0.5 },
    bicara: { open: 0.8, curve: 0.45, glow: 0.8 },
    senang: { open: 0.4, curve: 1, glow: 0.9 },
    bingung: { open: 1.1, width: 1.15, tilt: 0.8 },
    error: { open: 1, glow: 1, hue: 0, cross: 1 },
    tidur: { open: 0.06, curve: 0.2, glow: 0.25 },
};

export function resolveExpression(name) {
    const delta = Object.prototype.hasOwnProperty.call(EXPRESSIONS, name)
        ? EXPRESSIONS[name]
        : null;
    if (!delta)
        return null;
    return { ...NEUTRAL, ...delta };
}

export function lerpParams(from, to, t) {
    const k = Math.max(0, Math.min(1, t));
    const out = {};
    for (const key of Object.keys(NEUTRAL))
        out[key] = from[key] + (to[key] - from[key]) * k;
    return out;
}
```

- [ ] **Step 5: Jalankan tes, pastikan lolos**

```bash
cd ~/.local/share/gnome-shell/extensions/dynamic-island@local
gjs -m tests/test-face.js
```

Diharapkan: `N lolos, 0 gagal` dan exit code 0.

- [ ] **Step 6: Commit**

```bash
cd ~/.local/share/gnome-shell/extensions/dynamic-island@local
git add face.js tests/test-face.js
git commit -m "feat: model parameter ekspresi wajah robot"
```

---

### Task 2: Menggambar wajah dengan Cairo

**Files:**
- Modify: `face.js` (tambah fungsi gambar)
- Create: `tests/render-expressions.js`

**Interfaces:**
- Consumes: `NEUTRAL`, `EXPRESSIONS`, `resolveExpression` dari Task 1
- Produces: `drawFace(cr, width, height, params): void` — menggambar ke konteks
  Cairo yang sudah disiapkan pemanggil; tidak membersihkan latar, tidak memanggil
  `$dispose`, tidak menyimpan state apa pun antar panggilan

- [ ] **Step 1: Tulis skrip render yang gagal**

Buat `tests/render-expressions.js`:

```js
import cairo from 'gi://cairo';
import GLib from 'gi://GLib';
import { EXPRESSIONS, resolveExpression, drawFace } from '../face.js';

const SCALE = 6;               // diperbesar supaya bentuknya terlihat mata
const WIDTH = 44;
const HEIGHT = 26;

const outDir = ARGV[0] ?? '/tmp/ekspresi';
GLib.mkdir_with_parents(outDir, 0o755);

for (const name of Object.keys(EXPRESSIONS)) {
    const surface = new cairo.ImageSurface(cairo.Format.ARGB32, WIDTH * SCALE, HEIGHT * SCALE);
    const cr = new cairo.Context(surface);

    cr.scale(SCALE, SCALE);
    cr.setSourceRGBA(0.07, 0.07, 0.08, 1);
    cr.paint();

    drawFace(cr, WIDTH, HEIGHT, resolveExpression(name));

    cr.$dispose();
    const path = `${outDir}/${name}.png`;
    surface.writeToPNG(path);
    print(`ditulis: ${path}`);
}

print(`selesai, ${Object.keys(EXPRESSIONS).length} berkas`);
```

- [ ] **Step 2: Jalankan, pastikan gagal**

```bash
cd ~/.local/share/gnome-shell/extensions/dynamic-island@local
gjs -m tests/render-expressions.js /tmp/ekspresi
```

Diharapkan: gagal dengan `drawFace is not a function`.

- [ ] **Step 3: Implementasikan `drawFace`**

Tambahkan ke akhir `face.js` (dan tambahkan `import cairo from 'gi://cairo';`
di baris paling atas berkas — cairo tidak menarik St, jadi modul ini tetap murni):

```js
const EYE_RADIUS = 3.4;
const EYE_SPREAD = 7;
const GAZE_RANGE = 2.2;
const TILT_RANGE = 2.2;

function hueToRgb(hue) {
    const saturation = 0.8;
    const lightness = 0.88;
    const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const sector = ((hue % 360) + 360) % 360 / 60;
    const x = c * (1 - Math.abs((sector % 2) - 1));

    let base;
    if (sector < 1) base = [c, x, 0];
    else if (sector < 2) base = [x, c, 0];
    else if (sector < 3) base = [0, c, x];
    else if (sector < 4) base = [0, x, c];
    else if (sector < 5) base = [x, 0, c];
    else base = [c, 0, x];

    const m = lightness - c / 2;
    return base.map(v => v + m);
}

function roundedRect(cr, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    cr.newSubPath();
    cr.arc(x + width - r, y + r, r, -Math.PI / 2, 0);
    cr.arc(x + width - r, y + height - r, r, 0, Math.PI / 2);
    cr.arc(x + r, y + height - r, r, Math.PI / 2, Math.PI);
    cr.arc(x + r, y + r, r, Math.PI, 1.5 * Math.PI);
    cr.closePath();
}

// Bentuk mata digambar bertumpuk dengan alpha masing-masing, bukan dipilih
// dengan percabangan — percabangan keras membuat bentuk meloncat di tengah
// transisi antar ekspresi.
export function drawFace(cr, width, height, params) {
    const centerX = width / 2;
    const centerY = height / 2;
    const [r, g, b] = hueToRgb(params.hue);

    const crossWeight = Math.max(0, Math.min(1, params.cross));
    const arcWeight = Math.max(0, Math.min(1, params.curve)) * (1 - crossWeight);
    const plainWeight = Math.max(0, 1 - crossWeight - arcWeight);

    for (const side of [-1, 1]) {
        const x = centerX + side * EYE_SPREAD * params.width + params.gazeX * GAZE_RANGE;
        const y = centerY + params.gazeY * GAZE_RANGE + side * params.tilt * TILT_RANGE;

        if (params.glow > 0.01) {
            cr.setSourceRGBA(r, g, b, 0.3 * params.glow);
            cr.arc(x, y, EYE_RADIUS + 2.8 * params.glow, 0, 2 * Math.PI);
            cr.fill();
        }

        if (plainWeight > 0.01) {
            const eyeHeight = Math.max(0.7, EYE_RADIUS * 2 * params.open);
            cr.setSourceRGBA(r, g, b, plainWeight);
            roundedRect(cr, x - EYE_RADIUS, y - eyeHeight / 2,
                EYE_RADIUS * 2, eyeHeight, EYE_RADIUS);
            cr.fill();
        }

        if (arcWeight > 0.01) {
            cr.setSourceRGBA(r, g, b, arcWeight);
            cr.setLineWidth(2.1);
            cr.setLineCap(cairo.LineCap.ROUND);
            cr.newSubPath();
            cr.arc(x, y + EYE_RADIUS * 0.45, EYE_RADIUS + 0.7, Math.PI, 2 * Math.PI);
            cr.stroke();
        }

        if (crossWeight > 0.01) {
            const arm = EYE_RADIUS + 0.4;
            cr.setSourceRGBA(r, g, b, crossWeight);
            cr.setLineWidth(1.9);
            cr.setLineCap(cairo.LineCap.ROUND);
            cr.moveTo(x - arm, y - arm);
            cr.lineTo(x + arm, y + arm);
            cr.moveTo(x + arm, y - arm);
            cr.lineTo(x - arm, y + arm);
            cr.stroke();
        }
    }
}
```

- [ ] **Step 4: Jalankan render, pastikan 8 PNG terbentuk**

```bash
cd ~/.local/share/gnome-shell/extensions/dynamic-island@local
gjs -m tests/render-expressions.js /tmp/ekspresi && ls -1 /tmp/ekspresi
```

Diharapkan: 8 berkas PNG, tanpa error.

- [ ] **Step 5: Periksa kedelapan PNG dengan mata**

Buka tiap berkas di `/tmp/ekspresi/` dan cocokkan dengan tabel ekspresi di spec.
Yang diperiksa:

- `senang` — dua busur menghadap ke atas seperti `^ ^`, bukan ke bawah
- `error` — dua silang jelas, warna merah
- `tidur` — dua garis tipis mendatar, bukan bulatan
- `bingung` — satu mata jelas lebih tinggi dari yang lain
- `berpikir` — kedua mata memandang ke arah kiri-atas
- `mendengar` — mata paling besar dan paling bercahaya
- `netral` dan `bicara` — jelas berbeda satu sama lain

Kalau ada yang tidak sesuai, perbaiki angka di `EXPRESSIONS` atau geometri di
`drawFace`, lalu render ulang. Ulangi sampai kedelapannya benar. Ini jauh lebih
murah daripada memeriksanya di dalam GNOME Shell.

- [ ] **Step 6: Ukur waktu menggambar**

Spec menuntut waktu gambar jauh di bawah satu frame, karena wajah ini tampil
terus-menerus. Mengukurnya di sini jauh lebih murah daripada di dalam shell.

Tambahkan sementara di akhir `tests/render-expressions.js`:

```js
const benchSurface = new cairo.ImageSurface(cairo.Format.ARGB32, WIDTH, HEIGHT);
const benchCr = new cairo.Context(benchSurface);
const params = resolveExpression('senang');
const N = 2000;
const started = GLib.get_monotonic_time();
for (let i = 0; i < N; i++)
    drawFace(benchCr, WIDTH, HEIGHT, params);
const elapsedUs = GLib.get_monotonic_time() - started;
benchCr.$dispose();
// get_monotonic_time() satuannya MIKRODETIK — bagi 1000 lagi untuk jadi ms.
print(`rata-rata per gambar: ${(elapsedUs / N / 1000).toFixed(4)} ms`);
```

Jalankan ulang skripnya.

Diharapkan: jauh di bawah **1 ms** per gambar (satu frame 60 Hz = 16,7 ms).
Kalau lebih dari 1 ms, cari penyebabnya sebelum lanjut — kemungkinan besar
efek cahaya digambar berkali-kali tanpa perlu.

Hapus lagi blok pengukuran itu setelah angkanya dicatat.

- [ ] **Step 7: Jalankan ulang tes unit, pastikan tidak ada yang rusak**

```bash
cd ~/.local/share/gnome-shell/extensions/dynamic-island@local
gjs -m tests/test-face.js
```

Diharapkan: `N lolos, 0 gagal`.

- [ ] **Step 8: Commit**

```bash
cd ~/.local/share/gnome-shell/extensions/dynamic-island@local
git add face.js tests/render-expressions.js
git commit -m "feat: gambar wajah robot dengan cairo"
```

---

### Task 3: Widget RobotFace menggantikan dua kotak mata

**Files:**
- Create: `robotFace.js`
- Modify: `extension.js` (kelas `Island`: buang `_eyes`, `_aimEyes`, `_syncBlink`,
  `_scheduleBlink`; pakai `RobotFace`)
- Modify: `stylesheet.css` (buang `.dynamic-island-eye`)

**Interfaces:**
- Consumes: `NEUTRAL`, `resolveExpression`, `lerpParams`, `drawFace` dari Task 1–2
- Produces:
  - `class RobotFace` dengan `actor: St.DrawingArea`
  - `setExpression(name: string): boolean` — `false` kalau nama tak dikenal
  - `setGaze(x: number, y: number): void` — nilai −1..1
  - `setBlinkingEnabled(enabled: boolean): void`
  - `get expression(): string`
  - `get repaintCount(): number` — hanya untuk pengujian
  - `destroy(): void`

- [ ] **Step 1: Tulis `robotFace.js`**

```js
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';

import { NEUTRAL, resolveExpression, lerpParams, drawFace } from './face.js';

export const FACE_WIDTH = 44;
export const FACE_HEIGHT = 26;

const TRANSITION_MS = 260;
const BLINK_MIN_MS = 2500;
const BLINK_SPREAD_MS = 3500;
const BLINK_MS = 220;

export class RobotFace {
    constructor() {
        this.actor = new St.DrawingArea({
            width: FACE_WIDTH,
            height: FACE_HEIGHT,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.actor.connect('repaint', () => this._onRepaint());

        this._expression = 'netral';
        this._from = { ...NEUTRAL };
        this._target = { ...NEUTRAL };
        this._progress = 1;
        this._gazeX = 0;
        this._gazeY = 0;
        this._blinkAmount = 0;
        this._repaintCount = 0;

        this._blinkEnabled = false;
        this._blinkId = null;

        this._timeline = new Clutter.Timeline({
            actor: this.actor,
            duration: TRANSITION_MS,
        });
        this._timeline.connect('new-frame', () => {
            this._progress = this._timeline.get_progress();
            this.actor.queue_repaint();
        });
        this._timeline.connect('completed', () => {
            this._progress = 1;
            this.actor.queue_repaint();
        });

        this._blinkTimeline = new Clutter.Timeline({
            actor: this.actor,
            duration: BLINK_MS,
        });
        this._blinkTimeline.connect('new-frame', () => {
            const t = this._blinkTimeline.get_progress();
            // turun lalu naik lagi
            this._blinkAmount = 1 - Math.abs(t * 2 - 1);
            this.actor.queue_repaint();
        });
        this._blinkTimeline.connect('completed', () => {
            this._blinkAmount = 0;
            this.actor.queue_repaint();
        });
    }

    get expression() {
        return this._expression;
    }

    get repaintCount() {
        return this._repaintCount;
    }

    setExpression(name) {
        const target = resolveExpression(name);
        if (!target) {
            console.log(`[dynamic-island] ekspresi tidak dikenal: ${name}`);
            return false;
        }

        this._from = this._currentParams();
        this._target = target;
        this._expression = name;
        this._progress = 0;

        this._timeline.stop();
        this._timeline.start();
        return true;
    }

    setGaze(x, y) {
        const clampedX = Math.max(-1, Math.min(1, x));
        const clampedY = Math.max(-1, Math.min(1, y));
        if (clampedX === this._gazeX && clampedY === this._gazeY)
            return;
        this._gazeX = clampedX;
        this._gazeY = clampedY;
        this.actor.queue_repaint();
    }

    setBlinkingEnabled(enabled) {
        if (enabled === this._blinkEnabled)
            return;
        this._blinkEnabled = enabled;

        if (enabled) {
            this._scheduleBlink();
            return;
        }

        if (this._blinkId) {
            GLib.source_remove(this._blinkId);
            this._blinkId = null;
        }
        this._blinkTimeline.stop();
        this._blinkAmount = 0;
        this.actor.queue_repaint();
    }

    _scheduleBlink() {
        const delay = BLINK_MIN_MS + Math.floor(Math.random() * BLINK_SPREAD_MS);
        this._blinkId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
            this._blinkId = null;
            this._blinkTimeline.stop();
            this._blinkTimeline.start();
            if (this._blinkEnabled)
                this._scheduleBlink();
            return GLib.SOURCE_REMOVE;
        });
    }

    _currentParams() {
        const params = lerpParams(this._from, this._target, this._progress);
        params.gazeX += this._gazeX;
        params.gazeY += this._gazeY;
        params.open *= 1 - this._blinkAmount;
        return params;
    }

    _onRepaint() {
        this._repaintCount++;
        const cr = this.actor.get_context();
        try {
            const [width, height] = this.actor.get_surface_size();
            drawFace(cr, width, height, this._currentParams());
        } catch (e) {
            console.error(`[dynamic-island] gagal menggambar wajah: ${e}`);
        } finally {
            cr.$dispose();
        }
    }

    destroy() {
        if (this._blinkId) {
            GLib.source_remove(this._blinkId);
            this._blinkId = null;
        }
        this._blinkEnabled = false;
        this._timeline.stop();
        this._blinkTimeline.stop();
        this.actor.destroy();
    }
}
```

- [ ] **Step 2: Pasang `RobotFace` ke dalam `Island`**

Di `extension.js`, tambahkan impor di bagian atas:

```js
import { RobotFace } from './robotFace.js';
```

Di `Island.constructor`, ganti blok pembuatan mata. Buang blok ini:

```js
        this._eyes = [];
        for (let i = 0; i < 2; i++) {
            const eye = new St.Widget({
                style_class: 'dynamic-island-eye',
                width: EYE_SIZE,
                height: EYE_SIZE,
                y_align: Clutter.ActorAlign.CENTER,
            });
            eye.set_pivot_point(0.5, 0.5);
            this._dot.add_child(eye);
            this._eyes.push(eye);
        }
```

Ganti dengan:

```js
        this._face = new RobotFace();
        this._dot.add_child(this._face.actor);
```

- [ ] **Step 3: Alihkan tatapan dan kedipan ke `RobotFace`**

Ganti seluruh isi `_aimEyes` menjadi:

```js
    _aimEyes(pointerX, pointerY) {
        const [dotX, dotY] = this._dot.get_transformed_position();
        const centerX = dotX + this._dot.width / 2;
        const centerY = dotY + this._dot.height / 2;
        this._face.setGaze((pointerX - centerX) / 500, (pointerY - centerY) / 350);
    }
```

Ganti seluruh isi `_syncBlink` menjadi:

```js
    _syncBlink() {
        this._face.setBlinkingEnabled(this._current === this._dot);
    }
```

Hapus method `_scheduleBlink` seluruhnya, dan hapus baris `this._blinkId` serta
`this._blinkActive` dari constructor dan dari `destroy()`.

Di `Island.destroy()`, tambahkan sebelum `this._pill.destroy()`:

```js
        this._face.destroy();
```

Hapus juga konstanta yang tidak terpakai lagi di bagian atas `extension.js`:
`EYE_SIZE`, `EYE_MAX_X`, `EYE_MAX_Y`, `BLINK_MIN_MS`, `BLINK_SPREAD_MS`.

- [ ] **Step 4: Buang gaya mata lama dari `stylesheet.css`**

Hapus blok ini seluruhnya:

```css
.dynamic-island-eye {
    background-color: #eaf6ff;
    border-radius: 999px;
    box-shadow: 0 0 6px rgba(140, 205, 255, 0.85);
}
```

- [ ] **Step 5: Jalankan sesi headless, pastikan tidak ada error**

Pakai blok perintah sesi headless di bagian atas rencana ini.

Diharapkan: baris `[dynamic-island] enabled, 5/5 sources, adopted 2 panel items`
muncul, dan hasil `grep` error kosong.

- [ ] **Step 6: Pastikan tidak ada repaint saat diam**

Tambahkan log sementara di akhir `Island.constructor`:

```js
        GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 20, () => {
            console.log(`[dynamic-island] repaint total: ${this._face.repaintCount}`);
            return GLib.SOURCE_REMOVE;
        });
```

Jalankan sesi headless, tunggu 25 detik, lalu:

```bash
grep "repaint total" /tmp/di-test.log
```

Diharapkan: angkanya kecil dan berhenti bertambah. Di sesi headless tidak ada
jendela maximize, jadi island ada di mode PILL dan wajah tidak terlihat — angka
yang wajar adalah **0 sampai beberapa**. Kalau angkanya ratusan, ada yang
memanggil `queue_repaint` terus-menerus; telusuri sebelum lanjut.

Hapus lagi log sementara itu setelah selesai.

- [ ] **Step 7: Commit**

```bash
cd ~/.local/share/gnome-shell/extensions/dynamic-island@local
git add robotFace.js extension.js stylesheet.css
git commit -m "feat: ganti kotak mata dengan wajah cairo yang bisa berekspresi"
```

---

### Task 4: Layanan D-Bus org.himisbah.Robot

**Files:**
- Create: `robotService.js`
- Modify: `extension.js` (buat dan hancurkan layanan di `enable`/`disable`)

**Interfaces:**
- Consumes: `RobotFace` dari Task 3
- Produces:
  - `class RobotService`, constructor menerima `controller` dengan bentuk
    `{ setExpression(name: string, durationMs: number): void,
       resetExpression(): void, get expression(): string }`
  - `notifyExpressionChanged(name: string): void`
  - `destroy(): void`
- Juga menambah ke `Island`: `setExpression(name, durationMs)`,
  `resetExpression()`, `get expression()`, `setService(service)`

- [ ] **Step 1: Tulis `robotService.js`**

```js
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const BUS_NAME = 'org.himisbah.Robot';
const OBJECT_PATH = '/org/himisbah/Robot';

const INTERFACE = `
<node>
  <interface name="org.himisbah.Robot">
    <method name="SetExpression">
      <arg type="s" direction="in" name="name"/>
      <arg type="i" direction="in" name="durationMs"/>
    </method>
    <method name="Reset"/>
    <property name="Expression" type="s" access="read"/>
    <signal name="ExpressionChanged">
      <arg type="s" name="name"/>
    </signal>
  </interface>
</node>`;

export class RobotService {
    constructor(controller) {
        this._controller = controller;
        this._exported = Gio.DBusExportedObject.wrapJSObject(INTERFACE, this);
        this._ownerId = Gio.bus_own_name(
            Gio.BusType.SESSION,
            BUS_NAME,
            Gio.BusNameOwnerFlags.REPLACE,
            connection => {
                try {
                    this._exported.export(connection, OBJECT_PATH);
                } catch (e) {
                    console.error(`[dynamic-island] gagal mengekspor D-Bus: ${e}`);
                }
            },
            null,
            () => console.log('[dynamic-island] nama D-Bus hilang'));
    }

    // Dipanggil lewat D-Bus. Tidak boleh melempar apa pun ke pemanggil —
    // exception yang lolos dari sini bisa merusak sesi shell.
    SetExpression(name, durationMs) {
        try {
            this._controller.setExpression(name, durationMs);
        } catch (e) {
            console.error(`[dynamic-island] SetExpression gagal: ${e}`);
        }
    }

    Reset() {
        try {
            this._controller.resetExpression();
        } catch (e) {
            console.error(`[dynamic-island] Reset gagal: ${e}`);
        }
    }

    get Expression() {
        return this._controller.expression;
    }

    notifyExpressionChanged(name) {
        try {
            this._exported.emit_signal('ExpressionChanged',
                new GLib.Variant('(s)', [name]));
            this._exported.emit_property_changed('Expression',
                new GLib.Variant('s', name));
        } catch (e) {
            console.error(`[dynamic-island] gagal mengirim sinyal: ${e}`);
        }
    }

    destroy() {
        try {
            this._exported.unexport();
        } catch (e) {
            console.error(`[dynamic-island] gagal unexport: ${e}`);
        }
        if (this._ownerId) {
            Gio.bus_unown_name(this._ownerId);
            this._ownerId = 0;
        }
    }
}
```

- [ ] **Step 2: Tambahkan kendali ekspresi bertenggat di `Island`**

Tambahkan method berikut ke kelas `Island` di `extension.js`:

```js
    setService(service) {
        this._service = service;
    }

    setExpression(name, durationMs = 0) {
        if (!this._face.setExpression(name))
            return;

        if (this._expressionHoldId) {
            GLib.source_remove(this._expressionHoldId);
            this._expressionHoldId = null;
        }

        this._service?.notifyExpressionChanged(name);

        if (durationMs > 0) {
            this._expressionHoldId = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT, durationMs, () => {
                    this._expressionHoldId = null;
                    this.setExpression('netral');
                    return GLib.SOURCE_REMOVE;
                });
        }
    }

    resetExpression() {
        this.setExpression('netral');
    }

    get expression() {
        return this._face.expression;
    }
```

Tambahkan `this._expressionHoldId = null;` dan `this._service = null;` di
constructor `Island`, dan di `destroy()` tambahkan `this._expressionHoldId` ke
dalam daftar timer yang sudah dibersihkan di sana:

```js
        for (const id of [this._holdId, this._recheckId, this._pollId,
                          this._blinkId, this._expressionHoldId]) {
```

- [ ] **Step 3: Hidupkan layanan di `enable`, matikan di `disable`**

Di `DynamicIslandExtension.enable()`, setelah `this._island = new Island();`:

```js
        this._service = new RobotService(this._island);
        this._island.setService(this._service);
```

Di `disable()`, sebelum `this._island?.destroy();`:

```js
        this._service?.destroy();
        this._service = null;
```

Tambahkan impornya di bagian atas `extension.js`:

```js
import { RobotService } from './robotService.js';
```

- [ ] **Step 4: Jalankan sesi headless dan panggil kedelapan ekspresi**

```bash
ADDR=$(cat /tmp/di-bus.txt)
for e in netral mendengar berpikir bicara senang bingung error tidur; do
  DBUS_SESSION_BUS_ADDRESS="$ADDR" gdbus call --session \
    --dest org.himisbah.Robot --object-path /org/himisbah/Robot \
    --method org.himisbah.Robot.SetExpression "$e" 0
  sleep 1
done
DBUS_SESSION_BUS_ADDRESS="$ADDR" gdbus call --session \
  --dest org.himisbah.Robot --object-path /org/himisbah/Robot \
  --method org.himisbah.Robot.SetExpression "ngaco" 0
grep -iE "JS ERROR|Extension .*Error|tidak dikenal" /tmp/di-test.log
```

Diharapkan: kedelapan panggilan mengembalikan `()` tanpa error; panggilan
`ngaco` tercatat sebagai "ekspresi tidak dikenal" dan **tidak** memunculkan
JS ERROR.

- [ ] **Step 5: Uji tenggat waktu otomatis**

```bash
ADDR=$(cat /tmp/di-bus.txt)
DBUS_SESSION_BUS_ADDRESS="$ADDR" gdbus call --session \
  --dest org.himisbah.Robot --object-path /org/himisbah/Robot \
  --method org.himisbah.Robot.SetExpression "senang" 1500
sleep 1
DBUS_SESSION_BUS_ADDRESS="$ADDR" gdbus call --session \
  --dest org.himisbah.Robot --object-path /org/himisbah/Robot \
  --method org.freedesktop.DBus.Properties.Get org.himisbah.Robot Expression
sleep 2
DBUS_SESSION_BUS_ADDRESS="$ADDR" gdbus call --session \
  --dest org.himisbah.Robot --object-path /org/himisbah/Robot \
  --method org.freedesktop.DBus.Properties.Get org.himisbah.Robot Expression
```

Diharapkan: pembacaan pertama `senang`, pembacaan kedua `netral`.

- [ ] **Step 6: Commit**

```bash
cd ~/.local/share/gnome-shell/extensions/dynamic-island@local
git add robotService.js extension.js
git commit -m "feat: layanan D-Bus untuk mengendalikan ekspresi robot"
```

---

### Task 5: Ekspresi sibuk memaksa mode DOT

**Files:**
- Modify: `extension.js` (`Island._resolveTarget`, `Island.setExpression`)

**Interfaces:**
- Consumes: `setExpression` dari Task 4
- Produces: `Island._faceBusy: boolean` — benar selama ekspresi `mendengar`,
  `berpikir`, atau `bicara` aktif

- [ ] **Step 1: Tandai ekspresi sibuk**

Tambahkan di bagian atas `extension.js`, dekat konstanta lain:

```js
const BUSY_EXPRESSIONS = ['mendengar', 'berpikir', 'bicara'];
```

Tambahkan `this._faceBusy = false;` di constructor `Island`, lalu ganti
`Island.setExpression` dari Task 4 dengan versi lengkap ini:

```js
    setExpression(name, durationMs = 0) {
        if (!this._face.setExpression(name))
            return;

        if (this._expressionHoldId) {
            GLib.source_remove(this._expressionHoldId);
            this._expressionHoldId = null;
        }

        this._faceBusy = BUSY_EXPRESSIONS.includes(name);
        this._update();
        this._service?.notifyExpressionChanged(name);

        if (durationMs > 0) {
            this._expressionHoldId = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT, durationMs, () => {
                    this._expressionHoldId = null;
                    this.setExpression('netral');
                    return GLib.SOURCE_REMOVE;
                });
        }
    }
```

- [ ] **Step 2: Sisipkan ke penentuan mode island**

Ubah `_resolveTarget` menjadi:

```js
    _resolveTarget() {
        if (this._eventActive)
            return this._event;
        if (this._faceBusy)
            return this._dot;
        if (this._pinned || !this._covered || this._pointerNear)
            return this._normal;
        return this._dot;
    }
```

Urutannya penting: `_eventActive` tetap paling atas, karena notifikasi dan media
lebih mendesak daripada ekspresi maskot — ini yang diminta spec.

- [ ] **Step 3: Uji di sesi headless**

Di sesi headless tidak ada jendela maximize, jadi island ada di mode PILL.
Ekspresi sibuk harus memaksanya ke DOT.

Tambahkan log sementara di awal `Island._show`:

```js
        console.log(`[dynamic-island] mode: ${box === this._dot ? 'DOT' : box === this._normal ? 'PILL' : 'EVENT'}`);
```

Jalankan sesi headless, lalu:

```bash
ADDR=$(cat /tmp/di-bus.txt)
DBUS_SESSION_BUS_ADDRESS="$ADDR" gdbus call --session \
  --dest org.himisbah.Robot --object-path /org/himisbah/Robot \
  --method org.himisbah.Robot.SetExpression "berpikir" 0
sleep 2
DBUS_SESSION_BUS_ADDRESS="$ADDR" gdbus call --session \
  --dest org.himisbah.Robot --object-path /org/himisbah/Robot \
  --method org.himisbah.Robot.SetExpression "netral" 0
sleep 2
grep "mode:" /tmp/di-test.log
```

Diharapkan urutannya: `PILL` (awal) → `DOT` (saat berpikir) → `PILL` (setelah
kembali netral).

- [ ] **Step 4: Pastikan notifikasi tetap menang atas wajah**

```bash
ADDR=$(cat /tmp/di-bus.txt)
DBUS_SESSION_BUS_ADDRESS="$ADDR" gdbus call --session \
  --dest org.himisbah.Robot --object-path /org/himisbah/Robot \
  --method org.himisbah.Robot.SetExpression "berpikir" 0
DBUS_SESSION_BUS_ADDRESS="$ADDR" notify-send "Tes" "notifikasi saat berpikir"
sleep 6
grep "mode:" /tmp/di-test.log | tail -4
```

Diharapkan: `DOT` → `EVENT` (saat notifikasi) → `DOT` (kembali, karena ekspresi
`berpikir` masih aktif).

- [ ] **Step 5: Pastikan ekspresi non-sibuk tersimpan saat wajah tak terlihat**

Spec menuntut: ekspresi selain yang sibuk tidak memaksa DOT, tapi harus tetap
tersimpan dan terpakai begitu island kembali ke DOT.

```bash
ADDR=$(cat /tmp/di-bus.txt)
DBUS_SESSION_BUS_ADDRESS="$ADDR" gdbus call --session \
  --dest org.himisbah.Robot --object-path /org/himisbah/Robot \
  --method org.himisbah.Robot.SetExpression "tidur" 0
sleep 1
grep "mode:" /tmp/di-test.log | tail -2
DBUS_SESSION_BUS_ADDRESS="$ADDR" gdbus call --session \
  --dest org.himisbah.Robot --object-path /org/himisbah/Robot \
  --method org.freedesktop.DBus.Properties.Get org.himisbah.Robot Expression
```

Diharapkan: mode **tetap PILL** (ekspresi `tidur` tidak memaksa DOT), tetapi
properti `Expression` sudah bernilai `tidur` — artinya tersimpan dan siap
dipakai begitu island kembali ke DOT.

Hapus log sementara setelah selesai.

- [ ] **Step 6: Jalankan ulang seluruh tes unit**

```bash
cd ~/.local/share/gnome-shell/extensions/dynamic-island@local
gjs -m tests/test-face.js && gjs -m tests/render-expressions.js /tmp/ekspresi
```

Diharapkan: semua lolos, 8 PNG terbentuk.

- [ ] **Step 7: Commit**

```bash
cd ~/.local/share/gnome-shell/extensions/dynamic-island@local
git add extension.js
git commit -m "feat: ekspresi sibuk memaksa island ke mode titik"
```

---

## Setelah semua task selesai

Baru pada titik ini perlu logout/login, sekali saja, untuk melihat hasilnya di
sesi sungguhan. Sebelum meminta itu, pastikan:

- `gjs -m tests/test-face.js` lolos
- Kedelapan PNG sudah diperiksa dengan mata dan bentuknya benar
- Sesi headless berjalan tanpa satu pun JS ERROR
- `git log --oneline` menunjukkan lima commit task
