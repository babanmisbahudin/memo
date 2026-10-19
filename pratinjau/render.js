// Pratinjau desain Memo di luar GNOME: merender bingkai PNG memakai modul
// yang sama dengan extension (face.js, hidup/atraksi.js, fisika.js,
// dunia.js, hayat.js). Dipanggil pratinjau/buat.sh; hasil di pratinjau/hasil/.
//
//   gjs -m pratinjau/render.js <folder-keluaran>
//
// Badan Memo = pil 120x72 berwarna avatar (di GNOME: CSS .memo-hidup), wajah
// face.js x2,6, properti atraksi per kotak 3 px. Kotoran, telur, noda, dan
// makanan disalin dari memoHidup.js (bagian St tidak bisa jalan di sini).

import Cairo from 'cairo';
import GLib from 'gi://GLib';

import { P, bingkai, lamaAtraksi, rencanaPerawatan, rencanakan } from '../extension/hidup/atraksi.js';
import { petaDari } from '../extension/hidup/dunia.js';
import { badanBaru, lempar, langkah } from '../extension/hidup/fisika.js';
import { WARNA_BADAN, BENTUK_MATA } from '../extension/hidup/hayat.js';
import { KATALOG, RUPA_BAWAAN, acakRupa } from '../extension/hidup/studio.js';
import { gambarKotoran, gambarMakanan, gambarMemo, gambarPiksel, gambarTelur } from '../extension/hidup/gambarMemo.js';

const KELUAR = ARGV[0];
const UKURAN = { lebar: 120, tinggi: 72 };
const LATAR = [0.17, 0.17, 0.18];

const hexRgb = h => h.match(/\w\w/g).map(x => parseInt(x, 16) / 255);

function kanvas(l, t) {
    const s = new Cairo.ImageSurface(Cairo.Format.RGB24, l, t);
    const cr = new Cairo.Context(s);
    cr.setSourceRGB(...LATAR);
    cr.paint();
    return { s, cr };
}

function simpan({ s, cr }, nama) {
    cr.$dispose();
    s.writeToPNG(`${KELUAR}/${nama}.png`);
}

// Lantai: garis tipis supaya kaki Memo terbaca.
function lantai(cr, y, x1, x2) {
    cr.setSourceRGB(0.32, 0.32, 0.34);
    cr.rectangle(x1, y, x2 - x1, 2);
    cr.fill();
}

const memo = gambarMemo;
const piksel = gambarPiksel;
const kotoran = gambarKotoran;
const telur = gambarTelur;

// --- Gambar diam ---------------------------------------------------------

// Avatar: 6 warna x 3 bentuk mata.
{
    const c = kanvas(6 * 140 + 20, 3 * 110 + 20);
    BENTUK_MATA.forEach((mata, j) => Object.keys(WARNA_BADAN).forEach((warna, i) =>
        memo(c.cr, 80 + i * 140, 100 + j * 110, { warna, mata })));
    simpan(c, 'avatar');
}

// Tahap umur: telur, bayi, balita, anak, remaja/dewasa.
{
    const c = kanvas(5 * 150 + 20, 140);
    lantai(c.cr, 120, 10, 5 * 150 + 10);
    telur(c.cr, 85, 120, 'pink');
    [0.6, 0.7, 0.85, 1].forEach((u, i) => memo(c.cr, 85 + (i + 1) * 150, 120, { warna: 'pink', mata: 'bulat', ukuran: u }));
    simpan(c, 'tahap');
}

// Rupa per tahap & jenis kelamin.
{
    const tahap = [['bayi', 0.6], ['balita', 0.7], ['anak', 0.85], ['remaja', 1], ['dewasa', 1], ['tua', 1]];
    const c = kanvas(tahap.length * 150 + 20, 2 * 140 + 20);
    ['laki-laki', 'perempuan'].forEach((kelamin, j) => {
        lantai(c.cr, 130 + j * 140, 10, tahap.length * 150 + 10);
        tahap.forEach(([t, u], i) => memo(c.cr, 85 + i * 150, 130 + j * 140,
            { warna: j ? 'pink' : 'biru', mata: j ? 'bulat' : 'kotak', ukuran: u, kelamin, tahap: t, ekspresi: t === 'tua' ? 'senang' : 'netral' }));
    });
    simpan(c, 'rupa');
}

