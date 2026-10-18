# Memo Hidup (A + B) — Rencana Implementasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Memo keluar dari Dynamic Island dan hidup di desktop seperti NPC — melompat di atas jendela, mengintip, menyingkir dari kursor, punya kebutuhan, sifat, dan ritme harian — tanpa AI.

**Architecture:** Semua di extension `dynamic-island@local`, folder baru `extension/hidup/`. Empat modul murni (`kenalAplikasi.js`, `dunia.js`, `fisika.js`, `pikiran.js`) dibangun dan diuji dulu dengan `gjs` di luar GNOME. Lalu `memoHidup.js` menyambungkannya ke jendela, kursor, dan aktor di GNOME Shell, menggantikan `companion.js`; tab Pengaturan panel mendapat sakelar, tombol, dan slider sifat.

**Tech Stack:** GNOME Shell 50 (extension ES module), gjs 1.88, St/Clutter/Meta, Python 3 untuk skenario GNOME headless.

**Spec:** `docs/superpowers/specs/2026-10-18-memo-hidup-design.md`

## Global Constraints

- Nama, komentar, pesan commit, dan dokumen berbahasa Indonesia, mengikuti gaya repo (contoh: `extension/gerakPola.js`).
- `extension/hidup/kenalAplikasi.js`, `dunia.js`, `fisika.js`, `pikiran.js` **murni**: tidak boleh mengimpor St, Clutter, Meta, Main, atau `resource://`.
- Gaya piksel: langkah 12×/detik (`FPS_PIKSEL` di `gerakPola.js`), posisi selalu dibulatkan ke piksel.
- Tidak ada akses berkas, jaringan, atau AI di jalur langkah. Satu-satunya berkas: `~/.config/memo/hidup.json`, disimpan tiap 300 dtk, saat sifat diubah (ditunda 1 dtk), dan saat extension dimatikan.
- Lingkar kursor 160 px; bagian badan yang menyembul saat ngintip 40%; badan Memo 120×72 px.
- Judul jendela hanya dipakai untuk menebak kategori; tidak disimpan ke berkas dan tidak dikirim ke mana pun.
- Tiga galat beruntun di `memoHidup.js` → Memo pulang, jalan-jalan mati untuk sesi itu, galat dicatat `[dynamic-island] hidup:`.
- Tiap tugas selesai dengan `tests/semua.sh` hijau; tugas 6–7 juga `tests/gnome/uji-island.sh` hijau (±5 menit).
- Pesan commit diakhiri baris `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Perubahan extension di sesi yang sedang dipakai baru termuat setelah logout/login. Uji tanpa logout: `tests/gnome/uji-island.sh`.

## Peta berkas

| Berkas | Tugas | Isi |
|---|---|---|
| `extension/hidup/kenalAplikasi.js` | 1 | jendela → kategori (kode, video, terminal, chat, musik, dokumen, lain) |
| `extension/hidup/dunia.js` | 2 | persepsi → peta: lantai, tepi ngintip, zona larangan; `bolehDi()` |
| `extension/hidup/fisika.js` | 3 | badan: jatuh, busur lompat, jalan, ikut jendela, lempar & pantul, rute antar lantai |
| `extension/hidup/pikiran.js` | 4, 5 | kebutuhan, sifat, simpan/muat (4); pemilihan kegiatan & tujuan (5) |
| `extension/tests/test-*.js` | 1–5 | tes gjs murni, otomatis ikut `tests/semua.sh` |
| `extension/hidup/memoHidup.js` | 6 | badan di GNOME Shell: aktor, sinyal jendela, tumpukan, sentuhan, keluar/pulang |
| `extension/extension.js` | 6 | island ↔ Memo hidup; companion dibuang |
| `extension/companion.js` | 6 | **dihapus** (fiturnya diserap `memoHidup.js`) |
| `extension/stylesheet.css` | 6, 7 | `.memo-hidup` (badan), gaya slider sifat |
| `extension/panel.js` | 7 | tab Pengaturan: sakelar Jalan-jalan, Panggil ke sini, Pulang, slider sifat |
| `tests/gnome/jendela-uji.js` | 6 | jendela GTK kosong untuk skenario |
| `tests/gnome/skenario.py` | 6, 7 | skenario Memo hidup di GNOME Shell headless |
| `docs/memo-hidup.md`, `README.md` | 8 | dokumentasi pemakaian |

Koordinat di semua modul `hidup/` = piksel logis layar; titik Memo = **tengah bawah badannya ("kaki")**.

---

### Tugas 1: Kenal aplikasi

**Files:**
- Create: `extension/hidup/kenalAplikasi.js`
- Test: `extension/tests/test-kenal-aplikasi.js`

**Interfaces:**
- Consumes: —
- Produces: `KATEGORI: string[]` dan `kenali(aplikasi = '', judul = '') → 'kode' | 'video' | 'terminal' | 'chat' | 'musik' | 'dokumen' | 'lain'`. `aplikasi` = `wm_class` jendela; untuk browser, kategori ditebak dari judul.

- [ ] **Step 1: Tulis tes yang gagal**

Buat `extension/tests/test-kenal-aplikasi.js`:

```js
// Jalankan: gjs -m extension/tests/test-kenal-aplikasi.js
import { KATEGORI, kenali } from '../hidup/kenalAplikasi.js';

let gagal = 0;
let lolos = 0;
const cek = (label, syarat) => {
    if (syarat) {
        lolos++;
    } else {
        gagal++;
        console.log(`GAGAL: ${label}`);
    }
};

const KASUS = [
    ['Code', 'memo — Visual Studio Code', 'kode'],
    ['code-oss', 'layar.js', 'kode'],
    ['VSCodium', '', 'kode'],
    ['jetbrains-pycharm', '', 'kode'],
    ['org.gnome.Ptyxis', '~/Projects/memo', 'terminal'],
    ['org.gnome.Console', '', 'terminal'],
    ['kitty', '', 'terminal'],
    ['obsidian', 'Peta Utama - himisbah - Obsidian', 'dokumen'],
    ['libreoffice-writer', 'laporan.odt', 'dokumen'],
    ['org.gnome.TextEditor', 'catatan.txt', 'dokumen'],
    ['spotify', 'Spotify Premium', 'musik'],
    ['vlc', 'film.mkv', 'video'],
    ['io.github.celluloid_player.Celluloid', '', 'video'],
    ['TelegramDesktop', '', 'chat'],
    ['discord', '', 'chat'],
    ['firefox', 'Lofi hip hop — YouTube — Mozilla Firefox', 'video'],
    ['firefox', 'YouTube Music — Mozilla Firefox', 'musik'],
    ['Google-chrome', 'WhatsApp', 'chat'],
    ['firefox', 'anthropics/claude-code · GitHub — Mozilla Firefox', 'kode'],
    ['firefox', 'Google — Mozilla Firefox', 'lain'],
    ['org.gnome.Nautilus', 'Unduhan', 'lain'],
    ['', '', 'lain'],
];
for (const [aplikasi, judul, harap] of KASUS)
    cek(`${aplikasi} / "${judul}" -> ${harap} (dapat ${kenali(aplikasi, judul)})`, kenali(aplikasi, judul) === harap);

cek('semua hasil termasuk KATEGORI', KASUS.every(([a, j]) => KATEGORI.includes(kenali(a, j))));
cek('tanpa argumen tidak melempar', kenali() === 'lain');

console.log(`\n${lolos} lolos, ${gagal} gagal`);
if (gagal)
    throw new Error(`${gagal} gagal`);
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `gjs -m extension/tests/test-kenal-aplikasi.js`
Expected: GAGAL dengan `ImportError: Module not found: .../extension/hidup/kenalAplikasi.js`

- [ ] **Step 3: Implementasi**

Buat `extension/hidup/kenalAplikasi.js`:

```js
// Mengenali jenis jendela dari nama aplikasi (wm_class / app id) dan
// judulnya, supaya pikiran Memo bisa bereaksi: ikut menonton video,
// menemani ngoding, joget saat musik. Murni: tanpa St/Clutter/Meta.
//
// Judul hanya dipakai di sini untuk menebak kategori; tidak disimpan ke
// berkas dan tidak dikirim ke mana pun.

export const KATEGORI = ['kode', 'video', 'terminal', 'chat', 'musik', 'dokumen', 'lain'];

// Urutan penting: yang lebih khusus di atas.
const APLIKASI = [
    ['musik', /spotify|rhythmbox|lollypop|amberol/i],
    ['video', /vlc|mpv|celluloid|totem|showtime/i],
    ['kode', /^code|vscod|codium|jetbrains|pycharm|webstorm|intellij|builder|zed/i],
    ['terminal', /ptyxis|terminal|kitty|alacritty|wezterm|foot|tilix|console/i],
    ['chat', /telegram|discord|slack|signal|element|whatsapp/i],
    ['dokumen', /obsidian|libreoffice|soffice|papers|evince|okular|texteditor|gedit|apostrophe/i],
];

const BROWSER = /firefox|chrome|chromium|brave|epiphany|vivaldi|msedge|opera/i;
const JUDUL_BROWSER = [
    ['musik', /youtube music|open\.spotify|spotify –|spotify -/i],
    ['video', /youtube|netflix|vidio|twitch|vimeo/i],
    ['chat', /whatsapp|telegram|discord|slack|messenger/i],
    ['kode', /github|gitlab|stack overflow|localhost/i],
];

export function kenali(aplikasi = '', judul = '') {
    if (BROWSER.test(aplikasi)) {
        for (const [k, pola] of JUDUL_BROWSER) {
            if (pola.test(judul))
                return k;
        }
        return 'lain';
    }
    for (const [k, pola] of APLIKASI) {
        if (pola.test(aplikasi))
            return k;
    }
    return 'lain';
}
```

- [ ] **Step 4: Jalankan, pastikan lolos**

Run: `gjs -m extension/tests/test-kenal-aplikasi.js`
Expected: baris terakhir `24 lolos, 0 gagal`

- [ ] **Step 5: Semua tes repo tetap hijau**

Run: `tests/semua.sh`
Expected: semua baris `ok`, termasuk `ok     test-kenal-aplikasi.js       24 lolos, 0 gagal`; kode keluar 0.

- [ ] **Step 6: Commit**

```bash
git add extension/hidup/kenalAplikasi.js extension/tests/test-kenal-aplikasi.js
git commit -m "feat(hidup): kenali jenis jendela dari nama aplikasi & judul

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tugas 2: Dunia — lantai, tepi ngintip, zona larangan

**Files:**
- Create: `extension/hidup/dunia.js`
- Test: `extension/tests/test-dunia.js`

**Interfaces:**
- Consumes: —
- Produces:
  - `LINGKAR_KURSOR = 160`, `BAGIAN_NGINTIP = 0.4`
  - `kurangiInterval([a, b], penutup: [p, q][]) → [x1, x2][]`
  - `petaDari(persepsi, ukuran) → peta`, dengan `persepsi = { areaKerja: {x, y, lebar, tinggi}, jendela: [{ id, x, y, lebar, tinggi, aktif, maksimal, layarPenuh, aplikasi, judul }] /* urut bawah → atas */, kursor: {x, y}, jam }` dan `ukuran = {lebar, tinggi}`; `peta = { areaKerja, lantai: [{x1, x2, y, jendelaId /* null = dasar */}], tepi: [{jenis: 'layar' | 'jendela', sisi: 'kiri' | 'kanan' | 'bawah' | 'atas', x, y, jendelaId}], larangan: { kotak: [{x, y, lebar, tinggi}], kursor: {x, y, r} }, hanyaTepi: boolean, sembunyi: boolean }`
  - `bolehDi(peta, {x, y, jenis = null}, ukuran) → boolean` (`jenis: 'layar'` = posisi tepi layar; satu-satunya yang boleh menimpa jendela aktif, hanya saat `hanyaTepi`)

- [ ] **Step 1: Tulis tes yang gagal**

Buat `extension/tests/test-dunia.js`:

```js
// Jalankan: gjs -m extension/tests/test-dunia.js
import { BAGIAN_NGINTIP, LINGKAR_KURSOR, bolehDi, kurangiInterval, petaDari } from '../hidup/dunia.js';

let gagal = 0;
let lolos = 0;
const cek = (label, syarat) => {
    if (syarat) {
        lolos++;
    } else {
        gagal++;
        console.log(`GAGAL: ${label}`);
    }
};
const sama = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const AREA = { x: 0, y: 32, lebar: 1600, tinggi: 868 };   // dasar di y = 900
const UKURAN = { lebar: 120, tinggi: 72 };
const persepsi = (jendela, kursor = { x: 20, y: 40 }) => ({ areaKerja: AREA, jendela, kursor });

// --- kurangiInterval ---
cek('interval: dua penutup', sama(kurangiInterval([0, 100], [[20, 30], [50, 200]]), [[0, 20], [30, 50]]));
cek('interval: tanpa penutup', sama(kurangiInterval([0, 100], []), [[0, 100]]));
cek('interval: tertutup penuh', sama(kurangiInterval([0, 100], [[-10, 200]]), []));
cek('interval: kosong tetap kosong', sama(kurangiInterval([5, 5], []), []));

// --- desktop kosong ---
let p = petaDari(persepsi([]), UKURAN);
cek('kosong: satu lantai = dasar area kerja', sama(p.lantai, [{ x1: 0, x2: 1600, y: 900, jendelaId: null }]));
cek('kosong: empat tepi layar', p.tepi.length === 4 && p.tepi.every(e => e.jenis === 'layar'));
cek('kosong: tepi kiri/kanan menyembul 40%', p.tepi[0].x === -12 && p.tepi[1].x === 1612 && BAGIAN_NGINTIP === 0.4);
cek('kosong: tepi bawah hanya bagian atas badan yang tampak', p.tepi[2].y === 943 && p.tepi[3].x === 1200);
cek('kosong: tidak hanyaTepi, tidak sembunyi', !p.hanyaTepi && !p.sembunyi);

// --- tiga jendela bertumpuk (urut bawah -> atas) ---
const B = { id: 2, x: 800, y: 150, lebar: 600, tinggi: 350, aplikasi: 'firefox', judul: 'YouTube' };
const C = { id: 3, x: 1200, y: 50, lebar: 300, tinggi: 200, aplikasi: 'spotify', judul: '' };
const A = { id: 1, x: 100, y: 300, lebar: 800, tinggi: 500, aktif: true, aplikasi: 'Code', judul: 'memo' };
p = petaDari(persepsi([B, C, A]), UKURAN);
cek('susun: lantai dasar + atas B (terpotong C) + atas A', sama(p.lantai, [
    { x1: 0, x2: 1600, y: 900, jendelaId: null },
    { x1: 800, x2: 1200, y: 150, jendelaId: 2 },
    { x1: 100, x2: 900, y: 300, jendelaId: 1 },
]));
cek('susun: jendela tanpa ruang di atasnya (C) bukan lantai', !p.lantai.some(L => L.jendelaId === 3));
cek('susun: ngintip dari balik B (tak aktif), bukan dari A (aktif)', sama(p.tepi.filter(e => e.jenis === 'jendela'),
    [{ jenis: 'jendela', sisi: 'atas', x: 980, y: 193, jendelaId: 2 }]));
cek('susun: zona larangan = isi jendela aktif', sama(p.larangan.kotak, [{ x: 100, y: 300, lebar: 800, tinggi: 500 }]));
cek('susun: lingkar kursor 160 px', p.larangan.kursor.r === LINGKAR_KURSOR && LINGKAR_KURSOR === 160);

// --- bolehDi ---
cek('boleh berdiri di atas jendela aktif (isinya tidak tertutup)', bolehDi(p, { x: 500, y: 300 }, UKURAN));
cek('tidak boleh di dalam isi jendela aktif', !bolehDi(p, { x: 500, y: 600 }, UKURAN));
cek('boleh ngintip dari balik B', bolehDi(p, { x: 980, y: 193, jenis: 'jendela' }, UKURAN));
const dekatKursor = petaDari(persepsi([B, C, A], { x: 1000, y: 880 }), UKURAN);
cek('tidak boleh di lingkar kursor', !bolehDi(dekatKursor, { x: 1000, y: 900 }, UKURAN));
cek('boleh di luar lingkar kursor', bolehDi(dekatKursor, { x: 1300, y: 900 }, UKURAN));

