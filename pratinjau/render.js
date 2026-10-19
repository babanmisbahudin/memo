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
print('selesai');