// Ekspresi kebutuhan: lapar, sakit, kotor, kotor parah.
{
    const c = kanvas(4 * 160 + 20, 140);
    lantai(c.cr, 120, 10, 4 * 160 + 10);
    memo(c.cr, 90, 120, { ekspresi: 'bingung' });
    memo(c.cr, 250, 120, { ekspresi: 'sakit' });
    memo(c.cr, 410, 120, { kotor: 0.6 });
    memo(c.cr, 570, 120, { kotor: 0.95, t: 0.3 });
    simpan(c, 'kebutuhan');
}

// Studio Memo: semua pilihan per kategori (item istimewa: gembok + koin).
function tulis(cr, teks, x, y, { ukuran = 12, warna = [0.85, 0.88, 0.92], tebal = false } = {}) {
    cr.selectFontFace('monospace', Cairo.FontSlant.NORMAL, tebal ? Cairo.FontWeight.BOLD : Cairo.FontWeight.NORMAL);
    cr.setFontSize(ukuran);
    cr.setSourceRGB(...warna);
    cr.moveTo(x, y);
    cr.showText(teks);
}

{
    const JUDUL = { bentuk: 'bentuk badan', warna: 'warna badan', pola: 'pola badan', mata: 'mata', warnaMata: 'warna mata',
        mulut: 'mulut', pipi: 'pipi', kepala: 'kepala', ekstra: 'ekstra' };
    const SEL = 118, KOLOM = 12;
    let baris = 0;
    const tata = Object.keys(KATALOG).map(k => {
        const r = baris;
        baris += 1 + Math.ceil(KATALOG[k].length / KOLOM) * 1;
        return [k, r];
    });
    const tinggi = Object.values(KATALOG).reduce((n, d) => n + 30 + Math.ceil(d.length / KOLOM) * SEL, 0) + 30 + SEL + 20;
    const c = kanvas(KOLOM * SEL + 20, tinggi);
    let y = 10;
    for (const [k] of tata) {
        tulis(c.cr, JUDUL[k], 14, y + 22, { ukuran: 15, tebal: true, warna: [0.5, 0.9, 0.55] });
        y += 30;
        KATALOG[k].forEach(([id, koin], i) => {
            const x = 10 + (i % KOLOM) * SEL;
            const yy = y + Math.floor(i / KOLOM) * SEL;
            const rupa = { ...RUPA_BAWAAN, warna: k === 'warnaMata' ? 'hitam' : 'biru', mulut: k === 'pipi' ? 'senyum' : 'tanpa', [k]: id };
            if (k === 'warna')
                rupa.warna = id;
            memo(c.cr, x + SEL / 2, yy + 84, { ...rupa, kelamin: 'perempuan', ukuran: 0.72 });
            tulis(c.cr, id, x + 8, yy + 104, { ukuran: 11 });
            if (koin) {
                c.cr.setSourceRGBA(0, 0, 0, 0.18);
                c.cr.rectangle(x + 2, yy + 2, SEL - 6, SEL - 18);
                c.cr.fill();
                tulis(c.cr, `[kunci] ${koin} koin`, x + 8, yy + 18, { ukuran: 10, warna: [1, 0.8, 0.3] });
            }
        });
        y += Math.ceil(KATALOG[k].length / KOLOM) * SEL;
    }
    // Mulut ikut ekspresi.
    tulis(c.cr, 'mulut ikut ekspresi (mulut: senyum)', 14, y + 22, { ukuran: 15, tebal: true, warna: [0.5, 0.9, 0.55] });
    y += 30;
    ['netral', 'senang', 'mendengar', 'bicara', 'tidur', 'sakit'].forEach((e, i) => {
        const x = 10 + i * SEL;
        memo(c.cr, x + SEL / 2, y + 84, { ...RUPA_BAWAAN, warna: 'kuning', mulut: 'senyum', pipi: 'merona', ekspresi: e, ukuran: 0.72 });
        tulis(c.cr, e, x + 8, y + 104, { ukuran: 11 });
    });
    c.s.flush();
    simpan(c, 'studio');
}