// --- jendela aktif memenuhi layar ---
const M = { id: 1, x: 0, y: 32, lebar: 1600, tinggi: 868, aktif: true, maksimal: true, aplikasi: 'Code', judul: '' };
p = petaDari(persepsi([B, M]), UKURAN);
cek('maximize: hanyaTepi, tanpa lantai', p.hanyaTepi && p.lantai.length === 0);
cek('maximize: hanya tepi layar', p.tepi.length === 4 && p.tepi.every(e => e.jenis === 'layar'));
cek('maximize: tepi layar boleh walau menimpa pinggir jendela aktif', bolehDi(p, { ...p.tepi[1] }, UKURAN));
cek('maximize: dasar tetap terlarang', !bolehDi(p, { x: 800, y: 900 }, UKURAN));
const kursorDiKanan = petaDari(persepsi([B, M], { x: 1550, y: 880 }), UKURAN);
cek('maximize: lingkar kursor tetap berlaku di tepi', !bolehDi(kursorDiKanan, { ...kursorDiKanan.tepi[1] }, UKURAN));
p = petaDari(persepsi([{ ...M, maksimal: false }]), UKURAN);
cek('jendela seukuran area kerja (tanpa tanda maksimal) juga hanyaTepi', p.hanyaTepi);

// --- layar penuh ---
p = petaDari(persepsi([B, { ...A, layarPenuh: true }]), UKURAN);
cek('aplikasi layar penuh -> sembunyi', p.sembunyi);

console.log(`\n${lolos} lolos, ${gagal} gagal`);
if (gagal)
    throw new Error(`${gagal} gagal`);
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `gjs -m extension/tests/test-dunia.js`
Expected: GAGAL dengan `ImportError: Module not found: .../extension/hidup/dunia.js`

- [ ] **Step 3: Implementasi**

Buat `extension/hidup/dunia.js`:

```js
// Peta dunia Memo dari apa yang ada di layar: di mana ia boleh berdiri
// (lantai), dari mana boleh mengintip (tepi), dan ke mana tidak boleh
// (zona larangan). Murni: tanpa St/Clutter/Meta, diuji dengan gjs polos.
//
// Koordinat = piksel logis layar. Titik Memo = tengah bawah badannya
// ("kaki"), sama di dunia.js, fisika.js, dan pikiran.js.
//
// persepsi: { areaKerja: {x, y, lebar, tinggi},
//             jendela: [{ id, x, y, lebar, tinggi, aktif, maksimal,
//                         layarPenuh, aplikasi, judul }]   // urut bawah → atas
//             kursor: {x, y}, ... }

export const LINGKAR_KURSOR = 160;
// Bagian badan yang menyembul saat mengintip.
export const BAGIAN_NGINTIP = 0.4;

// Interval [a, b) dikurangi interval-interval penutup -> sisa yang terbuka.
export function kurangiInterval([a, b], penutup) {
    let sisa = a < b ? [[a, b]] : [];
    for (const [p, q] of penutup) {
        const baru = [];
        for (const [x, y] of sisa) {
            if (q <= x || p >= y) {
                baru.push([x, y]);
                continue;
            }
            if (p > x)
                baru.push([x, p]);
            if (q < y)
                baru.push([q, y]);
        }
        sisa = baru;
    }
    return sisa;
}

const memotongPita = (w, atas, bawah) => w.y < bawah && w.y + w.tinggi > atas;

function memenuhi(w, A) {
    const t = 2;
    return w.x <= A.x + t && w.y <= A.y + t &&
        w.x + w.lebar >= A.x + A.lebar - t && w.y + w.tinggi >= A.y + A.tinggi - t;
}

export function petaDari(persepsi, ukuran) {
    const { areaKerja: A, jendela, kursor } = persepsi;
    const { lebar: l, tinggi: t } = ukuran;
    const aktif = jendela.find(w => w.aktif) ?? null;
    const sembunyi = jendela.some(w => w.layarPenuh);
    const hanyaTepi = !!aktif && (aktif.maksimal || memenuhi(aktif, A));
    const larangan = {
        kotak: aktif ? [{ x: aktif.x, y: aktif.y, lebar: aktif.lebar, tinggi: aktif.tinggi }] : [],
        kursor: { x: kursor.x, y: kursor.y, r: LINGKAR_KURSOR },
    };
    const bawah = A.y + A.tinggi;

    // Bagian [x1, x2) pada ketinggian y yang tidak tertutup jendela `diAtas`
    // di dalam pita setinggi `pita` tepat di atas y.
    const terbuka = (x1, x2, y, diAtas, pita) =>
        kurangiInterval([Math.max(x1, A.x), Math.min(x2, A.x + A.lebar)],
            diAtas.filter(w => memotongPita(w, y - pita, y)).map(w => [w.x, w.x + w.lebar]));

    // Lantai: dasar area kerja (tidak boleh tertutup jendela mana pun, karena
    // di sana Memo ada di lapisan atas) + tepi atas tiap jendela (hanya
    // tertutup oleh jendela yang lebih atas di tumpukan).
    const lantai = [];
    if (!hanyaTepi) {
        for (const [x1, x2] of terbuka(A.x, A.x + A.lebar, bawah, jendela, t))
            lantai.push({ x1, x2, y: bawah, jendelaId: null });
        jendela.forEach((w, i) => {
            if (w.y - t < A.y || w.y >= bawah)
                return;
            for (const [x1, x2] of terbuka(w.x, w.x + w.lebar, w.y, jendela.slice(i + 1), t))
                lantai.push({ x1, x2, y: w.y, jendelaId: w.id });
        });
    }

    // Tepi ngintip: pinggir layar (selalu ada) + atas jendela tak aktif
    // (Memo di belakang jendela itu, hanya BAGIAN_NGINTIP badan yang menyembul).
    const geser = Math.round(l * (0.5 - BAGIAN_NGINTIP));
    const tepi = [
        { jenis: 'layar', sisi: 'kiri', x: A.x - geser, y: bawah, jendelaId: null },
        { jenis: 'layar', sisi: 'kanan', x: A.x + A.lebar + geser, y: bawah, jendelaId: null },
        ...[0.25, 0.75].map(f => ({ jenis: 'layar', sisi: 'bawah', x: Math.round(A.x + A.lebar * f),
            y: Math.round(bawah + t * (1 - BAGIAN_NGINTIP)), jendelaId: null })),
    ];
    if (!hanyaTepi) {
        const pita = t * BAGIAN_NGINTIP;
        jendela.forEach((w, i) => {
            if (w.aktif || w.lebar < l || w.y - pita < A.y)
                return;
            const x = Math.round(w.x + Math.max(l / 2, Math.min(w.lebar * 0.3, w.lebar - l / 2)));
            const sisa = terbuka(x - l / 2, x + l / 2, w.y, jendela.slice(i + 1), pita);
            if (sisa.length === 1 && sisa[0][1] - sisa[0][0] >= l) {
                tepi.push({ jenis: 'jendela', sisi: 'atas', x, y: Math.round(w.y + t * (1 - BAGIAN_NGINTIP)),
                    jendelaId: w.id });
            }
        });
    }

    return { areaKerja: { ...A }, lantai: lantai.filter(L => L.x2 - L.x1 >= l), tepi, larangan, hanyaTepi, sembunyi };
}

// Bolehkah Memo (titik kaki x, y) berada di sini? Badannya tidak boleh di
// lingkar kursor dan tidak boleh menimpa isi jendela aktif. Satu-satunya
// pengecualian: tepi layar saat jendela aktif memenuhi layar (hanyaTepi).
export function bolehDi(peta, { x, y, jenis = null }, ukuran) {
    const { lebar: l, tinggi: t } = ukuran;
    const bx = x - l / 2, by = y - t;
    const k = peta.larangan.kursor;
    const dx = Math.max(bx - k.x, 0, k.x - (bx + l));
    const dy = Math.max(by - k.y, 0, k.y - (by + t));
    if (Math.hypot(dx, dy) < k.r)
        return false;
    if (jenis === 'layar' && peta.hanyaTepi)
        return true;
    return !peta.larangan.kotak.some(r =>
        bx < r.x + r.lebar && bx + l > r.x && by < r.y + r.tinggi && by + t > r.y);
}
```

- [ ] **Step 4: Jalankan, pastikan lolos**

Run: `gjs -m extension/tests/test-dunia.js`
Expected: `26 lolos, 0 gagal`

- [ ] **Step 5: Semua tes repo tetap hijau**

Run: `tests/semua.sh`
Expected: semua `ok`, termasuk `test-dunia.js 26 lolos, 0 gagal`.

- [ ] **Step 6: Commit**

```bash
git add extension/hidup/dunia.js extension/tests/test-dunia.js
git commit -m "feat(hidup): peta dunia Memo — lantai, tepi ngintip, zona larangan

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tugas 3: Fisika — badan, lompat, jatuh, lempar, rute

**Files:**
- Create: `extension/hidup/fisika.js`
- Test: `extension/tests/test-fisika.js`

**Interfaces:**
- Consumes: bentuk `peta` dari Tugas 2 (`areaKerja`, `lantai`, `tepi`).
- Produces:
  - Konstanta: `LANGKAH_PER_DETIK = 12`, `GRAVITASI = 9`, `JANGKAU_X = 480`, `JANGKAU_NAIK = 320`, `LOMPAT_KECIL = 40`, `BATAS_IKUT = 40`, `REDAM_PANTUL = 0.5`
  - `badan = { x, y, vx, vy, keadaan: 'berdiri' | 'melompat' | 'jatuh' | 'dilempar' | 'diangkat' | 'ngintip', pijakan /* jendelaId, null = dasar, undefined = tidak berpijak */, busur, tepi }`
  - `badanBaru(x, y)`, `mulaiJatuh(badan)`, `angkat(badan, x, y)`, `lempar(badan, vx, vy)`, `ngintip(badan, tepi)`
  - `titikDi(lantai, x, lebarBadan) → {x, y, jendelaId}`
  - `rencanaLompat(dari, ke) → busur | null`, `mulaiLompat(badan, ke) → badan | null`, `langkahJalan(badan, keX) → {x, y, jendelaId}`
  - `langkah(badan, peta, { ukuran, gerakJendela: Map<jendelaId, {dx, dy}> }) → { badan, kejadian: ('mendarat' | 'mendaratKeras' | 'jatuh' | 'pantul')[] }`
  - `rute(dari, tujuan, peta, lebarBadan) → [{jenis: 'jalan' | 'lompat', ke: {x, y, jendelaId}}] | [] | null`

- [ ] **Step 1: Tulis tes yang gagal**

Buat `extension/tests/test-fisika.js`:

```js
// Jalankan: gjs -m extension/tests/test-fisika.js
import {
    BATAS_IKUT, JANGKAU_NAIK, LOMPAT_KECIL, angkat, badanBaru, langkah, langkahJalan, lempar,
    mulaiLompat, ngintip, rencanaLompat, rute, titikDi,
} from '../hidup/fisika.js';

let gagal = 0;
let lolos = 0;
const cek = (label, syarat) => {
    if (syarat) {
        lolos++;
    } else {
        gagal++;
        console.log(`GAGAL: ${label}`);
    }
};
const sama = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const AREA = { x: 0, y: 32, lebar: 1600, tinggi: 868 };   // dasar di y = 900
const UKURAN = { lebar: 120, tinggi: 72 };
const L = UKURAN.lebar;
const DASAR = { x1: 0, x2: 1600, y: 900, jendelaId: null };
const J5 = { x1: 200, x2: 600, y: 600, jendelaId: 5 };
const J6 = { x1: 700, x2: 1100, y: 300, jendelaId: 6 };
const peta = (lantai, tepi = []) => ({ areaKerja: AREA, lantai, tepi, hanyaTepi: false, sembunyi: false });
const P = peta([DASAR, J5, J6]);

// Jalankan langkah sampai syarat terpenuhi; kembalikan jejak.
function jalankan(badan, pt, sampai, { maks = 80, gerakJendela } = {}) {
    const jejak = [];
    let b = badan;
    for (let i = 0; i < maks; i++) {
        const r = langkah(b, pt, { ukuran: UKURAN, gerakJendela });
        b = r.badan;
        jejak.push({ ...b, kejadian: r.kejadian });
        if (sampai(b, r.kejadian))
            break;
    }
    return { b, jejak };
}
const bulatSemua = jejak => jejak.every(j => Number.isInteger(j.x) && Number.isInteger(j.y));

// --- jatuh ---
let { b, jejak } = jalankan(badanBaru(1300, 100), P, x => x.keadaan === 'berdiri');
cek('jatuh: mendarat di dasar layar', b.y === 900 && b.pijakan === null);
cek('jatuh: ada kejadian mendarat', jejak.at(-1).kejadian.includes('mendarat'));
cek('jatuh: posisi selalu piksel bulat', bulatSemua(jejak));
({ b } = jalankan(badanBaru(400, 100), P, x => x.keadaan === 'berdiri'));
cek('jatuh: mendarat di lantai pertama yang dilintasi (atas jendela 5)', b.y === 600 && b.pijakan === 5);

// --- lompat berbusur ---
const berdiri = { ...badanBaru(300, 900), keadaan: 'berdiri', pijakan: null };
const tujuan = titikDi(J5, 400, L);
cek('titikDi menjepit supaya badan tidak menjulur', sama(titikDi(J5, 590, L), { x: 540, y: 600, jendelaId: 5 }));
const melompat = mulaiLompat(berdiri, tujuan);
cek('lompat: dalam jangkauan -> busur', melompat?.keadaan === 'melompat');
({ b, jejak } = jalankan(melompat, P, x => x.keadaan !== 'melompat'));
cek('lompat: tiba tepat di tujuan dan berdiri', b.keadaan === 'berdiri' && b.x === 400 && b.y === 600 && b.pijakan === 5);
cek('lompat: busur naik melewati tujuan', Math.min(...jejak.map(j => j.y)) < 600);
cek('lompat: piksel bulat', bulatSemua(jejak));
cek('lompat: terlalu tinggi -> null', mulaiLompat(berdiri, titikDi(J6, 800, L)) === null && 900 - 300 > JANGKAU_NAIK);
cek('lompat: terlalu jauh -> null', rencanaLompat({ x: 0, y: 900 }, { x: 600, y: 900 }) === null);
cek('lompat kecil rendah & cepat', rencanaLompat({ x: 0, y: 900 }, { x: 40, y: 900 }).n === 3);

// --- jalan ---
cek('jalan: satu langkah kecil ke arah tujuan', langkahJalan(berdiri, 500).x === 300 + LOMPAT_KECIL);
cek('jalan: langkah terakhir tidak kebablasan', langkahJalan(berdiri, 310).x === 310);
cek('jalan: ke kiri', langkahJalan(berdiri, 0).x === 300 - LOMPAT_KECIL);

// --- berdiri, lantai hilang, ikut jendela ---
const diJ5 = { ...badanBaru(400, 600), keadaan: 'berdiri', pijakan: 5 };
cek('berdiri: lantai ada -> tetap', langkah(diJ5, P, { ukuran: UKURAN }).badan.keadaan === 'berdiri');
let r = langkah(diJ5, peta([DASAR, J6]), { ukuran: UKURAN });
cek('berdiri: jendela ditutup -> jatuh', r.badan.keadaan === 'jatuh' && r.kejadian.includes('jatuh'));
({ b } = jalankan(r.badan, peta([DASAR, J6]), x => x.keadaan === 'berdiri'));
cek('berdiri: lalu mendarat di dasar', b.y === 900);
const J5geser = { ...J5, x1: 210, x2: 610, y: 595 };
r = langkah(diJ5, peta([DASAR, J5geser, J6]), { ukuran: UKURAN, gerakJendela: new Map([[5, { dx: 10, dy: -5 }]]) });
cek('ikut jendela yang digeser pelan', r.badan.keadaan === 'berdiri' && r.badan.x === 410 && r.badan.y === 595);
r = langkah(diJ5, P, { ukuran: UKURAN, gerakJendela: new Map([[5, { dx: BATAS_IKUT + 60, dy: 0 }]]) });
cek('jendela digeser cepat -> terjatuh', r.badan.keadaan === 'jatuh');

// --- dilempar & memantul ---
({ b, jejak } = jalankan(lempar({ ...badanBaru(1500, 500), keadaan: 'diangkat' }, 80, -20), P,
    x => x.keadaan === 'berdiri'));
const pantul = jejak.find(j => j.kejadian.includes('pantul'));
cek('lempar: memantul di tepi kanan layar', pantul && pantul.x === 1540 && pantul.vx < 0);
cek('lempar: mendarat keras', b.keadaan === 'berdiri' && jejak.at(-1).kejadian.includes('mendaratKeras'));
cek('lempar: tidak pernah keluar layar', jejak.every(j => j.x >= 60 && j.x <= 1540));

// --- diangkat & ngintip ---
const diangkat = angkat(diJ5, 800, 400);
cek('diangkat: fisika diam', sama(langkah(diangkat, P, { ukuran: UKURAN }).badan, diangkat));
const tepiJ7 = { jenis: 'jendela', sisi: 'atas', x: 980, y: 193, jendelaId: 7 };
const intip = ngintip(diJ5, tepiJ7);
cek('ngintip: diam selama jendelanya masih ada', langkah(intip, peta([DASAR], [tepiJ7]), { ukuran: UKURAN }).badan.keadaan === 'ngintip');
cek('ngintip: jendela hilang -> jatuh', langkah(intip, peta([DASAR], []), { ukuran: UKURAN }).badan.keadaan === 'jatuh');
const intipLayar = ngintip(diJ5, { jenis: 'layar', sisi: 'kanan', x: 1612, y: 900, jendelaId: null });
cek('ngintip tepi layar: tetap', langkah(intipLayar, P, { ukuran: UKURAN }).badan.keadaan === 'ngintip');

// --- rute ---
cek('rute: lewat lantai perantara', sama(rute({ x: 300, y: 900 }, { x: 900, y: 300 }, P, L), [
    { jenis: 'jalan', ke: { x: 400, y: 900, jendelaId: null } },
    { jenis: 'lompat', ke: { x: 400, y: 600, jendelaId: 5 } },
    { jenis: 'jalan', ke: { x: 540, y: 600, jendelaId: 5 } },
    { jenis: 'lompat', ke: { x: 760, y: 300, jendelaId: 6 } },
    { jenis: 'jalan', ke: { x: 900, y: 300, jendelaId: 6 } },
]));
cek('rute: lantai yang sama -> jalan saja', sama(rute({ x: 300, y: 900 }, { x: 1000, y: 900 }, P, L),
    [{ jenis: 'jalan', ke: { x: 1000, y: 900, jendelaId: null } }]));
cek('rute: sudah di tujuan -> kosong', sama(rute({ x: 300, y: 900 }, { x: 300, y: 900 }, P, L), []));
cek('rute: tak terjangkau -> null', rute({ x: 300, y: 900 }, { x: 900, y: 300 }, peta([DASAR, J6]), L) === null);
cek('rute: tujuan bukan lantai -> null', rute({ x: 300, y: 900 }, { x: 900, y: 450 }, P, L) === null);
cek('rute: berdiri di luar lantai peta -> satu lompatan bila terjangkau',
    sama(rute({ x: 800, y: 900 }, { x: 400, y: 600 }, peta([J5, J6]), L), [{ jenis: 'lompat', ke: { x: 400, y: 600, jendelaId: 5 } }]));

console.log(`\n${lolos} lolos, ${gagal} gagal`);
if (gagal)
    throw new Error(`${gagal} gagal`);
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `gjs -m extension/tests/test-fisika.js`
Expected: GAGAL dengan `ImportError: Module not found: .../extension/hidup/fisika.js`

- [ ] **Step 3: Implementasi**

Buat `extension/hidup/fisika.js`:

```js
// Badan Memo: gravitasi, lompatan berbusur, jatuh, terbawa jendela yang
// digeser, dilempar & memantul, dan rute lompatan antar lantai. Murni (tanpa
// St/Clutter/Meta). Satu langkah = 1/12 detik, sama dengan gaya piksel
// island; posisi selalu dibulatkan ke piksel.
//
// Titik badan = tengah bawah ("kaki"), sama dengan dunia.js. `peta` adalah
// keluaran dunia.petaDari().
//
// badan.keadaan:
//   berdiri   di lantai; pijakan = jendelaId (null = dasar layar)
//   melompat  mengikuti busur menuju titik pijak
//   jatuh     gravitasi sampai menyentuh lantai
//   dilempar  seperti jatuh, tapi memantul di tepi layar
//   diangkat  diseret kursor; fisika diam
//   ngintip   menempel di tepi (badan.tepi); fisika diam

export const LANGKAH_PER_DETIK = 12;
export const GRAVITASI = 9;          // piksel per langkah²
export const JANGKAU_X = 480;        // jarak mendatar terjauh satu lompatan
export const JANGKAU_NAIK = 320;     // kenaikan tertinggi satu lompatan
export const LOMPAT_KECIL = 40;      // satu "langkah jalan"
export const BATAS_IKUT = 40;        // jendela bergeser > ini per langkah -> Memo jatuh
export const REDAM_PANTUL = 0.5;

const bulat = v => Math.round(v);
const jepit = (v, a, b) => Math.min(b, Math.max(a, v));

export function badanBaru(x, y) {
    return { x: bulat(x), y: bulat(y), vx: 0, vy: 0, keadaan: 'jatuh', pijakan: undefined, busur: null, tepi: null };
}

// Titik pijak di lantai L yang paling dekat ke x, tanpa badan menjulur keluar.
export function titikDi(L, x, l) {
    return { x: bulat(jepit(x, L.x1 + l / 2, L.x2 - l / 2)), y: L.y, jendelaId: L.jendelaId };
}

const cocok = (L, p, l) => L.y === p.y && p.x >= L.x1 + l / 2 - 1 && p.x <= L.x2 - l / 2 + 1;

// Lantai fisik: lantai di peta + dasar layar sebagai lantai cadangan, supaya
// Memo yang jatuh selalu mendarat walau dasar sedang bukan tujuan yang boleh.
function lantaiFisik(peta) {
    const A = peta.areaKerja;
    return [...peta.lantai, { x1: A.x, x2: A.x + A.lebar, y: A.y + A.tinggi, jendelaId: null }];
}

export function mulaiJatuh(badan) {
    return { ...badan, keadaan: 'jatuh', vx: 0, vy: 0, pijakan: undefined, busur: null, tepi: null };
}

export function angkat(badan, x, y) {
    return { ...badan, x: bulat(x), y: bulat(y), vx: 0, vy: 0, keadaan: 'diangkat', pijakan: undefined, busur: null, tepi: null };
}

export function lempar(badan, vx, vy) {
    return { ...badan, vx, vy, keadaan: 'dilempar', pijakan: undefined, busur: null, tepi: null };
}

export function ngintip(badan, tepi) {
    return { ...badan, x: tepi.x, y: tepi.y, vx: 0, vy: 0, keadaan: 'ngintip', pijakan: tepi.jendelaId, busur: null, tepi: { ...tepi } };
}

// Busur dari titik `dari` ke titik pijak `ke`, atau null bila di luar jangkauan.
// Puncak ±36 px di atas titik yang lebih tinggi; lompatan kecil ("jalan")
// rendah dan cepat.
export function rencanaLompat(dari, ke) {
    const dx = ke.x - dari.x, naik = dari.y - ke.y;
    if (Math.abs(dx) > JANGKAU_X || naik > JANGKAU_NAIK)
        return null;
    const jarak = Math.hypot(dx, naik);
    const kecil = jarak <= LOMPAT_KECIL * 1.5;
    return {
        dari: { x: dari.x, y: dari.y }, ke: { x: ke.x, y: ke.y, jendelaId: ke.jendelaId ?? null },
        n: kecil ? 3 : Math.max(4, Math.min(12, Math.round(4 + jarak / 60))),
        h: kecil ? 8 : Math.abs(naik) / 2 + 36,
        i: 0,
    };
}

export function mulaiLompat(badan, ke) {
    const busur = rencanaLompat(badan, ke);
    if (!busur)
        return null;
    return { ...badan, keadaan: 'melompat', busur, pijakan: undefined, vx: 0, vy: 0, tepi: null };
}

// Titik lompatan kecil berikutnya menuju keX di lantai yang sama.
export function langkahJalan(badan, keX) {
    const dx = keX - badan.x;
    return { x: bulat(badan.x + Math.sign(dx) * Math.min(LOMPAT_KECIL, Math.abs(dx))), y: badan.y, jendelaId: badan.pijakan ?? null };
}

// Satu langkah fisika. gerakJendela: Map jendelaId -> {dx, dy} sejak langkah
// lalu (jendela digeser pengguna). Mengembalikan { badan, kejadian } dengan
// kejadian berisi 'mendarat', 'mendaratKeras', 'jatuh', 'pantul'.
export function langkah(badan, peta, { ukuran, gerakJendela = new Map() }) {
    const l = ukuran.lebar, t = ukuran.tinggi, A = peta.areaKerja;
    const fisik = lantaiFisik(peta);
    let b = { ...badan };
    const kejadian = [];
    const jatuh = () => {
        b = mulaiJatuh(b);
        kejadian.push('jatuh');
    };
    const ikut = () => {
        const g = b.pijakan !== undefined && b.pijakan !== null ? gerakJendela.get(b.pijakan) : null;
        if (!g)
            return true;
        if (Math.abs(g.dx) > BATAS_IKUT || Math.abs(g.dy) > BATAS_IKUT) {
            jatuh();
            return false;
        }
        b.x = bulat(b.x + g.dx);
        b.y = bulat(b.y + g.dy);
        return true;
    };

    switch (b.keadaan) {
    case 'diangkat':
        break;
    case 'ngintip':
        if (ikut() && b.tepi?.jenis === 'jendela' && !peta.tepi.some(e => e.jendelaId === b.pijakan))
            jatuh();
        break;
    case 'berdiri':
        if (ikut() && !fisik.some(L => cocok(L, b, l)))
            jatuh();
        break;
    case 'melompat': {
        const u = b.busur;
        const i = u.i + 1, s = i / u.n;
        b.x = bulat(u.dari.x + (u.ke.x - u.dari.x) * s);
        b.y = bulat(u.dari.y + (u.ke.y - u.dari.y) * s - 4 * u.h * s * (1 - s));
        b.busur = { ...u, i };
        if (i >= u.n) {
            if (fisik.some(L => cocok(L, u.ke, l))) {
                b = { ...b, x: u.ke.x, y: u.ke.y, keadaan: 'berdiri', pijakan: u.ke.jendelaId, busur: null };
                kejadian.push('mendarat');
            } else {
                jatuh();
            }
        }
        break;
    }
    case 'jatuh':
    case 'dilempar': {
        const yLama = b.y;
        const dilempar = b.keadaan === 'dilempar';
        b.vy += GRAVITASI;
        b.x = bulat(b.x + b.vx);
        b.y = bulat(b.y + b.vy);
        for (const [batas, arah] of [[A.x + l / 2, 1], [A.x + A.lebar - l / 2, -1]]) {
            if ((b.x - batas) * arah < 0) {
                b.x = bulat(batas);
                b.vx = dilempar ? Math.abs(b.vx) * REDAM_PANTUL * arah : 0;
                if (dilempar)
                    kejadian.push('pantul');
            }
        }
        if (b.y - t < A.y && b.vy < 0) {
            b.y = bulat(A.y + t);
            b.vy = -b.vy * REDAM_PANTUL;
            kejadian.push('pantul');
        }
        if (b.vy > 0) {
            const kena = fisik
                .filter(L => yLama <= L.y && b.y >= L.y && b.x >= L.x1 + l / 2 - 1 && b.x <= L.x2 - l / 2 + 1)
                .sort((p, q) => p.y - q.y)[0];
            if (kena) {
                b = { ...b, y: kena.y, vx: 0, vy: 0, keadaan: 'berdiri', pijakan: kena.jendelaId };
                kejadian.push(dilempar ? 'mendaratKeras' : 'mendarat');
            }
        }
        break;
    }
    }
    return { badan: b, kejadian };
}

// Rute dari titik berdiri `dari` ke titik pijak `tujuan` lewat lantai-lantai
// di peta (pencarian melebar di graf lantai: sisi = lompatan yang mungkin).
// Hasil: [{jenis: 'jalan' | 'lompat', ke: {x, y, jendelaId}}], [] bila sudah
// di sana, null bila tak terjangkau (pemanggil lalu "menyelinap").
export function rute(dari, tujuan, peta, l) {
    const lantai = peta.lantai;
    const akhir = lantai.findIndex(L => cocok(L, tujuan, l));
    if (akhir < 0)
        return null;
    const ke = { x: tujuan.x, y: tujuan.y, jendelaId: lantai[akhir].jendelaId };
    const awal = lantai.findIndex(L => cocok(L, dari, l));
    if (awal < 0)
        return rencanaLompat(dari, ke) ? [{ jenis: 'lompat', ke }] : null;

    const titikLompat = (A, B) => {
        const pA = titikDi(A, (B.x1 + B.x2) / 2, l);
        return [pA, titikDi(B, pA.x, l)];
    };
    const asal = new Map([[awal, null]]);
    const antre = [awal];
    while (antre.length && !asal.has(akhir)) {
        const i = antre.shift();
        lantai.forEach((B, j) => {
            if (asal.has(j))
                return;
            const [pA, pB] = titikLompat(lantai[i], B);
            if (rencanaLompat(pA, pB)) {
                asal.set(j, i);
                antre.push(j);
            }
        });
    }
    if (!asal.has(akhir))
        return null;

    const jalur = [];
    for (let j = akhir; j !== null; j = asal.get(j))
        jalur.unshift(j);
    const hasil = [];
    let posisi = { x: dari.x, y: dari.y };
    for (let k = 1; k < jalur.length; k++) {
        const [pA, pB] = titikLompat(lantai[jalur[k - 1]], lantai[jalur[k]]);
        if (pA.x !== posisi.x)
            hasil.push({ jenis: 'jalan', ke: pA });
        hasil.push({ jenis: 'lompat', ke: pB });
        posisi = pB;
    }
    if (posisi.x !== ke.x || posisi.y !== ke.y)
        hasil.push({ jenis: 'jalan', ke });
    return hasil;
}
```

- [ ] **Step 4: Jalankan, pastikan lolos**

Run: `gjs -m extension/tests/test-fisika.js`
Expected: `33 lolos, 0 gagal`

- [ ] **Step 5: Semua tes repo tetap hijau**

Run: `tests/semua.sh`
Expected: semua `ok`, termasuk `test-fisika.js 33 lolos, 0 gagal`.

- [ ] **Step 6: Commit**

```bash
git add extension/hidup/fisika.js extension/tests/test-fisika.js
git commit -m "feat(hidup): fisika badan Memo — lompat berbusur, jatuh, lempar, rute antar lantai

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tugas 4: Pikiran — keadaan, kebutuhan, simpan/muat

**Files:**
- Create: `extension/hidup/pikiran.js` (bagian pertama)
- Test: `extension/tests/test-pikiran.js` (bagian pertama)

**Interfaces:**
- Consumes: —
- Produces:
  - `SIFAT_BAWAAN = { penasaran: 0.7, aktif: 0.5, iseng: 0.4, manja: 0.6 }`, `KEBUTUHAN_BAWAAN = { energi: 0.8, bosan: 0.2, penasaran: 0.5, rindu: 0.3 }`, `KEGIATAN = ['jelajah', 'ngintip', 'nonton', 'temani', 'joget', 'iseng', 'tidur', 'sambut', 'melamun']`
  - `keadaanBaru({sifat, kebutuhan}) → keadaan = { sifat, kebutuhan, kegiatan, sisaMs, kenal: string[], dilihat: string[], jenuh: {} }`
  - `majukan(keadaan, { dtMs, jam, temuanBaru = 0, dekatKursor = false }) → keadaan`
  - `keJson(keadaan, sekarangMs) → { sifat, kebutuhan, disimpan }`, `dariJson(data, sekarangMs) → keadaan`

- [ ] **Step 1: Tulis tes yang gagal**

Buat `extension/tests/test-pikiran.js`:

```js
// Jalankan: gjs -m extension/tests/test-pikiran.js
import { KEBUTUHAN_BAWAAN, SIFAT_BAWAAN, dariJson, keJson, keadaanBaru, majukan } from '../hidup/pikiran.js';

let gagal = 0;
let lolos = 0;
const cek = (label, syarat) => {
    if (syarat) {
        lolos++;
    } else {
        gagal++;
        console.log(`GAGAL: ${label}`);
    }
};
const sama = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// --- keadaan & kebutuhan ---
let k = keadaanBaru({ sifat: { penasaran: 2, aktif: 'x' } });
cek('keadaanBaru: sifat dijepit 0..1, nilai rusak diabaikan', k.sifat.penasaran === 1 && k.sifat.aktif === SIFAT_BAWAAN.aktif);
cek('keadaanBaru: kebutuhan bawaan', sama(k.kebutuhan, KEBUTUHAN_BAWAAN));
const maju = (keg, opsi = {}) => majukan({ ...keadaanBaru(), kegiatan: keg }, { dtMs: 600000, jam: 10, ...opsi }).kebutuhan;
cek('tidur memulihkan energi', maju('tidur').energi > KEBUTUHAN_BAWAAN.energi);
cek('bergerak menguras energi lebih cepat dari melamun', maju('jelajah').energi < maju('melamun').energi);
cek('malam menguras energi lebih cepat', maju('melamun', { jam: 23 }).energi < maju('melamun').energi);
cek('melamun menambah bosan, jelajah mengurangi', maju('melamun').bosan > KEBUTUHAN_BAWAAN.bosan && maju('jelajah').bosan < KEBUTUHAN_BAWAAN.bosan);
cek('ngintip mengurangi penasaran', maju('ngintip').penasaran < maju('melamun').penasaran);
cek('jendela baru menaikkan penasaran', majukan(keadaanBaru(), { dtMs: 1000, jam: 10, temuanBaru: 1 }).kebutuhan.penasaran >
    majukan(keadaanBaru(), { dtMs: 1000, jam: 10 }).kebutuhan.penasaran + 0.1);