// Tombol "acak" di Studio: rupa berganti, Memo melompat kecil.
{
    let b = 21;
    const acak = () => ((b = (b * 16807) % 2147483647) - 1) / 2147483646;
    const rupa = Array.from({ length: 8 }, () => acakRupa(acak));
    animasi('studio-acak', 8 * 8, 260, 170, (cr, f) => {
        lantai(cr, 150, 10, 250);
        const r = rupa[Math.floor(f / 8)];
        const k = f % 8;
        memo(cr, 130, 150 - [0, 10, 16, 18, 16, 10, 4, 0][k], { ...r, kelamin: 'laki-laki', ekspresi: k < 4 ? 'senang' : 'netral' });
    });
}

// --- Animasi (bingkai -> GIF di buat.sh) ---------------------------------

function animasi(nama, n, l, t, gambar) {
    GLib.mkdir_with_parents(`${KELUAR}/${nama}`, 0o755);
    for (let f = 0; f < n; f++) {
        const c = kanvas(l, t);
        gambar(c.cr, f);
        c.cr.$dispose();
        c.s.writeToPNG(`${KELUAR}/${nama}/${String(f).padStart(4, '0')}.png`);
    }
}

// Menetas.
animasi('menetas', 40, 240, 140, (cr, f) => {
    lantai(cr, 120, 10, 230);
    if (f < 16)
        telur(cr, 120, 120, 'biru', 0, f % 8 < 4 ? -10 : 10);
    else if (f < 28)
        telur(cr, 120, 120, 'biru', Math.min(4, Math.floor((f - 16) / 3) + 1), f % 2 ? -10 : 10);
    else
        memo(cr, 120, 120 - (f < 34 ? [0, 12, 20, 24, 20, 12][f - 28] : 0), { warna: 'biru', ukuran: 0.6, ekspresi: 'senang' });
});

// Pup berserakan + Memo kotor + lalat.
animasi('pup-kotor', 24, 560, 150, (cr, f) => {
    lantai(cr, 130, 10, 550);
    for (const x of [70, 380, 470])
        kotoran(cr, x, 130);
    memo(cr, 230, 130, { kotor: 0.95, t: f / 12, ekspresi: 'bingung' });
});

// Makan: makanan jatuh, Memo mengunyah.
animasi('makan', 30, 300, 180, (cr, f) => {
    lantai(cr, 160, 10, 290);
    const k = f % 10;
    gambarMakanan(cr, 196, 40 + Math.min(1, k / 6) * (120 - 4 * P), ['nasi', 'kue', 'buah'][Math.floor(f / 10)]);
    memo(cr, 120, 160, { ekspresi: k > 6 ? 'senang' : 'mendengar', sy: k > 6 && k % 2 ? 0.92 : 1 });
});

// Perawatan & atraksi lewat atraksi.js + fisika.js.
const AREA = { x: 0, y: 0, lebar: 900, tinggi: 520 };
const persepsi = { areaKerja: AREA, jendela: [], kursor: { x: 880, y: 20 } };
const peta = petaDari(persepsi, UKURAN);
let benih = 3;
const acak = () => ((benih = (benih * 16807) % 2147483647) - 1) / 2147483646;

function mainkan(nama, r, { warna = 'hitam', mata = 'kotak', skala = 1, tambahan = 18 } = {}) {
    const n = lamaAtraksi(r);
    let badan = null, ekspresi = 'senang', gaze = [0, 0];
    const bingkaiSemua = [];
    for (let f = 0; f < n + tambahan; f++) {
        const b = f <= n ? bingkai(r, f) : { badan: null, piksel: [], lepas: null };
        if (b.ekspresi)
            ekspresi = b.ekspresi;
        if (b.mata)
            gaze = b.mata;
        if (b.badan) {
            badan = { ...b.badan };
        } else if (badan) {
            if (b.lepas || !badan.fisik)
                badan = { ...badan, fisik: badan.fisik ?? lempar(badanBaru(badan.x, badan.y), b.lepas?.vx ?? 0, b.lepas?.vy ?? 0) };
            badan.fisik = langkah(badan.fisik, peta, { ukuran: UKURAN }).badan;
            badan = { ...badan, x: badan.fisik.x, y: badan.fisik.y, rz: 0, sy: 1 };
        }
        bingkaiSemua.push({ badan, piksel: b.piksel, ekspresi, gaze });
    }
    animasi(nama, bingkaiSemua.length, Math.round(AREA.lebar * skala), Math.round(AREA.tinggi * skala), (cr, f) => {
        const x = bingkaiSemua[f];
        cr.scale(skala, skala);
        lantai(cr, AREA.tinggi - 1, 0, AREA.lebar);
        if (x.badan)
            memo(cr, x.badan.x, x.badan.y, { warna, mata, ekspresi: x.ekspresi, rz: x.badan.rz, sy: x.badan.sy, gaze: x.gaze });
        piksel(cr, x.piksel);
    });
}