cek('semua kebutuhan tetap 0..1', Object.values(maju('tidur', { dtMs: 1e9 })).every(v => v >= 0 && v <= 1));

// --- simpan / muat ---
const simpan = keJson(keadaanBaru({ sifat: { manja: 0.9 }, kebutuhan: { energi: 0.3, bosan: 0.8 } }), Date.parse('2026-10-18T23:00:00Z'));
cek('keJson: sifat, kebutuhan, waktu', simpan.sifat.manja === 0.9 && simpan.kebutuhan.energi === 0.3 &&
    simpan.disimpan === '2026-10-18T23:00:00.000Z');
k = dariJson(simpan, Date.parse('2026-10-19T07:00:00Z'));
cek('muat sesudah 8 jam: energi penuh, tidak bosan, rindu naik', k.kebutuhan.energi === 1 && k.kebutuhan.bosan <= 0.2 &&
    k.kebutuhan.rindu > KEBUTUHAN_BAWAAN.rindu && k.sifat.manja === 0.9);
cek('muat data rusak -> bawaan', sama(dariJson({ sifat: 'x', disimpan: 'kemarin' }, Date.now()).kebutuhan, KEBUTUHAN_BAWAAN));
cek('muat tanpa data -> bawaan', sama(dariJson(null, Date.now()).sifat, SIFAT_BAWAAN));

console.log(`\n${lolos} lolos, ${gagal} gagal`);
if (gagal)
    throw new Error(`${gagal} gagal`);
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `gjs -m extension/tests/test-pikiran.js`
Expected: GAGAL dengan `ImportError: Module not found: .../extension/hidup/pikiran.js`

- [ ] **Step 3: Implementasi**

Buat `extension/hidup/pikiran.js`:

```js
// Pikiran Memo tanpa AI: kebutuhan yang naik-turun sendiri, sifat dari
// slider, ritme harian, dan pemilihan kegiatan dengan skor. Murni (tanpa
// St/Clutter/Meta); memoHidup.js memanggil pikir() sekali per detik.
//
// Keluar sebagai niat: { kegiatan, tujuan, ekspresi, emote, ikon }.
//   tujuan undefined  pertahankan tujuan yang sedang dijalani
//   tujuan null       diam di tempat
//   tujuan {jenis: 'titik', x, y, jendelaId}   titik pijak di lantai
//   tujuan {jenis: 'tepi', x, y, jendelaId, tepi}  menempel/ngintip di tepi
// Kegiatan khusus 'sembunyi' (aplikasi layar penuh) tidak punya tujuan.

// --- Keadaan, kebutuhan, simpan/muat ------------------------------------

export const SIFAT_BAWAAN = { penasaran: 0.7, aktif: 0.5, iseng: 0.4, manja: 0.6 };
export const KEBUTUHAN_BAWAAN = { energi: 0.8, bosan: 0.2, penasaran: 0.5, rindu: 0.3 };
export const KEGIATAN = ['jelajah', 'ngintip', 'nonton', 'temani', 'joget', 'iseng', 'tidur', 'sambut', 'melamun'];

const BERGERAK = new Set(['jelajah', 'iseng', 'joget', 'ngintip']);

const batas = v => Math.min(1, Math.max(0, v));

function saring(data, bawaan) {
    const hasil = { ...bawaan };
    for (const k of Object.keys(bawaan)) {
        if (typeof data?.[k] === 'number' && Number.isFinite(data[k]))
            hasil[k] = batas(data[k]);
    }
    return hasil;
}

export function keadaanBaru({ sifat = {}, kebutuhan = {} } = {}) {
    return {
        sifat: saring(sifat, SIFAT_BAWAAN), kebutuhan: saring(kebutuhan, KEBUTUHAN_BAWAAN),
        kegiatan: 'melamun', sisaMs: 0,
        kenal: [],     // jendela (id:judul) yang sudah pernah terlihat
        dilihat: [],   // jendela (id:judul) yang sudah diintip/ditonton
        jenuh: {},     // kegiatan -> 0..1, naik selama dilakukan, pulih pelan
    };
}

// Kebutuhan berubah sendiri selama dtMs. Laju per detik.
export function majukan(keadaan, { dtMs, jam, temuanBaru = 0, dekatKursor = false }) {
    const { sifat: s, kegiatan } = keadaan;
    const k = { ...keadaan.kebutuhan };
    const d = dtMs / 1000;
    const malam = jam >= 22 || jam < 5;
    const siang = jam === 13;
    if (kegiatan === 'tidur') {
        k.energi += 0.0015 * d;
    } else {
        const kali = (BERGERAK.has(kegiatan) ? 2 : 1) * (malam ? 2 : siang ? 1.5 : 1);
        k.energi -= 0.0003 * d * (1.5 - s.aktif) * kali;
        k.bosan += (BERGERAK.has(kegiatan) ? -0.01 : kegiatan === 'nonton' ? -0.003 : 0.002) * d;
    }
    k.penasaran += 0.001 * d * (0.5 + s.penasaran) + temuanBaru * 0.3 * (0.5 + s.penasaran);
    if (kegiatan === 'ngintip')
        k.penasaran -= 0.02 * d;
    else if (kegiatan === 'jelajah' || kegiatan === 'nonton')
        k.penasaran -= 0.004 * d;
    // Menemani & menyambut memuaskan rindu, seperti kursor yang lama di dekatnya.
    const ditemani = kegiatan === 'temani' || kegiatan === 'sambut';
    k.rindu += (ditemani ? -0.003 : dekatKursor ? -0.002 : 0.0008 * (0.5 + s.manja)) * d;
    for (const n of Object.keys(k))
        k[n] = batas(k[n]);
    // Jenuh: penuh sesudah ±15 menit melakukan hal yang sama, pulih ±30 menit.
    const jenuh = {};
    for (const n of KEGIATAN) {
        const naik = n === kegiatan && n !== 'tidur' && n !== 'sambut';
        jenuh[n] = batas((keadaan.jenuh?.[n] ?? 0) + (naik ? d / 900 : -d / 1800));
    }
    return { ...keadaan, kebutuhan: k, jenuh };
}

// Simpan / muat (~/.config/memo/hidup.json). Saat dimuat, kebutuhan
// dimajukan sesuai waktu yang lewat seolah Memo tidur selama laptop mati.
export function keJson(keadaan, sekarangMs) {
    return { sifat: { ...keadaan.sifat }, kebutuhan: { ...keadaan.kebutuhan }, disimpan: new Date(sekarangMs).toISOString() };
}

export function dariJson(data, sekarangMs) {
    const k = keadaanBaru({ sifat: data?.sifat, kebutuhan: data?.kebutuhan });
    const lalu = Date.parse(data?.disimpan ?? '');
    if (Number.isFinite(lalu) && sekarangMs > lalu) {
        const d = Math.min((sekarangMs - lalu) / 1000, 7 * 86400);
        k.kebutuhan = {
            energi: batas(k.kebutuhan.energi + 0.0015 * d),
            bosan: Math.min(k.kebutuhan.bosan, 0.2),
            penasaran: Math.max(k.kebutuhan.penasaran, 0.5),
            rindu: batas(k.kebutuhan.rindu + 0.0008 * d * (0.5 + k.sifat.manja)),
        };
    }
    return k;
}
```

- [ ] **Step 4: Jalankan, pastikan lolos**

Run: `gjs -m extension/tests/test-pikiran.js`
Expected: `13 lolos, 0 gagal`

- [ ] **Step 5: Semua tes repo tetap hijau**

Run: `tests/semua.sh`
Expected: semua `ok`, termasuk `test-pikiran.js 13 lolos, 0 gagal`.

- [ ] **Step 6: Commit**

```bash
git add extension/hidup/pikiran.js extension/tests/test-pikiran.js
git commit -m "feat(hidup): kebutuhan & sifat Memo, berlanjut sesudah laptop mati

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tugas 5: Pikiran — memilih kegiatan dan tujuan

**Files:**
- Modify: `extension/hidup/pikiran.js` (tambah impor + bagian "Memilih kegiatan")
- Modify: `extension/tests/test-pikiran.js` (impor, alat simulasi, tes baru)

**Interfaces:**
- Consumes: `bolehDi` (Tugas 2), `titikDi` (Tugas 3), `kenali` (Tugas 1), fungsi Tugas 4.
- Produces: `pikir(keadaan, ctx) → { keadaan, niat }`.
  - `ctx = { persepsi, peta, ukuran, posisi: {x, y}, tepi /* tepi tempat Memo menempel atau null */, dtMs, acak: () => [0,1), pergi, kembali, dielus, sampai }`
  - `niat = null` (tidak ada yang berubah) atau `{ kegiatan, tujuan, ekspresi, emote, ikon }`; `kegiatan` salah satu `KEGIATAN` atau `'sembunyi'`.
  - `tujuan`: `undefined` = pertahankan; `null` = diam; `{jenis: 'titik', x, y, jendelaId}`; `{jenis: 'tepi', x, y, jendelaId, tepi}` (objek tepi dari peta).

- [ ] **Step 1: Perbarui impor tes**

Di `extension/tests/test-pikiran.js`, ganti dua baris pertama:

```js
// Jalankan: gjs -m extension/tests/test-pikiran.js
import { KEBUTUHAN_BAWAAN, SIFAT_BAWAAN, dariJson, keJson, keadaanBaru, majukan } from '../hidup/pikiran.js';
```

dengan:

```js
// Jalankan: gjs -m extension/tests/test-pikiran.js
import { bolehDi, petaDari } from '../hidup/dunia.js';
import {
    KEBUTUHAN_BAWAAN, KEGIATAN, SIFAT_BAWAAN, dariJson, keJson, keadaanBaru, majukan, pikir,
} from '../hidup/pikiran.js';
```

- [ ] **Step 2: Tambah alat simulasi**

Sisipkan tepat sesudah baris `const sama = (a, b) => JSON.stringify(a) === JSON.stringify(b);` (dan baris kosong sesudahnya):

```js
function acakDari(benih) {
    let a = benih >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), a | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const AREA = { x: 0, y: 32, lebar: 1600, tinggi: 868 };
const UKURAN = { lebar: 120, tinggi: 72 };
const YT = { id: 2, x: 950, y: 150, lebar: 600, tinggi: 400, aplikasi: 'firefox', judul: 'Lofi — YouTube' };
const VS = { id: 1, x: 100, y: 300, lebar: 800, tinggi: 500, aktif: true, aplikasi: 'Code', judul: 'memo' };
const TG = { id: 9, x: 1000, y: 600, lebar: 500, tinggi: 250, aplikasi: 'TelegramDesktop', judul: 'Telegram' };

// Kursor berpindah tiap 20 detik di dalam jendela VS Code (kamu sedang ngoding).
const kursorKerja = acak => {
    let kini = { x: 400, y: 500 };
    return t => {
        if (t % 20 === 0)
            kini = { x: Math.round(150 + acak() * 700), y: Math.round(350 + acak() * 400) };
        return kini;
    };
};

// Simulasi: Memo dianggap langsung tiba di tiap tujuan.
function simulasi({ sifat = {}, detik, jendela = () => [YT, VS], jam = () => 10, pergi = () => false, benih = 7 }) {
    const acak = acakDari(benih);
    const kursor = kursorKerja(acakDari(benih + 1));
    let k = keadaanBaru({ sifat });
    let posisi = { x: 1300, y: 900 };
    let tepi = null;
    let pergiLalu = false;
    const catat = { lama: {}, tujuan: [], niat: [] };
    for (let t = 0; t < detik; t++) {
        const persepsi = { areaKerja: AREA, jendela: jendela(t), kursor: kursor(t), jam: jam(t) };
        const peta = petaDari(persepsi, UKURAN);
        const pg = pergi(t);
        const r = pikir(k, { persepsi, peta, ukuran: UKURAN, posisi, tepi, dtMs: 1000, acak,
            pergi: pg, kembali: pergiLalu && !pg, sampai: true });
        pergiLalu = pg;
        k = r.keadaan;
        if (r.niat) {
            catat.niat.push({ t, ...r.niat });
            if (r.niat.tujuan) {
                catat.tujuan.push({ t, tujuan: r.niat.tujuan, peta });
                posisi = { x: r.niat.tujuan.x, y: r.niat.tujuan.y };
                tepi = r.niat.tujuan.tepi ?? null;
            }
        }
        catat.lama[k.kegiatan] = (catat.lama[k.kegiatan] ?? 0) + 1;
    }
    return { k, catat };
}
```

- [ ] **Step 3: Tambah tes pikiran & simulasi**

Sisipkan tepat sebelum baris ``console.log(`\n${lolos} lolos, ${gagal} gagal`);`` di akhir berkas:

```js
// --- satu detik pikiran, kasus khusus ---
const dasar = (jendela, kursor = { x: 400, y: 500 }) => {
    const persepsi = { areaKerja: AREA, jendela, kursor, jam: 10 };
    return { persepsi, peta: petaDari(persepsi, UKURAN), ukuran: UKURAN, posisi: { x: 1300, y: 900 }, tepi: null,
        dtMs: 1000, acak: acakDari(3) };
};
let r = pikir(keadaanBaru(), { ...dasar([YT, VS]), pergi: true });
cek('kamu pergi -> tidur', r.keadaan.kegiatan === 'tidur' && r.niat.ekspresi === 'tidur');
r = pikir(r.keadaan, { ...dasar([YT, VS]), kembali: true });
cek('kamu kembali -> sambut dengan hati', r.keadaan.kegiatan === 'sambut' && r.niat.ikon === 'hati');
r = pikir(keadaanBaru(), dasar([YT, { ...VS, layarPenuh: true }]));
cek('aplikasi layar penuh -> sembunyi', r.niat?.kegiatan === 'sembunyi');
cek('sembunyi: detik berikutnya tidak ada niat baru', pikir(r.keadaan, dasar([YT, { ...VS, layarPenuh: true }])).niat === null);
r = pikir({ ...keadaanBaru({ kebutuhan: { rindu: 0.9 } }), sisaMs: 99999 }, { ...dasar([YT, VS]), dielus: true });
cek('dielus -> rindu turun & bereaksi tanpa pindah', Math.abs(r.keadaan.kebutuhan.rindu - 0.4) < 0.01 &&
    r.niat.emote === 'tepuk' && r.niat.ikon === 'hati' && r.niat.tujuan === undefined);
const dekat = dasar([YT, VS], { x: 1300, y: 880 });
r = pikir({ ...keadaanBaru(), sisaMs: 99999 }, dekat);
cek('kursor mendekat -> menyingkir ke tempat yang boleh', r.niat?.tujuan &&
    bolehDi(dekat.peta, { ...r.niat.tujuan, jenis: r.niat.tujuan.tepi?.jenis ?? null }, UKURAN));
const MAX = { ...VS, x: 0, y: 32, lebar: 1600, tinggi: 868, maksimal: true };
r = pikir(keadaanBaru(), dasar([YT, MAX], { x: 400, y: 500 }));
cek('jendela aktif maximize -> ke tepi layar', r.niat?.tujuan?.jenis === 'tepi' && r.niat.tujuan.tepi.jenis === 'layar');

// --- simulasi ---
let { catat } = simulasi({ detik: 4 * 3600 });
const salah = catat.tujuan.filter(({ tujuan, peta }) =>
    !bolehDi(peta, { ...tujuan, jenis: tujuan.tepi?.jenis ?? null }, UKURAN));
cek(`4 jam: tujuan tidak pernah di zona larangan (${salah.length} salah dari ${catat.tujuan.length})`,
    salah.length === 0 && catat.tujuan.length > 50);
cek('4 jam: semua kegiatan sah', Object.keys(catat.lama).every(n => KEGIATAN.includes(n)));
cek('4 jam: ada jendela video -> pernah nonton', (catat.lama.nonton ?? 0) > 0);
cek('4 jam: kamu ngoding -> pernah menemani', (catat.lama.temani ?? 0) > 0);
cek(`4 jam: kegiatan bervariasi (${Object.keys(catat.lama).join(', ')})`, Object.keys(catat.lama).length >= 4);

const malas = simulasi({ sifat: { aktif: 0.05 }, detik: 6 * 3600, jam: () => 23 }).catat.lama.tidur ?? 0;
const rajin = simulasi({ sifat: { aktif: 0.95 }, detik: 6 * 3600, jam: () => 23 }).catat.lama.tidur ?? 0;
cek(`sifat malas lebih banyak tidur (${malas} dtk) daripada aktif (${rajin} dtk)`, malas > rajin);

({ catat } = simulasi({ sifat: { penasaran: 0.95 }, detik: 1800, jendela: t => (t < 600 ? [YT, VS] : [YT, TG, VS]) }));
const intipTG = catat.niat.find(n => n.t >= 600 && n.kegiatan === 'ngintip' && n.tujuan?.jendelaId === 9);
cek(`jendela baru (Telegram) diintip dalam 10 menit (detik ke-${intipTG?.t})`, intipTG && intipTG.t < 1200);

({ catat } = simulasi({ detik: 1200, pergi: t => t >= 300 && t < 900 }));
cek('pergi 10 menit: tidur sepanjang waktu itu', catat.niat.some(n => n.t === 300 && n.kegiatan === 'tidur') &&
    !catat.niat.some(n => n.t > 300 && n.t < 900 && n.kegiatan !== 'tidur'));
cek('lalu menyambut saat kembali', catat.niat.some(n => n.t === 900 && n.kegiatan === 'sambut'));
```

- [ ] **Step 4: Jalankan, pastikan gagal**

Run: `gjs -m extension/tests/test-pikiran.js`
Expected: GAGAL dengan `SyntaxError: ... does not provide an export named 'pikir'`

- [ ] **Step 5: Tambah impor di pikiran.js**

Sisipkan blok ini tepat sesudah komentar kepala berkas (sebelum baris `// --- Keadaan, kebutuhan, simpan/muat ---...`):

```js
import { bolehDi } from './dunia.js';
import { titikDi } from './fisika.js';
import { kenali } from './kenalAplikasi.js';
```

- [ ] **Step 6: Tambah bagian "Memilih kegiatan"**

Tambahkan di akhir `extension/hidup/pikiran.js`:

```js

// --- Memilih kegiatan ---------------------------------------------------

// Lama tiap kegiatan [min, maks] detik sebelum dipilih ulang.
const LAMA = {
    jelajah: [20, 40], ngintip: [6, 12], nonton: [30, 90], temani: [30, 60], joget: [15, 30],
    iseng: [5, 10], tidur: [60, 60], sambut: [3, 3], melamun: [10, 25],
};
const EKSPRESI = {
    jelajah: 'netral', ngintip: 'mendengar', nonton: 'mendengar', temani: 'netral', joget: 'senang',
    iseng: 'senang', tidur: 'tidur', sambut: 'senang', melamun: 'netral',
};
const EMOTE = { sambut: 'lompat', joget: 'dansa', iseng: 'putar', ngintip: 'kaget' };
const IKON = { ngintip: 'tanya', sambut: 'hati', joget: 'musik' };

const kunci = w => `${w.id}:${w.judul ?? ''}`;

function skor(c) {
    const { k, s } = c;
    return {
        jelajah: (0.7 * k.bosan + 0.3 * k.penasaran) * (0.6 + s.aktif) * (k.energi > 0.3 ? 1 : 0.2),
        // Jendela baru paling menarik; yang sudah dikenal sesekali diintip lagi.
        ngintip: c.baru.length ? (0.3 + k.penasaran) * (0.6 + s.penasaran) : k.penasaran * (0.6 + s.penasaran) * 0.35,
        nonton: c.video.length ? 0.45 + 0.3 * s.penasaran : 0,
        temani: c.kerja ? 0.25 + k.rindu * (0.4 + s.manja) : 0,
        joget: c.musik ? 0.4 + 0.4 * s.iseng : 0,
        iseng: k.energi > 0.5 ? s.iseng * 0.6 * (0.5 + k.bosan) : 0,
        tidur: c.pergi ? 3 : Math.max(0, 0.35 - k.energi) * 4 * (1.5 - s.aktif) + (c.malam ? 0.15 : 0) +
            (c.kegiatan === 'tidur' && k.energi < 0.9 ? 0.8 : 0),
        sambut: c.kembali ? 4 : 0,
        melamun: 0.3,
    };
}

// Titik di lantai L yang boleh ditempati, dicoba beberapa kali secara acak.
function titikBoleh(L, c, { x = null } = {}) {
    const l = c.ukuran.lebar;
    for (let n = 0; n < 6; n++) {
        const tx = x !== null && n === 0 ? x : L.x1 + l / 2 + c.acak() * Math.max(0, L.x2 - L.x1 - l);
        const p = titikDi(L, tx, l);
        if (bolehDi(c.peta, p, c.ukuran))
            return { jenis: 'titik', ...p };
    }
    return null;
}

function tepiBoleh(daftar, c) {
    const boleh = daftar.filter(e => bolehDi(c.peta, e, c.ukuran));
    // Pilih yang jauh dari kursor.
    boleh.sort((p, q) => Math.hypot(q.x - c.kursor.x, q.y - c.kursor.y) - Math.hypot(p.x - c.kursor.x, p.y - c.kursor.y));
    const e = boleh[Math.floor(c.acak() * Math.min(2, boleh.length))];
    return e ? { jenis: 'tepi', x: e.x, y: e.y, jendelaId: e.jendelaId, tepi: e } : null;
}

function pilihTujuan(kegiatan, c) {
    const { peta, ukuran, posisi } = c;
    const tepiLayar = peta.tepi.filter(e => e.jenis === 'layar');
    if (peta.hanyaTepi)
        return c.diTepi && c.posisiBoleh ? null : tepiBoleh(tepiLayar, c);
    const terdekat = () => {
        const urut = [...peta.lantai].sort((p, q) =>
            Math.hypot(titikDi(p, posisi.x, ukuran.lebar).x - posisi.x, p.y - posisi.y) -
            Math.hypot(titikDi(q, posisi.x, ukuran.lebar).x - posisi.x, q.y - posisi.y));
        for (const L of urut) {
            const t = titikBoleh(L, c, { x: posisi.x });
            if (t)
                return t;
        }
        return tepiBoleh(tepiLayar, c);
    };
    const dariLantai = (daftar, opsi) => {
        for (const L of daftar) {
            const t = titikBoleh(L, c, opsi?.(L));
            if (t)
                return t;
        }
        return null;
    };
    let t = null;
    switch (kegiatan) {
    case 'jelajah': {
        const jauh = [...peta.lantai].sort((p, q) =>
            Math.abs(q.y - posisi.y) + Math.abs((q.x1 + q.x2) / 2 - posisi.x) -
            Math.abs(p.y - posisi.y) - Math.abs((p.x1 + p.x2) / 2 - posisi.x));
        t = dariLantai(jauh.slice(0, Math.max(1, Math.ceil(jauh.length / 2))).sort(() => c.acak() - 0.5));
        break;
    }
    case 'iseng': {
        const lain = peta.lantai.filter(L => L.jendelaId !== null && L.jendelaId !== c.aktifId);
        t = dariLantai(lain.sort(() => c.acak() - 0.5));
        break;
    }
    case 'ngintip': {
        const baru = new Set(c.baru.map(w => w.id));
        const tepi = peta.tepi.filter(e => e.jenis === 'jendela');
        t = tepiBoleh(tepi.filter(e => baru.has(e.jendelaId)), c) ?? tepiBoleh(tepi, c) ?? tepiBoleh(tepiLayar, c);
        break;
    }
    case 'nonton': {
        const ids = new Set(c.video.map(w => w.id));
        t = dariLantai(peta.lantai.filter(L => ids.has(L.jendelaId)), L => ({ x: (L.x1 + L.x2) / 2 }));
        break;
    }
    case 'temani': {
        const atasAktif = peta.lantai.filter(L => L.jendelaId === c.aktifId);
        // Sejauh mungkin dari kursor, tapi tetap di dekat jendela yang kamu pakai.
        t = dariLantai(atasAktif, L => ({ x: Math.abs(L.x1 - c.kursor.x) > Math.abs(L.x2 - c.kursor.x) ? L.x1 : L.x2 })) ??
            dariLantai(peta.lantai.filter(L => L.jendelaId === null));
        break;
    }
    case 'tidur': {
        const A = peta.areaKerja;
        const dasar = peta.lantai.filter(L => L.jendelaId === null);
        t = dariLantai(dasar, () => ({ x: A.x })) ?? dariLantai(dasar, () => ({ x: A.x + A.lebar })) ??
            tepiBoleh(tepiLayar.filter(e => e.sisi !== 'bawah'), c);
        break;
    }
    default:   // joget, sambut, melamun: di tempat
        t = null;
    }
    // Tidak ada tempat yang cocok: diam bila tempat sekarang boleh, kalau
    // tidak ke tempat boleh yang terdekat.
    if (t)
        return t;
    return c.posisiBoleh ? null : terdekat();
}

// Satu detik pikiran. ctx:
//   persepsi, peta, ukuran, posisi {x, y}, tepi (tepi tempat Memo menempel
//   atau null), dtMs, acak (fungsi -> [0,1))
//   pergi (bolehTidur island), kembali (baru saja pergi -> ada lagi)
//   dielus, sampai (tiba di tujuan)
// Mengembalikan { keadaan, niat } (niat null bila tidak ada yang berubah).
export function pikir(keadaan, ctx) {
    const { persepsi, peta, posisi, ukuran, acak } = ctx;
    const jendela = persepsi.jendela;
    const kunciKini = new Set(jendela.map(kunci));
    // Jendela baru dihitung penuh; judul yang berganti (pindah halaman,
    // pindah folder di terminal) hanya sedikit menambah penasaran.
    const idKenal = new Set(keadaan.kenal.map(x => x.split(':')[0]));
    const jendelaBaru = jendela.filter(w => !idKenal.has(String(w.id))).length;
    const temuanBaru = jendelaBaru + 0.3 * jendela.filter(w => idKenal.has(String(w.id)) && !keadaan.kenal.includes(kunci(w))).length;
    const kursor = persepsi.kursor;
    let k = majukan(keadaan, {
        dtMs: ctx.dtMs, jam: persepsi.jam ?? 12, temuanBaru,
        dekatKursor: Math.hypot(posisi.x - kursor.x, posisi.y - kursor.y) < 300,
    });
    k = {
        ...k,
        kenal: [...kunciKini],
        dilihat: k.dilihat.filter(x => kunciKini.has(x)),
        sisaMs: k.sisaMs - ctx.dtMs,
    };

    if (peta.sembunyi) {
        if (k.kegiatan === 'sembunyi')
            return { keadaan: k, niat: null };
        return { keadaan: { ...k, kegiatan: 'sembunyi', sisaMs: 0 }, niat: { kegiatan: 'sembunyi', tujuan: null } };
    }

    const aktif = jendela.find(w => w.aktif) ?? null;
    const kategori = w => kenali(w.aplikasi, w.judul);
    const c = {
        k: k.kebutuhan, s: k.sifat, peta, ukuran, posisi, kursor, acak, kegiatan: k.kegiatan,
        aktifId: aktif?.id ?? null,
        baru: jendela.filter(w => !w.aktif && !k.dilihat.includes(kunci(w))),
        video: jendela.filter(w => kategori(w) === 'video'),
        musik: jendela.some(w => kategori(w) === 'musik'),
        kerja: !!aktif && ['kode', 'dokumen', 'terminal'].includes(kategori(aktif)),
        malam: (persepsi.jam ?? 12) >= 22 || (persepsi.jam ?? 12) < 5,
        pergi: !!ctx.pergi, kembali: !!ctx.kembali, diTepi: !!ctx.tepi,
        posisiBoleh: bolehDi(peta, { ...posisi, jenis: ctx.tepi?.jenis ?? null }, ukuran),
    };

    if (ctx.dielus) {
        k.kebutuhan = { ...k.kebutuhan, rindu: batas(k.kebutuhan.rindu - 0.5) };
        if (k.kegiatan === 'tidur' && !c.pergi)
            k.sisaMs = 0;
        return { keadaan: k, niat: { kegiatan: k.kegiatan, tujuan: undefined, ekspresi: 'senang', emote: 'tepuk', ikon: 'hati' } };
    }

    // Jendela yang benar-benar baru (bukan sekadar ganti judul) membuat Memo
    // menoleh: kegiatan dipilih ulang, kecuali sedang tidur.
    const menoleh = jendelaBaru > 0 && keadaan.kenal.length > 0 && k.kegiatan !== 'tidur';
    const harusPilih = k.sisaMs <= 0 || menoleh || k.kegiatan === 'sembunyi' || c.kembali ||
        (c.pergi && k.kegiatan !== 'tidur') || (k.kegiatan === 'tidur' && !c.pergi && k.kebutuhan.energi >= 0.95);
    if (harusPilih) {
        const nilai = skor(c);
        let pilihan = 'melamun', terbaik = -1;
        for (const n of KEGIATAN) {
            // Makin jenuh makin kurang menarik, supaya Memo tidak menonton
            // seharian hanya karena YouTube terbuka.
            const v = nilai[n] * (1 - 0.8 * (k.jenuh[n] ?? 0)) * (0.85 + 0.3 * acak());
            if (v > terbaik) {
                terbaik = v;
                pilihan = n;
            }
        }
        const [a, b] = LAMA[pilihan];
        const tujuan = pilihTujuan(pilihan, c);
        if (tujuan?.jendelaId !== undefined && pilihan !== 'temani') {
            const w = jendela.find(x => x.id === tujuan.jendelaId);
            if (w && !k.dilihat.includes(kunci(w)))
                k.dilihat = [...k.dilihat, kunci(w)];
        }
        k = { ...k, kegiatan: pilihan, sisaMs: (a + acak() * (b - a)) * 1000 };
        return {
            keadaan: k,
            niat: { kegiatan: pilihan, tujuan, ekspresi: EKSPRESI[pilihan], emote: EMOTE[pilihan] ?? null, ikon: IKON[pilihan] ?? null },
        };
    }

    // Penyela: kursor/jendela aktif mendesak -> menyingkir. Tiba di tujuan
    // saat jelajah/iseng -> lanjut ke tempat berikutnya.
    if (!c.posisiBoleh || (ctx.sampai && (k.kegiatan === 'jelajah' || k.kegiatan === 'iseng'))) {
        const tujuan = pilihTujuan(c.posisiBoleh ? k.kegiatan : 'melamun', { ...c, posisiBoleh: c.posisiBoleh });
        const pemalu = k.sifat.manja < 0.4;
        return {
            keadaan: k,
            niat: { kegiatan: k.kegiatan, tujuan, ekspresi: EKSPRESI[k.kegiatan], emote: !c.posisiBoleh && pemalu ? 'kaget' : null, ikon: null },
        };
    }
    return { keadaan: k, niat: null };
}
```

- [ ] **Step 7: Jalankan, pastikan lolos**

Run: `gjs -m extension/tests/test-pikiran.js`
Expected: `29 lolos, 0 gagal`. Tes simulasi memeriksa: tujuan tidak pernah di zona larangan selama 4 jam simulasi, pernah menonton & menemani, kegiatan bervariasi (≥ 4 jenis), sifat malas lebih banyak tidur, jendela baru diintip dalam 10 menit, pergi → tidur → kembali → sambut.

- [ ] **Step 8: Semua tes repo tetap hijau**

Run: `tests/semua.sh`
Expected: semua `ok`, termasuk `test-pikiran.js 29 lolos, 0 gagal`.

- [ ] **Step 9: Commit**

```bash
git add extension/hidup/pikiran.js extension/tests/test-pikiran.js
git commit -m "feat(hidup): Memo memilih kegiatan sendiri — skor, jenuh, penyela, tujuan

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tugas 6: Badan di GNOME Shell + serah-terima island

**Files:**
- Create: `extension/hidup/memoHidup.js`
- Create: `tests/gnome/jendela-uji.js`
- Modify: `extension/extension.js` (impor, konstanta, konstruktor, menu, izin, API untuk Memo hidup, gerak/tidur/tint/destroy, notifikasi)
- Modify: `extension/stylesheet.css` (`.memo-companion` → `.memo-hidup`)
- Modify: `tests/gnome/skenario.py`
- Delete: `extension/companion.js`

**Interfaces:**
- Consumes: semua modul Tugas 1–5; dari island: `bolehKeluar()`, `posisiIsland() → [x, y]`, `memoKeluar()`, `memoKembali()`, getter `sedangTidur`, `bukaMenu()`.
- Produces (dipakai island & panel): `class MemoHidup(island)` dengan `actor`, getter `aktif`, `diLuar`, `sifat`; `setAktif(bool)`, `setSifat(nama, nilai)`, `panggilKeSini()`, `pulang()`, `gerak(nama, opsi)`, `setTint(hue, glowBoost)`, `simpan()`, `destroy()`. Island: getter `hidup`, `kabarDatang()`.

- [ ] **Step 1: Jendela uji untuk skenario**

Buat `tests/gnome/jendela-uji.js`:

```js
// Jendela GTK kosong untuk skenario Memo hidup (tests/gnome/skenario.py):
//   gjs -m jendela-uji.js <judul> [--maksimal]
// NON_UNIQUE supaya dua jendela uji bisa terbuka bersamaan.
import Gtk from 'gi://Gtk?version=4.0';
import Gio from 'gi://Gio';