const bawah = AREA.y + AREA.tinggi;
for (const nama of ['ayunan', 'gelantungan', 'terjun', 'mobil']) {
    benih = 3;
    const r = rencanakan(nama, { peta, ukuran: UKURAN, posisi: { x: 200, y: bawah }, acak, berdiri: true });
    if (!r) {
        printerr(`tidak ada rencana ${nama}`);
        continue;
    }
    mainkan(nama, { ...r, asal: { x: 200, y: bawah } }, { skala: 0.6 });
}
const tengah = { x: 300, y: 200 };
for (const [nama, opsi] of [['mandi', {}], ['cebok', {}], ['tidur', { lamaTidur: 72 }], ['bintang', {}]]) {
    const r = rencanaPerawatan(nama, tengah, opsi);
    const n = lamaAtraksi(r);
    const daftar = Array.from({ length: n + (nama === 'bintang' ? 14 : 6) }, (_, f) => bingkai(r, Math.min(f, n)));
    let ekspresi = 'netral';
    animasi(nama, daftar.length, 600, 230, (cr, f) => {
        const b = daftar[f];
        if (b.ekspresi)
            ekspresi = b.ekspresi;
        cr.translate(0, 20);
        lantai(cr, 200, 0, 600);
        const badan = b.badan ?? (nama === 'bintang' ? null : { x: tengah.x, y: tengah.y, rz: 0, sy: 1 });
        if (badan) {
            memo(cr, badan.x, badan.y, { warna: 'putih', mata: 'bulat', ekspresi, rz: badan.rz, sy: badan.sy, gaze: b.mata ?? [0, 0],
                kelamin: 'perempuan', tahap: nama === 'bintang' ? 'tua' : 'dewasa', opacity: (badan.opacity ?? 255) / 255 });
        } else if (nama === 'bintang' && f >= 49) {
            telur(cr, tengah.x, Math.min(200, -40 + (f - 49) * 40), 'putih');
        }
        piksel(cr, b.piksel);
    });
}
// Meninggal: makam, hantu, lalu gerbang surga (tua) atau neraka (ditelantarkan).
for (const tujuan of ['surga', 'neraka']) {
    const asal = { x: 260, y: 420 };
    const r = rencanaPerawatan('wafat', asal, { tujuan, namaMemo: 'Mochi' });
    const n = lamaAtraksi(r);
    let ekspresi = 'netral';
    animasi(`wafat-${tujuan}`, n + 18, 560, 440, (cr, f) => {
        const b = bingkai(r, Math.min(f, n - 1));
        if (b.ekspresi)
            ekspresi = b.ekspresi;
        lantai(cr, 420, 0, 560);
        if (b.badan && f < n - 2)
            memo(cr, b.badan.x, b.badan.y, { warna: 'pink', mata: 'bulat', kelamin: 'perempuan', tahap: tujuan === 'surga' ? 'tua' : 'dewasa',
                ekspresi, sy: b.badan.sy });
        piksel(cr, f < n ? b.piksel : bingkai(r, n - 2).piksel.filter(([x, y]) => y * 3 >= 420 - 30 * 3 && Math.abs(x * 3 - 260) < 60));
        if (f >= n)
            telur(cr, 350, Math.min(420, 150 + (f - n) * 30), 'putih');
    });
}
print('selesai');