const [judul = 'Jendela Uji Memo', ...sisa] = ARGV;
const app = new Gtk.Application({ application_id: 'com.local.MemoJendelaUji', flags: Gio.ApplicationFlags.NON_UNIQUE });
app.connect('activate', () => {
    const w = new Gtk.ApplicationWindow({ application: app, title: judul, default_width: 700, default_height: 380 });
    if (sisa.includes('--maksimal'))
        w.maximize();
    w.present();
});
app.run([]);
```

- [ ] **Step 2: Skenario — ganti uji companion dengan uji Memo hidup (tes gagal)**

Di `tests/gnome/skenario.py`, ganti blok ini:

```python
ev("const p = memoUji.island()._panel; p.pilihTab('atur'); p._tombolDesktop.emit('clicked', 1); memoUji.island().menu.close(); return true;")
k = ev("const c = memoUji.island()._companion; return {ada: !!c, tampil: c?.visible};")
cek("Memo desktop bisa dilepas", k == {"ada": True, "tampil": True}, k)
cek("posisi Memo desktop disimpan di config uji, bukan ~/.config asli", os.path.exists(f"{T}/config/memo/companion.json"))
ev("memoUji.island().gerak('lompat'); return true;")
s = sampel("const c = memoUji.island()._companion; return {e: c._gerak.emoteAktif, ty: c._face.actor.translation_y, s: c._face.actor.scale_y};", 0.7)
cek("Memo desktop ikut melompat bersama island", any(x.get("e") == "lompat" for x in s) and min(x.get("ty", 0) for x in s) < -5, s[:3])
time.sleep(0.6)
cek("Memo desktop kembali ke skala 2,6x setelah emote", abs(ev("return memoUji.island()._companion._face.actor.scale_y;") - 2.6) < 0.01)
potret("5-desktop", (1000, 0, 600, 900))
```

dengan:

```python
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
ev(H + "h.setAktif(true); memoUji.island().menu.close(); memoUji.island()._kabarTerakhir = 0; return true;")
k = tunggu_hidup(lambda k: k["luar"] and k["keadaan"] == "berdiri", 10)
cek("jalan-jalan dinyalakan -> Memo keluar dari island & mendarat", k.get("luar") and k.get("tampak") and k.get("keadaan") == "berdiri", k)
cek("island meredup saat Memo keluar", k.get("redup") == 70, k)
cek("jalan-jalan tersimpan di config uji, bukan ~/.config asli", json.load(open(f"{T}/config/memo/hidup.json")).get("aktif") is True)
ev("memoUji.island().gerak('lompat'); return true;")
s = sampel(H + "return {e: h._gerak.emoteAktif, ty: h.actor.translation_y};", 0.7)
cek("Memo hidup ikut melompat bersama island", any(x.get("e") == "lompat" for x in s) and min(x.get("ty", 0) for x in s) < -5, s[:3])
potret("5-desktop", (0, 0, 1600, 900))
```

Lalu ganti:

```python
k = ev("const c = memoUji.island()._companion; return {e: c._gerak.emoteAktif, p: c._gerak.jumlahPartikel};")
cek("Memo desktop ikut berjoget + koin", k.get("e") == "dansa" and k.get("p", 0) >= 1, k)
```

dengan:

```python
k = tunggu_hidup(lambda k: not k["luar"], 4)
cek("kabar datang -> Memo pulang ke island", k.get("luar") is False and k.get("redup") == 255, k)
ev(H + "h.setAktif(false); return true;")
```

Lalu ganti (uji tidur tidak lagi memeriksa companion):

```python
    k = ev("const i = memoUji.island(); return {tidur: i._tidur, eks: i.expression, gerakTidur: i._gerak.tidur, comp: i._companion?._gerak.tidur};")
    if k.get("tidur"): break
    time.sleep(0.25)
cek("sepi + kursor jauh -> Memo tidur (island & desktop)", k == {"tidur": True, "eks": "tidur", "gerakTidur": True, "comp": True}, k)
```

dengan:

```python
    k = ev("const i = memoUji.island(); return {tidur: i._tidur, eks: i.expression, gerakTidur: i._gerak.tidur};")
    if k.get("tidur"): break
    time.sleep(0.25)
cek("sepi + kursor jauh -> Memo tidur", k == {"tidur": True, "eks": "tidur", "gerakTidur": True}, k)
```

Lalu sisipkan blok ini tepat sebelum baris `log = open(f"{T}/shell.log", errors="ignore").read()`:

```python
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
```

Dan sesudah baris `cek("tidak ada JS ERROR / CRITICAL dynamic-island di log shell", not galat, galat[:5])` tambahkan:

```python
cek("tidak ada galat Memo hidup di log shell", "[dynamic-island] hidup:" not in log)
```

- [ ] **Step 3: Jalankan skenario, pastikan gagal**

Run: `UJI_SIMPAN=1 tests/gnome/uji-island.sh`
Expected: uji lama tetap `OK`; `GAGAL jalan-jalan dinyalakan -> Memo keluar dari island & mendarat` (ev mengembalikan `__galat` karena `island().hidup` belum ada), lalu uji Memo hidup lainnya GAGAL. Kode keluar 1.

- [ ] **Step 4: Buat badan Memo di GNOME Shell**

Buat `extension/hidup/memoHidup.js`:

```js
// Memo hidup di desktop: badan Mochi — island hitam bulat bermata LED — yang
// keluar dari island, melompat di atas jendela, mengintip, dan memilih
// kegiatannya sendiri (docs/superpowers/specs/2026-10-18-memo-hidup-design.md).
//
// Berkas ini hanya penyambung ke GNOME Shell: membaca jendela & kursor,
// menggerakkan aktor, menempatkannya di tumpukan jendela, dan menerima
// sentuhan. Otaknya murni dan diuji di luar GNOME: dunia.js (peta),
// fisika.js (badan), pikiran.js (kebutuhan, sifat, kegiatan).
//
// Semua berjalan di proses gnome-shell (yang juga compositor): tiap langkah
// dibungkus _aman(), dan tiga galat beruntun memulangkan Memo serta
// mematikan jalan-jalan untuk sesi ini.

import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { RobotFace } from '../robotFace.js';
import { Gerak } from '../gerak.js';
import { FPS_PIKSEL } from '../gerakPola.js';
import { bolehDi, petaDari } from './dunia.js';
import { angkat, badanBaru, langkah, langkahJalan, lempar, mulaiLompat, ngintip, rute, titikDi } from './fisika.js';
import { dariJson, keJson, pikir } from './pikiran.js';

export const UKURAN = { lebar: 120, tinggi: 72 };
const SKALA_WAJAH = 2.6;
const MS_LANGKAH = Math.round(1000 / FPS_PIKSEL);
const SIMPAN_TIAP_S = 300;
const KLIK_GANDA_MS = 400;
const AMBANG_SERET = 6;
const BERKAS = () => `${GLib.get_user_config_dir()}/memo/hidup.json`;

function bacaKonfig() {
    try {
        const [ok, isi] = GLib.file_get_contents(BERKAS());
        if (ok) {
            const d = JSON.parse(new TextDecoder().decode(isi));
            if (d && typeof d === 'object')
                return d;
        }
    } catch (e) { /* belum pernah disimpan */ }
    return {};
}

export class MemoHidup {
    constructor(island) {
        this._island = island;
        const cfg = bacaKonfig();
        this._aktif = cfg.aktif === true;
        this._pikiran = dariJson(cfg, Date.now());
        this._badan = badanBaru(0, 0);
        this._peta = null;
        this._antrean = [];
        this._gerakJendela = new Map();
        this._diLuar = false;
        this._sembunyi = false;
        this._rusak = false;
        this._galat = 0;
        this._detik = 0;
        this._pergiLalu = false;
        this._dielus = false;
        this._sampai = false;
        this._pulangTertunda = false;
        this._seret = null;
        this._grab = null;
        this._klikId = 0;
        this._langkahId = 0;
        this._simpanId = 0;
        this._sinyal = [];
        this._sinyalPijakan = null;

        this._face = new RobotFace();
        // Sentuhan ditangani badan; RobotFace sendiri menelan klik.
        this._face.actor.reactive = false;
        this._face.actor.x_align = Clutter.ActorAlign.CENTER;
        this._face.actor.y_align = Clutter.ActorAlign.CENTER;
        this._face.actor.set_pivot_point(0.5, 0.5);
        this._face.actor.set_scale(SKALA_WAJAH, SKALA_WAJAH);
        this._face.setBlinkingEnabled(true);
        this.actor = new St.Widget({
            style_class: 'memo-hidup', reactive: true, visible: false,
            width: UKURAN.lebar, height: UKURAN.tinggi,
            layout_manager: new Clutter.BinLayout(),
        });
        this.actor.add_child(this._face.actor);
        // Gerak menggerakkan seluruh badan, bertumpu di kaki (pivot bawah).
        this._gerak = new Gerak(this.actor, { skalaDasar: 1, amplitudo: 1, pivotY: 1, arahPartikel: -1, blokPartikel: 3 });
        Main.uiGroup.add_child(this.actor);

        this.actor.connect('button-press-event', (_a, ev) => this._aman(() => this._tekan(ev)) ?? Clutter.EVENT_STOP);
        this.actor.connect('motion-event', (_a, ev) => this._aman(() => this._seretKe(ev)) ?? Clutter.EVENT_STOP);
        this.actor.connect('button-release-event', () => this._aman(() => this._lepas()) ?? Clutter.EVENT_STOP);

        const segarkan = () => {
            this._aman(() => this._bangunPeta());
        };
        const sambung = (obj, nama) => this._sinyal.push([obj, obj.connect(nama, segarkan)]);
        sambung(global.display, 'restacked');
        sambung(global.display, 'notify::focus-window');
        sambung(global.display, 'grab-op-end');
        for (const nama of ['size-change', 'map', 'destroy', 'minimize', 'unminimize'])
            sambung(global.window_manager, nama);
        sambung(global.workspace_manager, 'active-workspace-changed');
        sambung(Main.overview, 'showing');
        sambung(Main.overview, 'hidden');

        this._detikId = GLib.timeout_add_seconds(GLib.PRIORITY_LOW, 1, () => {
            this._aman(() => this._tiapDetik());
            return GLib.SOURCE_CONTINUE;
        });
        this._tatapId = GLib.timeout_add(GLib.PRIORITY_LOW, 200, () => {
            this._aman(() => this._tatap());
            return GLib.SOURCE_CONTINUE;
        });
    }

    // --- Keselamatan ------------------------------------------------------

    // Galat tidak boleh merusak desktop: dicatat, dan sesudah tiga galat
    // beruntun Memo pulang dan jalan-jalan mati untuk sesi ini.
    _aman(fn) {
        if (this._rusak)
            return undefined;
        try {
            const hasil = fn();
            this._galat = 0;
            return hasil;
        } catch (e) {
            console.error(`[dynamic-island] hidup: ${e}\n${e.stack ?? ''}`);
            if (++this._galat >= 3) {
                this._rusak = true;
                this._berhentiLangkah();
                this.actor.hide();
                this._diLuar = false;
                this._island.memoKembali();
            }
            return undefined;
        }
    }

    // --- Persepsi & peta --------------------------------------------------

    _jendela() {
        const ws = global.workspace_manager.get_active_workspace();
        const daftar = ws.list_windows().filter(w => !w.minimized && !w.skip_taskbar &&
            w.get_window_type() === Meta.WindowType.NORMAL && w.is_on_primary_monitor());
        return global.display.sort_windows_by_stacking(daftar);
    }

    _persepsi() {
        const fokus = global.display.focus_window;
        const kerja = Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.primaryIndex);
        const [x, y] = global.get_pointer();
        return {
            areaKerja: { x: kerja.x, y: kerja.y, lebar: kerja.width, tinggi: kerja.height },
            jendela: this._jendela().map(w => {
                const r = w.get_frame_rect();
                return {
                    id: w.get_id(), x: r.x, y: r.y, lebar: r.width, tinggi: r.height, aktif: w === fokus,
                    maksimal: w.is_maximized(), layarPenuh: w.is_fullscreen(),
                    aplikasi: w.get_wm_class() ?? '', judul: w.get_title() ?? '',
                };
            }),
            kursor: { x, y },
            jam: GLib.DateTime.new_now_local().get_hour(),
        };
    }

    _bangunPeta() {
        this._peta = petaDari(this._persepsi(), UKURAN);
        this._perbaruiSembunyi();
        if (this._diLuar) {
            this._tempatkan();
            // Lantai bisa berubah/hilang: biarkan fisika memeriksanya.
            this._pastikanLangkah();
        }
    }

    _perbaruiSembunyi() {
        this._sembunyi = Main.overview.visible || Main.sessionMode.isLocked || !!this._peta?.sembunyi;
        this.actor.visible = this._diLuar && !this._sembunyi;
    }

    _aktorJendela(id) {
        return this._jendela().find(w => w.get_id() === id)?.get_compositor_private() ?? null;
    }

    // Di atas jendela pijakannya (jendela yang lebih atas bisa menutupinya),
    // di belakang jendela yang diintip, selebihnya di lapisan paling atas.
    _tempatkan() {
        const b = this._badan;
        let acuan = null, diBelakang = false;
        if (b.keadaan === 'berdiri' && b.pijakan !== null && b.pijakan !== undefined) {
            acuan = this._aktorJendela(b.pijakan);
        } else if (b.keadaan === 'ngintip' && b.tepi?.jenis === 'jendela') {
            acuan = this._aktorJendela(b.pijakan);
            diBelakang = true;
        }
        const induk = acuan?.get_parent() ?? Main.uiGroup;
        if (this.actor.get_parent() !== induk) {
            this.actor.get_parent()?.remove_child(this.actor);
            induk.add_child(this.actor);
        }
        if (!acuan)
            induk.set_child_above_sibling(this.actor, null);
        else if (diBelakang)
            induk.set_child_below_sibling(this.actor, acuan);
        else
            induk.set_child_above_sibling(this.actor, acuan);
    }

    // Jendela pijakan digeser pengguna -> catat geserannya untuk fisika.
    _ikatPijakan() {
        const id = this._badan.pijakan ?? null;
        if (this._sinyalPijakan?.id === id)
            return;
        if (this._sinyalPijakan) {
            this._sinyalPijakan.w.disconnect(this._sinyalPijakan.sid);
            this._sinyalPijakan = null;
        }
        const w = id === null ? null : this._jendela().find(x => x.get_id() === id);
        if (!w)
            return;
        let r = w.get_frame_rect();
        const sid = w.connect('position-changed', () => this._aman(() => {
            const baru = w.get_frame_rect();
            const g = this._gerakJendela.get(id) ?? { dx: 0, dy: 0 };
            this._gerakJendela.set(id, { dx: g.dx + baru.x - r.x, dy: g.dy + baru.y - r.y });
            r = baru;
            this._bangunPeta();
        }));
        this._sinyalPijakan = { id, w, sid };
    }

    _gambar() {
        const b = this._badan;
        this.actor.set_position(Math.round(b.x - UKURAN.lebar / 2), Math.round(b.y - UKURAN.tinggi));
    }

    // --- Langkah fisika 12x/dtk, hanya selama ada yang bergerak ------------

    _pastikanLangkah() {
        if (this._langkahId || !this._diLuar)
            return;
        this._langkahId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, MS_LANGKAH, () => {
            if (this._aman(() => this._langkah()))
                return GLib.SOURCE_CONTINUE;
            this._langkahId = 0;
            return GLib.SOURCE_REMOVE;
        });
    }

    _berhentiLangkah() {
        if (this._langkahId) {
            GLib.source_remove(this._langkahId);
            this._langkahId = 0;
        }
    }

    // Satu langkah. Mengembalikan true selama masih ada yang bergerak.
    _langkah() {
        if (!this._peta)
            this._bangunPeta();
        const a = this._antrean[0];
        if (a?.jenis === 'selinap' || a?.jenis === 'pulang')
            return this._langkahKhusus(a);
        const gerakJendela = this._gerakJendela;
        this._gerakJendela = new Map();
        const pijakanLama = this._badan.pijakan;
        const { badan, kejadian } = langkah(this._badan, this._peta, { ukuran: UKURAN, gerakJendela });
        this._badan = badan;
        for (const e of kejadian) {
            if (e === 'mendarat') {
                this._gerak.main('tepuk');
            } else if (e === 'mendaratKeras') {
                this._gerak.main('pusing');
                this._gerak.partikel('bintang', 3);
            } else if (e === 'jatuh') {
                this._gerak.main('kaget');
            }
        }
        if (this._badan.keadaan === 'berdiri' && a)
            this._jalankanAntrean(a);
        if (this._badan.pijakan !== pijakanLama || kejadian.length) {
            this._tempatkan();
            this._ikatPijakan();
        }
        this._gambar();
        const diam = (this._badan.keadaan === 'berdiri' || this._badan.keadaan === 'ngintip') && !this._antrean.length;
        if (diam && a)
            this._sampai = true;
        return !diam;
    }

    _jalankanAntrean(a) {
        const b = this._badan;
        if (a.jenis === 'jalan') {
            if (b.x === a.ke.x)
                this._antrean.shift();
            else
                this._badan = mulaiLompat(b, langkahJalan(b, a.ke.x)) ?? b;
        } else if (a.jenis === 'lompat') {
            this._antrean.shift();
            const lompat = mulaiLompat(b, a.ke);
            if (lompat)
                this._badan = lompat;
            else
                this._antrean.unshift({ jenis: 'selinap', ke: a.ke, fase: 0 });
        }
    }

    // Menyelinap: tenggelam di tempat, muncul di tujuan (tanpa rute; juga cara
    // masuk ke tepi ngintip). Pulang: busur ke island lalu masuk.
    _langkahKhusus(a) {
        a.fase++;
        if (a.jenis === 'selinap') {
            this.actor.scale_y = [0.66, 0.33, 0, 0, 0.33, 0.66, 1][a.fase - 1] ?? 1;
            if (a.fase === 4) {
                this._badan = a.tepi ? ngintip(this._badan, a.tepi)
                    : { ...badanBaru(a.ke.x, a.ke.y), keadaan: 'berdiri', pijakan: a.ke.jendelaId ?? null };
                this._tempatkan();
                this._ikatPijakan();
            }
            if (a.fase >= 7) {
                this.actor.scale_y = 1;
                this._antrean.shift();
                if (!this._antrean.length)
                    this._sampai = true;
            }
        } else {
            const s = Math.min(1, a.fase / 8);
            this._badan = {
                ...this._badan,
                x: Math.round(a.dari.x + (a.ke.x - a.dari.x) * s),
                y: Math.round(a.dari.y + (a.ke.y - a.dari.y) * s - 320 * s * (1 - s)),
            };
            if (s >= 1) {
                this._antrean = [];
                this._masukIsland();
                return false;
            }
        }
        this._gambar();
        return this._antrean.length > 0 || this._badan.keadaan !== 'berdiri';
    }

    _pergiKe(tujuan) {
        if (tujuan === undefined)
            return;
        this._antrean = [];
        if (tujuan === null)
            return;
        if (tujuan.jenis === 'tepi') {
            this._antrean = [{ jenis: 'selinap', ke: tujuan, tepi: tujuan.tepi, fase: 0 }];
        } else {
            const r = this._badan.keadaan === 'berdiri' ? rute(this._badan, tujuan, this._peta, UKURAN.lebar) : null;
            this._antrean = r ?? [{ jenis: 'selinap', ke: tujuan, fase: 0 }];
        }
        if (!this._antrean.length)
            this._sampai = true;
        this._pastikanLangkah();
    }

    // --- Pikiran 1x/dtk ---------------------------------------------------

    _tiapDetik() {
        this._detik++;
        if (!this._aktif)
            return;
        if (!this._diLuar) {
            if (this._island.bolehKeluar())
                this._keluar();
            return;
        }
        const persepsi = this._persepsi();
        this._peta = petaDari(persepsi, UKURAN);
        this._perbaruiSembunyi();
        // Activities / layar terkunci: berhenti berpikir sampai kembali.
        if (this._sembunyi && !this._peta.sembunyi)
            return;
        this._pikir(persepsi, 1000);
        if (this._gerak.tidur && this._detik % 3 === 0)
            this._gerak.partikel('z', 1);
        if (this._detik % SIMPAN_TIAP_S === 0)
            this.simpan();
    }

    _pikir(persepsi, dtMs) {
        // "Kamu pergi" memakai aturan tidur island yang sama (bolehTidur).
        const pergi = this._island.sedangTidur;
        const b = this._badan;
        const r = pikir(this._pikiran, {
            persepsi, peta: this._peta, ukuran: UKURAN, posisi: { x: b.x, y: b.y },
            tepi: b.keadaan === 'ngintip' ? b.tepi : null, dtMs, acak: Math.random,
            pergi, kembali: this._pergiLalu && !pergi, dielus: this._dielus, sampai: this._sampai,
        });
        this._pergiLalu = pergi;
        this._dielus = false;
        this._sampai = false;
        this._pikiran = r.keadaan;
        if (r.niat)
            this._jalankanNiat(r.niat);
    }

    _jalankanNiat(n) {
        if (n.kegiatan === 'sembunyi') {
            this._antrean = [];
            return;
        }
        if (n.ekspresi)
            this._face.setExpression(n.ekspresi);
        if (n.kegiatan === 'tidur')
            this._gerak.tidurkan();
        else if (this._gerak.tidur)
            this._gerak.bangunkan();
        if (n.emote)
            this._gerak.main(n.emote);
        if (n.ikon)
            this._gerak.partikel(n.ikon, 1);
        this._pergiKe(n.tujuan);
    }

    _tatap() {
        if (!this.actor.visible)
            return;
        const [px, py] = global.get_pointer();
        const b = this._badan;
        this._face.setGaze((px - b.x) / 500, (py - (b.y - UKURAN.tinggi / 2)) / 350);
    }

    // --- Keluar & pulang --------------------------------------------------

    _keluar() {
        const [px, py] = this._island.posisiIsland();
        this._diLuar = true;
        this._island.memoKeluar();
        this._bangunPeta();
        // Terlempar keluar dari island, lalu jatuh ke lantai di bawahnya.
        this._badan = lempar(badanBaru(px, py + UKURAN.tinggi), Math.round((Math.random() - 0.5) * 30), -6);
        this._antrean = [];
        this._face.setExpression('senang');
        this._tempatkan();
        this._gambar();
        this._perbaruiSembunyi();
        this._pastikanLangkah();
    }

    // Pulang ke island (izin, kabar, panel dibuka, tombol Pulang). Selagi
    // diseret, ditunda sampai dilepas.
    pulang() {
        if (!this._diLuar || this._antrean[0]?.jenis === 'pulang')
            return;
        if (this._badan.keadaan === 'diangkat') {
            this._pulangTertunda = true;
            return;
        }
        if (!this.actor.visible) {
            this._berhentiLangkah();
            this._masukIsland();
            return;
        }
        const [px, py] = this._island.posisiIsland();
        this._antrean = [{ jenis: 'pulang', dari: { x: this._badan.x, y: this._badan.y }, ke: { x: px, y: py }, fase: 0 }];
        this._badan = { ...this._badan, keadaan: 'diangkat', pijakan: undefined, tepi: null };
        this.actor.scale_y = 1;
        this._tempatkan();
        this._pastikanLangkah();
    }

    _masukIsland() {
        this._diLuar = false;
        this.actor.hide();
        if (this._gerak.tidur)
            this._gerak.bangunkan();
        this._island.memoKembali();
        this.simpan();
    }

    // --- Sentuhan ---------------------------------------------------------

    _tekan(ev) {
        if (ev.get_button() !== 1)
            return Clutter.EVENT_PROPAGATE;
        const [x, y] = ev.get_coords();
        this._seret = { x0: x, y0: y, dx: x - this._badan.x, dy: y - this._badan.y,
            jejak: [[GLib.get_monotonic_time(), x, y]], aktif: false };
        this._grab = global.stage.grab(this.actor);
        return Clutter.EVENT_STOP;
    }

    _seretKe(ev) {
        const s = this._seret;
        if (!s)
            return Clutter.EVENT_PROPAGATE;
        const [x, y] = ev.get_coords();
        const kini = GLib.get_monotonic_time();
        s.jejak = [...s.jejak.filter(([t]) => kini - t < 100000), [kini, x, y]];
        if (!s.aktif && Math.hypot(x - s.x0, y - s.y0) > AMBANG_SERET) {
            s.aktif = true;
            this._antrean = [];
            this.actor.scale_y = 1;
            this._gerak.main('kaget');
        }
        if (s.aktif) {
            this._badan = angkat(this._badan, x - s.dx, y - s.dy);
            this._tempatkan();
            this._gambar();
        }
        return Clutter.EVENT_STOP;
    }

    _lepas() {
        const s = this._seret;
        this._seret = null;
        this._grab?.dismiss();
        this._grab = null;
        if (!s)
            return Clutter.EVENT_PROPAGATE;
        if (s.aktif) {
            // Kecepatan dari gerak kursor ±100 ms terakhir, dalam piksel per langkah.
            const [t0, x0, y0] = s.jejak[0];
            const [t1, x1, y1] = s.jejak.at(-1);
            const langkahLewat = Math.max(1, (t1 - t0) / 1000 / MS_LANGKAH);
            const jepit = v => Math.max(-60, Math.min(60, Math.round(v)));
            this._badan = lempar(this._badan, jepit((x1 - x0) / langkahLewat), jepit((y1 - y0) / langkahLewat));
            this._pastikanLangkah();
            if (this._pulangTertunda) {
                this._pulangTertunda = false;
                this.pulang();
            }
            return Clutter.EVENT_STOP;
        }
        // Klik: tunggu sebentar untuk membedakannya dari klik dua kali.
        if (this._klikId) {
            GLib.source_remove(this._klikId);
            this._klikId = 0;
            this._island.bukaMenu();
        } else {
            this._klikId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, KLIK_GANDA_MS, () => {
                this._klikId = 0;
                this._aman(() => this._elus());
                return GLib.SOURCE_REMOVE;
            });
        }
        return Clutter.EVENT_STOP;
    }

    _elus() {
        this._dielus = true;
        this._pikir(this._persepsi(), 0);
    }

    // --- Untuk island & panel ---------------------------------------------

    get aktif() {
        return this._aktif;
    }

    get diLuar() {
        return this._diLuar;
    }

    get sifat() {
        return { ...this._pikiran.sifat };
    }

    setAktif(aktif) {
        this._aktif = !!aktif;
        if (!this._aktif)
            this.pulang();
        this.simpan();
    }

    setSifat(nama, nilai) {
        if (!(nama in this._pikiran.sifat))
            return;
        this._pikiran = { ...this._pikiran, sifat: { ...this._pikiran.sifat, [nama]: Math.max(0, Math.min(1, nilai)) } };
        // Slider mengirim banyak nilai saat digeser: simpan sekali sesudahnya.
        if (this._simpanId)
            GLib.source_remove(this._simpanId);
        this._simpanId = GLib.timeout_add(GLib.PRIORITY_LOW, 1000, () => {
            this._simpanId = 0;
            this.simpan();
            return GLib.SOURCE_REMOVE;
        });
    }

    // Datang ke dekat kursor (tetap di luar lingkar kursor).
    panggilKeSini() {
        if (!this._aktif)
            this.setAktif(true);
        if (!this._diLuar)
            this._keluar();
        if (!this._peta)
            this._bangunPeta();
        const [kx, ky] = global.get_pointer();
        let terbaik = null;
        for (const L of this._peta.lantai) {
            for (const dx of [-220, 220, -320, 320]) {
                const p = titikDi(L, kx + dx, UKURAN.lebar);
                const jarak = Math.hypot(p.x - kx, p.y - ky);
                if (bolehDi(this._peta, p, UKURAN) && (!terbaik || jarak < terbaik.jarak))
                    terbaik = { ...p, jarak };
            }
        }
        if (!terbaik)
            return;
        this._pikiran = { ...this._pikiran, kegiatan: 'temani', sisaMs: 30000 };
        this._face.setExpression('senang');
        this._pergiKe({ jenis: 'titik', x: terbaik.x, y: terbaik.y, jendelaId: terbaik.jendelaId });
    }

    // Emote dari island (agen selesai, pembayaran, dll.) ikut dimainkan.
    gerak(nama, opsi = {}) {
        if (!this.actor.visible)
            return;
        if (nama)
            this._gerak.main(nama, opsi);
        if (opsi.partikel)
            this._gerak.partikel(opsi.partikel, opsi.jumlah ?? 1);
    }

    setTint(hue, glowBoost) {
        this._face.setTint(hue, glowBoost);
    }

    simpan() {
        try {
            GLib.mkdir_with_parents(`${GLib.get_user_config_dir()}/memo`, 0o700);
            GLib.file_set_contents(BERKAS(), JSON.stringify({ aktif: this._aktif, ...keJson(this._pikiran, Date.now()) }));
        } catch (e) {
            console.error(`[dynamic-island] simpan hidup: ${e}`);
        }
    }

    destroy() {
        this.simpan();
        for (const id of [this._detikId, this._tatapId, this._klikId, this._simpanId]) {
            if (id)
                GLib.source_remove(id);
        }
        this._berhentiLangkah();
        for (const [obj, id] of this._sinyal)
            obj.disconnect(id);
        this._sinyal = [];
        if (this._sinyalPijakan)
            this._sinyalPijakan.w.disconnect(this._sinyalPijakan.sid);
        this._sinyalPijakan = null;
        this._grab?.dismiss();
        this._gerak.destroy();
        this._face.destroy();
        this.actor.destroy();
    }
}
```

- [ ] **Step 5: Gaya badan**

Di `extension/stylesheet.css`, ganti:

```css
.memo-companion {
    padding: 14px 18px;
}
```

dengan:

```css
/* Memo hidup di desktop: badan Mochi = island hitam bulat (extension/hidup/). */
.memo-hidup {
    background-color: #000000;
    border-radius: 30px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 6px 14px rgba(0, 0, 0, 0.35);
}
```

- [ ] **Step 6: Sambungkan ke island (`extension/extension.js`)**

Lakukan penggantian berikut, masing-masing tepat satu kali:

1. Ganti:

```js
import { MemoCompanion } from './companion.js';
```

   dengan:

```js
import { MemoHidup } from './hidup/memoHidup.js';
```

2. Ganti:

```js
const RECHECK_MS = 250;
```

   dengan:

```js
const RECHECK_MS = 250;
// Memo hidup baru keluar lagi sesudah sekian lama tanpa izin/kabar baru.
const SEPI_SEBELUM_KELUAR_MS = 20000;
```

3. Ganti:

```js
        this._companion = null;
        this._tintHue = 120;
```

   dengan:

```js
        this._hidup = null;
        this._kabarTerakhir = 0;
        this._tintHue = 120;
```

4. Ganti:

```js
            if (open) {
                // Seperti Coucou:
```

   dengan:

```js
            if (open) {
                // Panel dibuka dari mana pun -> Memo pulang dulu ke island.
                this._hidup?.pulang();
                // Seperti Coucou:
```

5. Ganti:

```js
        // Pulihkan Memo desktop bila sebelum restart dalam keadaan terbuka.
        try {
            const [cok, cc] = GLib.file_get_contents(GLib.get_user_config_dir() + '/memo/companion.json');
            if (cok && JSON.parse(new TextDecoder().decode(cc)).terbuka) {
                this._companion = new MemoCompanion(this);
                this._companion.sync('netral');
                this._companion.setTint(this._tintHue ?? 120, this._tintGlow ?? 0);
            }
        } catch (e) { /* mulai tanpa companion */ }
```

   dengan:

```js
        // Memo hidup di desktop (extension/hidup/): keluar dari island untuk
        // jalan-jalan bila dinyalakan di Pengaturan.
        try {
            this._hidup = new MemoHidup(this);
            this._hidup.setTint(this._tintHue ?? 120, this._tintGlow ?? 0);
        } catch (e) {
            console.error(`[dynamic-island] memo hidup: ${e}`);
        }
```

6. Ganti:

```js
        if (izinBaru) {
            this.gerak('kaget', { partikel: 'tanya' });
```

   dengan:

```js
        if (izinBaru) {
            this._kabarTerakhir = Date.now();
            this._hidup?.pulang();
            this.gerak('kaget', { partikel: 'tanya' });
```

7. Ganti:

```js
    get companionTampil() {
        return !!this._companion?.visible;
    }

    togelCompanion() {
        try {
            if (this._companion?.visible) {
                this._companion.sembunyikan();
            } else {
                if (!this._companion)
                    this._companion = new MemoCompanion(this);
                this._companion.tampilkan();
                this._companion.sync(this.expression);
                this._companion.setTint(this._tintHue ?? 120, this._tintGlow ?? 0);
            }
        } catch (e) {
            console.error(`[dynamic-island] companion: ${e}`);
        }
    }
```

   dengan:

```js
    get hidup() {
        return this._hidup;
    }

    // --- Untuk Memo hidup (extension/hidup/memoHidup.js) ---------------------
    // Boleh keluar: tidak ada izin/kabar yang tampil, panel tertutup, dan
    // sepi sejak kabar terakhir.
    bolehKeluar() {
        return !this._izinTampil && !this._eventActive && !this.menu.isOpen &&
            Date.now() - this._kabarTerakhir >= SEPI_SEBELUM_KELUAR_MS;
    }

    // Titik tengah bawah pill: tempat Memo keluar dan pulang.
    posisiIsland() {
        const [x, y] = this._pill.get_transformed_position();
        return [Math.round(x + this._pill.width / 2), Math.round(y + this._pill.height)];
    }

    // Selagi Memo di desktop, mata di island redup (Memo sedang keluar).
    memoKeluar() {
        this._face.actor.opacity = 70;
    }

    memoKembali() {
        this._face.actor.opacity = 255;
        this.gerak('sapa', { diam: true });
    }

    get sedangTidur() {
        return this._tidur;
    }

    // Notifikasi (termasuk kabar LebihTeratur) memanggil Memo pulang.
    kabarDatang() {
        this._kabarTerakhir = Date.now();
        this._hidup?.pulang();
    }
```

8. Ganti:

```js
            this._gerak.bangunkan();
            this._companion?.bangunkan();
```

   dengan:

```js
            this._gerak.bangunkan();
```

9. Ganti:

```js
        this._companion?.sync(name);
        this._panel?.sync(name);
```

   dengan:

```js
        this._panel?.sync(name);
```

10. Ganti:

```js
        this._companion?.gerak(nama, opsi);
```

   dengan:

```js
        this._hidup?.gerak(nama, opsi);
```

11. Ganti:

```js
        this._gerak.tidurkan();
        this._companion?.tidurkan();
```

   dengan:

```js
        this._gerak.tidurkan();
```

12. Ganti:

```js
        if (this._companion?.visible)
            titik.push(this._companion.actor);
```

   dengan:

```js
        if (this._hidup?.actor.visible)
            titik.push(this._hidup.actor);
```

13. Ganti:

```js
        this._companion?.setTint(h, glowBoost);
```

   dengan:

```js
        this._hidup?.setTint(h, glowBoost);
```

14. Ganti:

```js
        this._companion?.destroy();
        this._companion = null;
```

   dengan:

```js
        this._hidup?.destroy();
        this._hidup = null;
```

15. Ganti:

```js
            this._island.reaksiNotifikasi(source.title, title);
```

   dengan:

```js
            this._island.reaksiNotifikasi(source.title, title);
            this._island.kabarDatang();
```


- [ ] **Step 7: Buang companion**

Run:
```bash
git rm extension/companion.js
grep -rn -i "companion" extension tests --include=*.js --include=*.py --include=*.css
```
Expected: `grep` tidak mengeluarkan apa pun (kode keluar 1). Rujukan di `docs/coucou-ala-memo.md` sengaja dibiarkan: itu deskripsi fitur Coucou.

- [ ] **Step 8: Jalankan semua tes**

Run: `tests/semua.sh && UJI_SIMPAN=1 tests/gnome/uji-island.sh`
Expected: `tests/semua.sh` semua `ok`; skenario GNOME berakhir `N lolos, 0 gagal` dengan, antara lain:
```
OK    jalan-jalan dinyalakan -> Memo keluar dari island & mendarat
OK    island meredup saat Memo keluar
OK    Memo hidup ikut melompat bersama island
OK    kabar datang -> Memo pulang ke island
OK    Memo pindah ke atas jendela uji
OK    Memo diselipkan tepat di atas jendela pijakannya
OK    jendela digeser pelan -> Memo ikut terbawa
OK    jendela aktif dimaksimalkan -> Memo ngintip dari tepi layar
OK    izin agen -> Memo pulang ke island
OK    kursor mendekat -> Memo menyingkir
OK    tidak ada galat Memo hidup di log shell
```

- [ ] **Step 9: Periksa tangkapan layar**

Buka `5-desktop.png`, `30-hidup-jendela.png`, `31-hidup-ngintip.png` di folder uji yang dicetak skrip. Expected: badan hitam bulat bermata LED berdiri tepat di tepi atas jendela uji (30); separuh badan menyembul di tepi layar di atas jendela yang dimaksimalkan (31). Mata tidak abu-abu belang; tepi badan tidak terpotong. Bila rupa island saat Memo keluar (opacity 70) tidak terbaca sebagai "Memo sedang keluar", catat untuk pertanyaan terbuka di spec — jangan ubah perilaku di tugas ini.

- [ ] **Step 10: Commit**

```bash
git add extension/hidup/memoHidup.js extension/extension.js extension/stylesheet.css tests/gnome/jendela-uji.js tests/gnome/skenario.py
git commit -m "feat(hidup): Memo keluar dari island dan hidup di desktop

Badan Mochi melompat di atas jendela, diselipkan di tumpukan jendela,
ngintip dari tepi saat jendela aktif dimaksimalkan, menyingkir dari kursor,
dan pulang saat ada izin agen, kabar, atau panel dibuka. Menggantikan
companion.js.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tugas 7: Pengaturan di panel — sakelar, panggil, sifat

**Files:**
- Modify: `extension/panel.js` (impor Slider, konstanta `SIFAT_MEMO`, tab Pengaturan, `segarkanAtur`)
- Modify: `extension/stylesheet.css` (gaya slider sifat)
- Modify: `tests/gnome/skenario.py` (pakai tombol & slider)

**Interfaces:**
- Consumes: `island.hidup` (Tugas 6): `aktif`, `sifat`, `setAktif`, `setSifat`, `panggilKeSini`, `pulang`.
- Produces: `PanelMemo._tombolHidup` (St.Button), `PanelMemo._sliderSifat` (Slider[], tiap slider punya `_memoSifat`).

- [ ] **Step 1: Skenario memakai tombol & slider (tes gagal)**

Di `tests/gnome/skenario.py`, ganti:

```python
ev(H + "h.setAktif(true); memoUji.island().menu.close(); memoUji.island()._kabarTerakhir = 0; return true;")
```

dengan:

```python
ev("const p = memoUji.island()._panel; p.pilihTab('atur'); p._tombolHidup.emit('clicked', 1); "
   "p._sliderSifat[0].value = 0.9; memoUji.island().menu.close(); memoUji.island()._kabarTerakhir = 0; return true;")
cek("tombol Pengaturan menyalakan jalan-jalan", ev(H + "return h.aktif;") is True)
cek("slider sifat mengubah sifat Memo", abs(ev(H + "return h.sifat.penasaran;") - 0.9) < 0.001)
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `UJI_SIMPAN=1 tests/gnome/uji-island.sh`
Expected: `GAGAL tombol Pengaturan menyalakan jalan-jalan` (`_tombolHidup` belum ada), kode keluar 1.

- [ ] **Step 3: Panel**

Di `extension/panel.js`, lakukan penggantian berikut, masing-masing tepat satu kali:

1. Ganti:

```js
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
```

   dengan:

```js
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Slider } from 'resource:///org/gnome/shell/ui/slider.js';
```

2. Ganti:

```js
const KONFIG = () => `${GLib.get_user_config_dir()}/memo`;
```

   dengan:

```js
const KONFIG = () => `${GLib.get_user_config_dir()}/memo`;
// Slider sifat Memo hidup: [nama, ujung kiri (0), ujung kanan (1)].
const SIFAT_MEMO = [['penasaran', 'cuek', 'penasaran'], ['aktif', 'malas', 'aktif'],
    ['iseng', 'kalem', 'iseng'], ['manja', 'pemalu', 'manja']];
```

3. Ganti:

```js
        const barisMemo = new St.BoxLayout({ style_class: 'memo-segmen' });
        this._tombolDesktop = tombol('Lepas ke desktop', 'memo-btn-gelap', () => {
            this._island.togelCompanion();
            this.segarkanAtur();
        });
        barisMemo.add_child(this._tombolDesktop);
```

   dengan:

```js
        // Memo hidup di desktop: sakelar, panggil, pulang, dan sifat.
        const barisHidup = new St.BoxLayout({ style_class: 'memo-segmen' });
        this._tombolHidup = tombol('Jalan-jalan: mati', 'memo-btn-gelap', () => {
            const h = this._island.hidup;
            h?.setAktif(!h.aktif);
            this.segarkanAtur();
        });
        barisHidup.add_child(this._tombolHidup);
        barisHidup.add_child(tombol('Panggil ke sini', 'memo-btn-gelap', () => {
            this._island.menu.close();
            this._island.hidup?.panggilKeSini();
        }));
        barisHidup.add_child(tombol('Pulang', 'memo-btn-gelap', () => this._island.hidup?.pulang()));
        bagian('Jalan-jalan', barisHidup);
        const kolomSifat = new St.BoxLayout({ vertical: true, x_expand: true, style_class: 'memo-sifat' });
        this._sliderSifat = SIFAT_MEMO.map(([nama, kiri, kanan]) => {
            const baris = new St.BoxLayout({ style_class: 'memo-sifat-baris' });
            const slider = new Slider(0.5);
            slider.add_style_class_name('memo-slider');
            slider._memoSifat = nama;
            slider.connect('notify::value', () => this._island.hidup?.setSifat(nama, slider.value));
            baris.add_child(label(kiri, 'memo-sifat-ujung'));
            baris.add_child(slider);
            baris.add_child(label(kanan, 'memo-sifat-ujung'));
            kolomSifat.add_child(baris);
            return slider;
        });
        bagian('Sifat Memo', kolomSifat);
        const barisMemo = new St.BoxLayout({ style_class: 'memo-segmen' });
```

4. Ganti:

```js
        this._tombolDesktop.get_child().get_children().at(-1).text =
            this._island.companionTampil ? 'Kembalikan ke island' : 'Lepas ke desktop';
```

   dengan:

```js
        const h = this._island.hidup;
        this._tombolHidup.get_child().get_children().at(-1).text = h?.aktif ? 'Jalan-jalan: nyala' : 'Jalan-jalan: mati';
        const sifat = h?.sifat ?? {};
        for (const s of this._sliderSifat) {
            if (typeof sifat[s._memoSifat] === 'number')
                s.value = sifat[s._memoSifat];
        }
```


- [ ] **Step 4: Gaya slider**

Tambahkan di akhir `extension/stylesheet.css`:

```css

/* Slider sifat Memo hidup di tab Pengaturan. */
.memo-sifat {
    spacing: 6px;
}

.memo-sifat-baris {
    spacing: 10px;
}

.memo-sifat-ujung {
    color: rgba(255, 255, 255, 0.6);
    font-size: 12px;
    min-width: 64px;
}

.memo-slider {
    min-width: 220px;
}
```

- [ ] **Step 5: Jalankan semua tes**

Run: `tests/semua.sh && UJI_SIMPAN=1 tests/gnome/uji-island.sh`
Expected: semua hijau, termasuk `OK    tombol Pengaturan menyalakan jalan-jalan` dan `OK    slider sifat mengubah sifat Memo`.

- [ ] **Step 6: Commit**

```bash
git add extension/panel.js extension/stylesheet.css tests/gnome/skenario.py
git commit -m "feat(hidup): pengaturan Memo hidup — jalan-jalan, panggil, pulang, slider sifat

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tugas 8: Dokumentasi & verifikasi akhir

**Files:**
- Create: `docs/memo-hidup.md`
- Modify: `README.md`, `docs/superpowers/specs/2026-10-18-memo-hidup-design.md` (baris status)

**Interfaces:**
- Consumes: semua tugas sebelumnya.
- Produces: —

- [ ] **Step 1: Dokumen pemakaian**

Buat `docs/memo-hidup.md`:

```markdown
# Memo hidup di desktop

Memo keluar dari Dynamic Island dan hidup di desktop seperti NPC: melompat
di atas jendela, mengintip dari balik jendela dan pinggir layar, menonton
saat YouTube terbuka, menemani saat kamu ngoding, tidur kalau kamu pergi.
Desain: [spec](superpowers/specs/2026-10-18-memo-hidup-design.md).

## Menyalakan

Panel Memo (Super+M) → **Pengaturan** → **Jalan-jalan: mati** (klik untuk
menyalakan). Memo keluar dari island sesudah ±20 detik tanpa izin/kabar baru.

| Tombol / sentuhan | Yang terjadi |
|---|---|
| Klik Memo | dielus: mata senang, hati piksel |
| Seret Memo | diangkat; lepas sambil bergerak cepat = dilempar, memantul |
| Klik dua kali | panel Memo terbuka (Memo pulang dulu) |
| Panggil ke sini | Memo datang ke dekat kursor |
| Pulang | Memo kembali ke island |
| Slider sifat | cuek↔penasaran, malas↔aktif, kalem↔iseng, pemalu↔manja |

Memo pulang sendiri saat ada izin agen, notifikasi (termasuk kabar
LebihTeratur), atau panel dibuka, lalu keluar lagi saat sepi. Ia tidak masuk
ke isi jendela yang sedang kamu pakai, menjauh dari kursor, menempel di tepi
layar saat jendela aktif dimaksimalkan, dan menghilang saat ada aplikasi
layar penuh, Activities, atau layar terkunci.

## Berkas & privasi

- `~/.config/memo/hidup.json`: sakelar, sifat, kebutuhan terakhir (supaya
  Memo berlanjut sesudah login ulang). `companion.json` lama tidak dipakai lagi.
- Judul jendela hanya dipakai di dalam extension untuk menebak jenis jendela;
  tidak disimpan dan tidak dikirim ke mana pun. Tidak ada AI di bagian ini.

## Bagian

| Berkas | Isi |
|---|---|
| `extension/hidup/kenalAplikasi.js` | jendela → kategori |
| `extension/hidup/dunia.js` | lantai, tepi ngintip, zona larangan |
| `extension/hidup/fisika.js` | lompat, jatuh, lempar, rute antar lantai |
| `extension/hidup/pikiran.js` | kebutuhan, sifat, pemilihan kegiatan |
| `extension/hidup/memoHidup.js` | badan di GNOME Shell |

## Uji & bila bermasalah

- `tests/semua.sh` menjalankan tes murni (dunia, fisika, pikiran — termasuk
  simulasi berjam-jam); `tests/gnome/uji-island.sh` menguji Memo hidup di
  GNOME Shell headless dengan jendela uji.
- Perubahan extension baru termuat sesudah logout/login.
- Tiga galat beruntun → Memo pulang dan jalan-jalan mati sampai login
  berikutnya. Cek: `journalctl --user -b | grep "dynamic-island] hidup"`.
```

- [ ] **Step 2: README**

Di `README.md`, ganti:

```markdown
| Sambutan | `sambutan/` — animasi piksel layar penuh saat login, Log Out, Restart, Power Off, Suspend | [sambutan.md](docs/sambutan.md) |
```

dengan:

```markdown
| Sambutan | `sambutan/` — animasi piksel layar penuh saat login, Log Out, Restart, Power Off, Suspend | [sambutan.md](docs/sambutan.md) |
| Memo hidup | `extension/hidup/` — Memo keluar dari island, hidup di desktop ala NPC (lompat, ngintip, sifat) | [memo-hidup.md](docs/memo-hidup.md) |
```

- [ ] **Step 3: Status spec**

Di `docs/superpowers/specs/2026-10-18-memo-hidup-design.md`, ganti:

```
Tanggal: 2026-10-18 · Status: desain disetujui per bagian, belum ada kode.
```

dengan:

```
Tanggal: 2026-10-18 · Status: bagian A + B diimplementasikan — pemakaian di
[docs/memo-hidup.md](../../memo-hidup.md).
```

- [ ] **Step 4: Verifikasi akhir**

Run: `tests/semua.sh && UJI_SIMPAN=1 tests/gnome/uji-island.sh`
Expected: semua hijau. Hapus folder uji yang dicetak skrip sesudah tangkapan layarnya diperiksa.

- [ ] **Step 5: Commit**

```bash
git add docs/memo-hidup.md README.md docs/superpowers/specs/2026-10-18-memo-hidup-design.md
git commit -m "docs(hidup): cara memakai Memo hidup di desktop

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Serahkan ke pengguna**

Sampaikan: perubahan extension aktif setelah logout/login; lalu buka panel Memo (Super+M) → Pengaturan → **Jalan-jalan: mati** untuk menyalakan. Jangan mengklaim sudah dicoba di sesi asli — yang terverifikasi hanya tes gjs dan GNOME Shell headless.
