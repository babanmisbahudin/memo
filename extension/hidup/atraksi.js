// Atraksi Memo hidup: main ayunan & bergelantungan di tepi atas layar, terjun
// payung ke sebuah lantai, dan naik mobil di sepanjang lantai. Murni (tanpa
// St/Clutter/Meta): memoHidup.js memanggil bingkai() 12x per detik lalu
// menggerakkan badan dan menggambar properti pixel-art-nya.
//
// Gaya piksel (gerakPola.js): melangkah per bingkai 12 fps, putaran per 10
// derajat, properti digambar di kisi P piksel logis. Properti yang berayun
// diputar kaku bersama badan mengelilingi satu poros (gantungan ayunan,
// genggaman tangan, tepi bawah parasut), jadi badan dan tali selalu nyambung.
//
// Titik badan = kaki (tengah bawah), sama dengan dunia.js & fisika.js.
//
// bingkai(rencana, f) -> {
//   badan: { x, y, rz, sy } | null    null = badan sudah diserahkan ke fisika
//   lepas: { vx, vy } | null          hanya pada bingkai penyerahan
//   piksel: [[gx, gy, [r, g, b]], ...] kotak P x P di (gx * P, gy * P)
//   mata: [x, y] | null               arah tatapan (-1..1)
//   selesai: bool }

import { bolehDi } from './dunia.js';
import { titikDi } from './fisika.js';
import { HURUF } from '../hurufPiksel.js';

export const P = 3;
export const ATRAKSI = ['ayunan', 'gelantungan', 'terjun', 'mobil'];

// Badan Memo dalam kisi P: 40 x 24 (UKURAN 120 x 72).
const BADAN_L = 40;
const BADAN_T = 24;

const W = {
    tali: [214, 176, 118], taliGelap: [150, 112, 64], kayu: [128, 82, 40], kayuTerang: [178, 122, 64],
    besi: [150, 160, 175], lengan: [62, 68, 82], lenganTerang: [112, 120, 138], tangan: [150, 158, 176],
    payungA: [255, 92, 92], payungB: [250, 250, 250], payungBawah: [196, 64, 74], taliPayung: [225, 230, 238],
    mobil: [229, 72, 77], mobilTerang: [255, 138, 142], mobilGelap: [160, 40, 45], garis: [250, 250, 250],
    kaca: [154, 215, 255], bingkai: [70, 76, 88], ban: [26, 28, 34], velg: [170, 178, 190],
    lampu: [255, 230, 128], lampuBelakang: [255, 120, 60], asap: [200, 204, 212],
    air: [120, 200, 255], airTerang: [190, 235, 255], busa: [245, 248, 255], pancuran: [170, 178, 190],
    tisu: [250, 250, 245], tisuBayang: [210, 212, 205], kilau: [255, 220, 90],
    kasur: [90, 120, 200], kasurTerang: [130, 160, 230], bantal: [245, 240, 230], selimut: [255, 150, 120],
    selimutPola: [255, 205, 150], zz: [200, 220, 255],
    tanah: [110, 80, 55], tanahGelap: [80, 58, 40], batu: [150, 155, 165], batuGelap: [105, 110, 120], tulisan: [60, 62, 70],
    bunga: [255, 110, 140], bungaKuning: [255, 215, 80], batang: [80, 170, 90],
    hantu: [236, 242, 255], hantuBayang: [190, 205, 230], mataHantu: [40, 45, 60],
    awan: [245, 248, 255], emas: [255, 205, 70], emasGelap: [200, 145, 30], cahaya: [255, 245, 190],
    batuMerah: [125, 35, 35], batuMerahGelap: [80, 20, 20], api: [255, 120, 30], apiKuning: [255, 210, 60], apiMerah: [210, 40, 30],
    lubang: [25, 5, 5], asapGelap: [90, 90, 95],
};

export const snap10 = d => Math.round(d / 10) * 10 || 0;
const snapP = v => Math.round(v / P) * P;
const jepit = (v, a, b) => Math.min(b, Math.max(a, v));

// Putar (x, y) sebesar `d` derajat, searah jarum jam di layar (y ke bawah).
export function putarTitik([x, y], d) {
    const a = d * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    return [x * c - y * s, x * s + y * c];
}

// --- Gambar pixel-art: Map "gx,gy" -> warna -------------------------------

function titik(g, x, y, w) {
    g.set(`${x},${y}`, w);
}

function kotak(g, x1, y1, x2, y2, w) {
    for (let y = y1; y <= y2; y++) {
        for (let x = x1; x <= x2; x++)
            titik(g, x, y, w);
    }
}

// Garis Bresenham; `w` boleh fungsi (indeks piksel ke-i) -> warna.
function garis(g, x0, y0, x1, y1, w) {
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let e = dx + dy, x = x0, y = y0, i = 0;
    for (;;) {
        titik(g, x, y, typeof w === 'function' ? w(i++) : w);
        if (x === x1 && y === y1)
            break;
        const e2 = 2 * e;
        if (e2 >= dy) {
            e += dy;
            x += sx;
        }
        if (e2 <= dx) {
            e += dx;
            y += sy;
        }
    }
}

// Putar gambar kaku mengelilingi pojok petak (0, 0), dengan pemetaan balik
// (tiap petak tujuan mengambil warna petak asal terdekat) supaya tidak bolong.
export function putarGambar(g, d) {
    if (!d || !g.size)
        return g;
    const asal = [...g.keys()].map(k => k.split(',').map(Number));
    const sudut = asal.flatMap(([x, y]) => [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]].map(p => putarTitik(p, d)));
    const xs = sudut.map(p => p[0]), ys = sudut.map(p => p[1]);
    const hasil = new Map();
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
        for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++) {
            const [sx, sy] = putarTitik([x + 0.5, y + 0.5], -d);
            const w = g.get(`${Math.floor(sx)},${Math.floor(sy)}`);
            if (w)
                hasil.set(`${x},${y}`, w);
        }
    }
    return hasil;
}

// Gabung beberapa gambar lokal ke daftar piksel mutlak (poros di petak ox, oy).
function keDaftar(ox, oy, ...gambar) {
    const semua = new Map();
    for (const g of gambar) {
        for (const [k, w] of g)
            semua.set(k, w);
    }
    return [...semua].map(([k, w]) => {
        const [x, y] = k.split(',').map(Number);
        return [x + ox, y + oy, w];
    });
}

// Kaki badan: poros (piksel logis) + titik lokal (petak) yang ikut diputar.
function kaki(px, py, lokal, d) {
    const [x, y] = putarTitik([lokal[0] * P, lokal[1] * P], d);
    return { x: Math.round(px + x), y: Math.round(py + y) };
}

// Tenggelam di tempat lama (3 bingkai) lalu muncul di tempat atraksi (3
// bingkai), seperti menyelinap. Mengembalikan skala tinggi badan.
const SELAM = [0.66, 0.33, 0];
const MUNCUL = [0.33, 0.66, 1];

// --- Ayunan: tali turun dari tepi atas, Memo duduk & berayun, lalu loncat --

const AY = { turun: 8, ayun: 108, naik: 8 };

function gambarAyunan(panjang) {
    const tali = new Map(), kait = new Map();
    for (const x of [-22, 21]) {
        kotak(kait, x - 1, 0, x + 1, 1, W.besi);
        for (let y = 2; y < panjang; y++)
            titik(tali, x, y, Math.floor(y / 2) % 2 ? W.taliGelap : W.tali);
    }
    if (panjang > 2) {
        kotak(tali, -24, panjang, 23, panjang, W.kayuTerang);
        kotak(tali, -24, panjang + 1, 23, panjang + 1, W.kayu);
    }
    return { tali, kait };
}

function ayunan(r, f) {
    const { L } = r;
    const f1 = AY.turun, f2 = f1 + 3, f3 = f2 + 3, f4 = f3 + AY.ayun, f5 = f4 + AY.naik;
    if (f >= f5)
        return { badan: null, lepas: null, piksel: [], mata: null, selesai: true };
    const panjang = f < f1 ? Math.round(L * (f + 1) / AY.turun) : f < f4 ? L
        : Math.round(L * (1 - (f - f4 + 1) / AY.naik));
    let d = 0, mata = null;
    if (f >= f3 && f < f4) {
        const k = f - f3;
        const amp = 30 * Math.min(1, k / 24, (AY.ayun - k) / 24);
        d = snap10(amp * Math.sin(2 * Math.PI * k / 24));
        mata = [Math.cos(2 * Math.PI * k / 24) >= 0 ? 0.7 : -0.7, 0.1];
    }
    const { tali, kait } = gambarAyunan(panjang);
    // Tali dekat gantungan yang terputar ke atas tepi layar tidak digambar.
    const piksel = keDaftar(r.ax / P, r.ay / P, putarGambar(tali, d), kait).filter(([, y]) => y >= r.ay / P);
    let badan = null;
    if (f < f1)
        badan = { ...r.asal, rz: 0, sy: 1 };
    else if (f < f2)
        badan = { ...r.asal, rz: 0, sy: SELAM[f - f1] };
    else if (f < f4)
        badan = { ...kaki(r.ax, r.ay, [0, L], d), rz: d, sy: f < f3 ? MUNCUL[f - f2] : 1 };
    return { badan, lepas: f === f4 ? { vx: 4 * (r.arah ?? 1), vy: -7 } : null, piksel, mata, selesai: false };
}

// --- Gelantungan: dua tangan mencengkeram tepi atas, berayun & pull-up ----

const GANTUNG = 96;
const TARIK = [0, 2, 4, 6, 6, 6, 6, 6, 4, 2, 0, 0];

function gelantungan(r, f) {
    const H = r.H;
    const f1 = 3, f2 = 6, f3 = f2 + GANTUNG;
    if (f > f3)
        return { badan: null, lepas: null, piksel: [], mata: null, selesai: true };
    if (f < f1)
        return { badan: { ...r.asal, rz: 0, sy: SELAM[f] }, lepas: null, piksel: [], mata: null, selesai: false };
    if (f === f3)
        return { badan: null, lepas: { vx: 0, vy: 0 }, piksel: [], mata: null, selesai: false };
    const k = f - f2;
    let tarik = 0, d = 0, mata = [0, 0.4];
    for (const mulai of [30, 66]) {
        if (k >= mulai && k < mulai + TARIK.length) {
            tarik = TARIK[k - mulai];
            mata = [0, -0.8];
        }
    }
    if (f >= f2 && !tarik && !(k >= 30 && k < 42) && !(k >= 66 && k < 78))
        d = snap10(12 * Math.sin(2 * Math.PI * k / 36));
    const h = H - tarik;
    const lengan = new Map(), tangan = new Map();
    for (const x of [-12, 9]) {
        kotak(tangan, x - 1, 0, x + 3, 2, W.tangan);
        for (let y = 3; y < h + 2; y++) {
            titik(lengan, x, y, W.lenganTerang);
            titik(lengan, x + 1, y, W.lengan);
            titik(lengan, x + 2, y, W.lengan);
        }
    }
    if (d)
        mata = [-d / 20, 0.4];
    return {
        badan: { ...kaki(r.hx, r.ay, [0, h + BADAN_T], d), rz: d, sy: f < f2 ? MUNCUL[f - f1] : 1 },
        lepas: null, piksel: keDaftar(r.hx / P, r.ay / P, putarGambar(lengan, d), tangan).filter(([, y]) => y >= r.ay / P),
        mata, selesai: false,
    };
}

// --- Terjun payung: parasut terbuka di atas, melayang turun ke sebuah lantai

const TALI_PAYUNG = 10;          // petak dari tepi bawah parasut ke kepala Memo
const KAKI_PAYUNG = TALI_PAYUNG + BADAN_T;
const LAJU_PAYUNG = 5;           // piksel logis per bingkai

// Parasut lebar 46 petak di atas poros (0, 0); `buka` 0..1, `tinggi` 0..1.
function gambarParasut(buka = 1, tinggi = 1, tali = true) {
    const g = new Map();
    const setengah = Math.max(2, Math.round(23 * buka));
    const kubah = Math.max(1, Math.round(13 * Math.sqrt(buka) * tinggi));
    for (let x = -setengah; x < setengah; x++) {
        const d = (x + 0.5) / setengah;
        const atas = -1 - Math.round(kubah * Math.sqrt(Math.max(0, 1 - d * d)));
        const ruas = Math.floor((x + setengah) / (2 * setengah) * 6);
        for (let y = atas; y <= -2; y++)
            titik(g, x, y, ruas % 2 ? W.payungB : W.payungA);
        // Tepi bawah berlekuk: celah di batas ruas.
        if ((x + setengah) % Math.max(2, Math.round(setengah / 3)) !== 0)
            titik(g, x, -1, W.payungBawah);
    }
    if (tali && buka >= 1) {
        for (const [x0, x1] of [[-20, -17], [-8, -15], [7, 14], [19, 16]])
            garis(g, x0, 0, x1, TALI_PAYUNG - 1, W.taliPayung);
    }
    return g;
}

function terjunTurun(r) {
    const awalY = r.ay + 15 * P;
    return Math.max(1, Math.ceil((r.ty - 1 - (awalY + KAKI_PAYUNG * P)) / LAJU_PAYUNG));
}

function terjun(r, f) {
    const n = terjunTurun(r);
    const awalY = r.ay + 15 * P;
    const f1 = 3, f2 = 7, f3 = f2 + n, f4 = f3 + 6;
    if (f >= f4)
        return { badan: null, lepas: null, piksel: [], mata: null, selesai: true };
    if (f < f1)
        return { badan: { ...r.asal, rz: 0, sy: SELAM[f] }, lepas: null, piksel: [], mata: null, selesai: false };
    if (f < f2) {
        const buka = [0.2, 0.45, 0.7, 1][f - f1];
        return {
            badan: { ...kaki(r.sx, awalY, [0, KAKI_PAYUNG], 0), rz: 0, sy: f - f1 < 3 ? MUNCUL[f - f1] : 1 },
            lepas: null, piksel: keDaftar(r.sx / P, awalY / P, gambarParasut(buka)), mata: [0, -0.6], selesai: false,
        };
    }
    if (f < f3) {
        const k = f - f2;
        const s = (k + 1) / n;
        const akhir = k === n - 1;
        const d = akhir ? 0 : snap10(10 * Math.sin(2 * Math.PI * k / 30) * Math.min(1, (n - 1 - k) / 8));
        const px = snapP(r.sx + (r.tx - r.sx) * s + (akhir ? 0 : 12 * Math.sin(2 * Math.PI * k / 30) * (1 - s)));
        const py = akhir ? r.ty - 1 - KAKI_PAYUNG * P : awalY + LAJU_PAYUNG * (k + 1);
        const badan = akhir ? { x: r.tx, y: r.ty - 1, rz: 0, sy: 1 } : { ...kaki(px, py, [0, KAKI_PAYUNG], d), rz: d, sy: 1 };
        return {
            badan, lepas: null, piksel: keDaftar(Math.round(px / P), Math.round(py / P), putarGambar(gambarParasut(), d)),
            mata: [0, 0.8], selesai: false,
        };
    }
    // Mendarat: badan ke fisika, parasut kempis dan rebah ke samping.
    const j = f - f3;
    const px = r.tx + (j + 1) * 4 * P * (r.arah ?? 1);
    const py = Math.min(r.ty - 2 * P, r.ty - 1 - KAKI_PAYUNG * P + (j + 1) * 5 * P);
    return {
        badan: null, lepas: j === 0 ? { vx: 0, vy: 0 } : null,
        piksel: keDaftar(Math.round(px / P), Math.round(py / P), gambarParasut(1, 1 - (j + 1) / 7, false)),
        mata: null, selesai: false,
    };
}

// --- Mobil: mobil kecil muncul (asap), Memo naik, menyetir, lalu turun -----

const LAJU_MOBIL = 8;
const KURSI = 6;                 // kaki Memo di dalam mobil, petak di atas lantai

// Mobil menghadap kanan, poros = (tengah badan Memo, lantai). `roda` 0/1.
function gambarMobil(roda, arah) {
    const g = new Map();
    const t = (x, y, w) => titik(g, arah < 0 ? -x - 1 : x, y, w);
    const k = (x1, y1, x2, y2, w) => {
        for (let y = y1; y <= y2; y++) {
            for (let x = x1; x <= x2; x++)
                t(x, y, w);
        }
    };
    // Kaca depan miring + bingkainya.
    for (let r = 0; r < 7; r++) {
        const x = 24 + Math.floor(r / 2);
        t(x - 1, -21 + r, W.bingkai);
        t(x, -21 + r, W.kaca);
        t(x + 1, -21 + r, W.kaca);
    }
    // Badan setinggi pinggang Memo: garis atas terang, merah, garis balap
    // putih, bawah gelap. Sandaran kursi di belakang.
    k(-27, -17, -24, -14, W.mobilGelap);
    k(-23, -14, 29, -14, W.mobilTerang);
    k(-26, -13, 33, -6, W.mobil);
    k(30, -13, 33, -12, W.mobilTerang);
    k(-24, -9, 31, -9, W.garis);
    k(-25, -5, 32, -5, W.mobilGelap);
    k(33, -11, 33, -10, W.lampu);
    k(-26, -11, -26, -10, W.lampuBelakang);
    // Roda: ban bulat, velg dengan jari-jari yang berganti tiap bingkai.
    for (const cx of [-16, 24]) {
        for (let dy = -3; dy <= 3; dy++) {
            for (let dx = -3; dx <= 3; dx++) {
                if (dx * dx + dy * dy <= 11)
                    t(cx + dx, -4 + dy, W.ban);
            }
        }
        t(cx, -4, W.velg);
        for (const [dx, dy] of roda ? [[-2, 0], [2, 0]] : [[0, -2], [0, 2]])
            t(cx + dx, -4 + dy, W.velg);
    }
    return g;
}

function gambarAsap(j, lebar = 22) {
    const g = new Map();
    const rx = lebar + 6 * j, ry = 5 + 2 * j;
    for (let a = 0; a < 16; a++) {
        const s = a / 16 * 2 * Math.PI;
        const x = Math.round(Math.cos(s) * rx), y = Math.round(Math.sin(s) * ry) - ry - 2;
        kotak(g, x, y, x + (j < 2 ? 1 : 0), y + (j < 2 ? 1 : 0), W.asap);
    }
    return g;
}

function mobilJalan(r) {
    return Math.max(1, Math.ceil(Math.abs(r.ke - r.dari) / LAJU_MOBIL));
}

function mobil(r, f) {
    const n = mobilJalan(r);
    const f1 = 3, f2 = 6, f3 = f2 + n, f4 = f3 + 3, f5 = f4 + 3;
    const lantai = r.y;
    const kursi = lantai - KURSI * P;
    if (f >= f5)
        return { badan: null, lepas: null, piksel: [], mata: null, selesai: true };
    const x = f < f2 ? r.dari : f < f3 ? r.dari + r.arah * Math.min(Math.abs(r.ke - r.dari), LAJU_MOBIL * (f - f2 + 1)) : r.ke;
    const ox = Math.round(x / P), oy = Math.round(lantai / P);
    if (f < f1) {
        return { badan: { x: r.dari, y: lantai, rz: 0, sy: 1 }, lepas: null,
            piksel: keDaftar(ox, oy, gambarAsap(f)), mata: [r.arah * 0.5, 0], selesai: false };
    }
    if (f >= f4) {
        return { badan: null, lepas: f === f4 ? { vx: 0, vy: 0 } : null,
            piksel: keDaftar(ox, oy, gambarAsap(f - f4)), mata: null, selesai: false };
    }
    const k = f - f2;
    const roda = f < f3 ? k % 2 : 0;
    const mobilG = gambarMobil(roda, r.arah);
    // Asap knalpot: kepulan tiap 5 bingkai, tertinggal di belakang & naik.
    const asap = new Map();
    if (f >= f2 && f < f3) {
        for (let mulai = 0; mulai <= k; mulai += 5) {
            const umur = k - mulai;
            if (umur > 5)
                continue;
            const xLepas = Math.round((r.dari + r.arah * Math.min(Math.abs(r.ke - r.dari), LAJU_MOBIL * (mulai + 1))) / P);
            const ax = xLepas - ox + r.arah * (-28 - umur), ay = -4 - Math.floor(umur / 2);
            kotak(asap, ax, ay, ax + (umur < 3 ? 1 : 0), ay + (umur < 3 ? 1 : 0), W.asap);
        }
    }
    let y;
    if (f < f2)
        y = [lantai - 12 * P, lantai - 10 * P, kursi][f - f1];
    else if (f < f3)
        y = kursi - ((k >> 1) % 2 ? P : 0);
    else
        y = [lantai - 12 * P, lantai - 10 * P, lantai - 4 * P][f - f3];
    return {
        badan: { x: Math.round(x), y, rz: 0, sy: 1 }, lepas: null,
        piksel: keDaftar(ox, oy, asap, mobilG), mata: [r.arah * 0.8, 0], selesai: false,
    };
}

// --- Perawatan dari menu (bukan atraksi pilihan sendiri) -----------------
// Memo berdiri di tempat; properti di sekitar badan, poros = kaki Memo.

const BUSA = [[-15, -20], [-6, -23], [5, -22], [14, -19], [-18, -10], [17, -9], [-9, -16], [10, -14]];

function mandi(r, f) {
    const SIRAM = 28, KIBAS = 6;
    if (f > SIRAM + KIBAS)
        return { badan: null, lepas: null, piksel: [], mata: null, selesai: true };
    if (f === SIRAM + KIBAS)
        return { badan: null, lepas: { vx: 0, vy: 0 }, piksel: [], mata: null, selesai: false };
    const g = new Map();
    if (f < SIRAM) {
        // Pancuran di atas kepala + tetesan yang turun.
        kotak(g, -1, -46, 0, -39, W.pancuran);
        kotak(g, -6, -38, 5, -37, W.pancuran);
        for (let i = 0; i < 11; i++) {
            const x = -10 + i * 2;
            const y = -35 + ((f * 3 + i * 7) % 34);
            titik(g, x, y, i % 2 ? W.air : W.airTerang);
            titik(g, x, y + 1, W.air);
        }
        // Busa makin banyak di badan.
        for (const [x, y] of BUSA.slice(0, Math.min(BUSA.length, Math.floor(f / 3))))
            kotak(g, x, y, x + 2, y + 1, W.busa);
    } else {
        // Mengibaskan badan: cipratan air ke kiri & kanan.
        const k = f - SIRAM;
        for (const s of [-1, 1]) {
            for (let i = 0; i < 3; i++)
                titik(g, s * (22 + k * 2 + i * 2), -14 - i * 3 + k, W.air);
        }
    }
    const rz = f >= SIRAM ? (f % 2 ? 10 : -10) : 0;
    return { badan: { x: r.asal.x, y: r.asal.y, rz, sy: 1 }, lepas: null,
        piksel: keDaftar(Math.round(r.asal.x / P), Math.round(r.asal.y / P), g), mata: f < SIRAM ? [0, -0.6] : null,
        ekspresi: f === 0 ? 'senang' : null, selesai: false };
}

function cebok(r, f) {
    const LAMA = 28;
    if (f > LAMA)
        return { badan: null, lepas: null, piksel: [], mata: null, selesai: true };
    if (f === LAMA)
        return { badan: null, lepas: { vx: 0, vy: -3 }, piksel: [], mata: null, selesai: false };
    const g = new Map();
    // Gulungan tisu di samping.
    kotak(g, 24, -7, 29, -1, W.tisu);
    kotak(g, 26, -5, 27, -3, W.tisuBayang);
    if (f >= 5 && f < 21) {
        // Selembar tisu mengusap bolak-balik di bawah badan.
        const x = Math.round(12 * Math.sin((f - 5) * Math.PI / 4));
        kotak(g, x - 3, -2, x + 3, 0, W.tisu);
        kotak(g, x + 4, -1, 23, -1, W.tisuBayang);
    } else if (f >= 21) {
        // Kilau bersih.
        for (const [x, y] of [[-16, -6], [14, -10], [0, -4]]) {
            const k = (f + x) % 2;
            titik(g, x, y, W.kilau);
            if (k) {
                for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]])
                    titik(g, x + dx, y + dy, W.kilau);
            }
        }
    }
    const angkat = f >= 4 && f < 21 ? 2 * P : 0;
    return { badan: { x: r.asal.x, y: r.asal.y - angkat, rz: 0, sy: 1 }, lepas: null,
        piksel: keDaftar(Math.round(r.asal.x / P), Math.round(r.asal.y / P), g), mata: f < 21 ? [0, 0.8] : null,
        ekspresi: f === 0 ? 'bingung' : f === 21 ? 'senang' : null, selesai: false };
}

// Disuruh tidur: kasur & bantal muncul, Memo naik, berselimut, bernapas,
// Z melayang; `r.lamaTidur` bingkai lalu bangun.
function tidur(r, f) {
    const SIAP = 6, n = r.lamaTidur ?? 720, BANGUN = 6;
    const f1 = SIAP + n, f2 = f1 + BANGUN;
    if (f > f2)
        return { badan: null, lepas: null, piksel: [], mata: null, selesai: true };
    if (f === f2)
        return { badan: null, lepas: { vx: 0, vy: -4 }, piksel: [], mata: null, selesai: false };
    const g = new Map();
    const KASUR = 3;
    kotak(g, -27, -KASUR, 26, -1, W.kasur);
    kotak(g, -27, -KASUR, 26, -KASUR, W.kasurTerang);
    kotak(g, -26, -KASUR - 5, -17, -KASUR - 1, W.bantal);
    let y = r.asal.y - KASUR * P;
    let ekspresi = null;
    if (f < SIAP) {
        y = r.asal.y - [0, 6, 10, 10, 8, KASUR * 3][f] * P / 3 - (f >= 5 ? 0 : 0);
        if (f === 0)
            ekspresi = 'mendengar';
    } else if (f < f1) {
        const k = f - SIAP;
        if (k === 0)
            ekspresi = 'tidur';
        // Selimut menutup separuh bawah badan, tepinya naik-turun (napas).
        const napas = Math.floor(k / 24) % 2;
        kotak(g, -22, -KASUR - 12 - napas, 21, -KASUR - 1, W.selimut);
        for (let x = -22; x <= 21; x += 4)
            kotak(g, x, -KASUR - 8 - napas, x + 1, -KASUR - 7 - napas, W.selimutPola);
        // Z melayang naik dari sisi kanan kepala.
        for (let i = 0; i < 2; i++) {
            const t = (k + i * 18) % 36;
            const zx = 16 + Math.floor(t / 6), zy = -KASUR - 26 - Math.floor(t / 2);
            for (const [dx, dy] of [[0, 0], [1, 0], [2, 0], [1, 1], [0, 2], [1, 2], [2, 2]])
                titik(g, zx + dx, zy + dy, W.zz);
        }
    } else if (f === f1) {
        ekspresi = 'senang';
    }
    return { badan: { x: r.asal.x, y: Math.round(y), rz: 0, sy: f >= SIAP && f < f1 && Math.floor((f - SIAP) / 24) % 2 ? 0.96 : 1 },
        lepas: null, piksel: keDaftar(Math.round(r.asal.x / P), Math.round(r.asal.y / P), g), mata: null, ekspresi, selesai: false };
}

// Kembali ke bintang (Memo meninggal): tertidur, lalu melayang naik sambil
// memudar bertingkat, meninggalkan jejak bintang. Sesudah dilepas,
// memoHidup menukar badan dengan telur baru yang jatuh dari atas.
function bintang(r, f) {
    const DIAM = 12, NAIK = 36;
    if (f > DIAM + NAIK)
        return { badan: null, lepas: null, piksel: [], mata: null, selesai: true };
    if (f === DIAM + NAIK)
        return { badan: null, lepas: { vx: 0, vy: 0 }, piksel: [], mata: null, selesai: false };
    const k = Math.max(0, f - DIAM);
    const y = r.asal.y - 4 * k;
    const g = new Map();
    for (let i = 1; i <= Math.min(5, Math.floor(k / 3)); i++) {
        const sx = (i % 2 ? -14 : 12) + (i * 5) % 7, sy = i * 5 - 4; // jejak di bawah kaki
        titik(g, sx, sy, W.kilau);
        if ((f + i) % 2) {
            for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]])
                titik(g, sx + dx, sy + dy, W.kilau);
        }
    }
    return {
        badan: { x: r.asal.x, y, rz: 0, sy: 1, opacity: [255, 204, 153, 102, 51, 51][Math.min(5, Math.floor(k / 7))] },
        lepas: null, piksel: keDaftar(Math.round(r.asal.x / P), Math.round(y / P), g), mata: null,
        ekspresi: f === 0 ? 'tidur' : null, selesai: false,
    };
}

// --- Meninggal: makam, hantu, lalu gerbang surga atau neraka --------------
// r.tujuan 'surga' (meninggal karena tua) | 'neraka' (ditelantarkan),
// r.nama untuk batu nisan. Sesudah dilepas, memoHidup memasang makam tetap
// (pikselMakam) dan telur baru jatuh dari atas. r.namaMemo untuk batu nisan.

function teksPiksel(g, teks, x0, y0, w) {
    let x = x0;
    for (const c of teks) {
        const baris = HURUF[c] ?? HURUF['?'];
        baris.forEach((isi, j) => [...isi].forEach((t, i) => {
            if (t === '#')
                titik(g, x + i, y0 + j, w);
        }));
        x += baris[0].length + 1;
    }
}

// Makam: gundukan tanah, batu nisan bertulisan RIP + nama (5 huruf), bunga.
// `naik` 0..1 = batu muncul dari tanah. Poros = tengah alas makam.
export function pikselMakam(nama = 'Memo', naik = 1) {
    const g = new Map();
    for (let y = -3; y <= -1; y++) {
        const lebar = 17 - (y + 3) * 0 - (y === -3 ? 3 : 0);
        kotak(g, -lebar, y, lebar - 1, y, y === -3 ? W.tanahGelap : W.tanah);
    }
    const tinggi = Math.round(24 * naik);
    if (tinggi > 0) {
        const atas = -3 - tinggi;
        const batu = new Map();
        kotak(batu, -15, -27, 14, -4, W.batu);
        kotak(batu, -13, -28, 12, -28, W.batu);
        kotak(batu, -15, -27, -15, -4, W.batuGelap);
        kotak(batu, 14, -27, 14, -4, W.batuGelap);
        teksPiksel(batu, 'RIP', -8, -25, W.tulisan);
        const n = String(nama ?? 'Memo').toUpperCase().normalize('NFD').replace(/[^A-Z0-9]/g, '').slice(0, 5) || 'MEMO';
        teksPiksel(batu, n, -Math.floor((n.length * 6 - 1) / 2), -15, W.tulisan);
        for (const [k, w] of batu) {
            const y = Number(k.split(',')[1]);
            if (y >= atas)
                g.set(k, w);
        }
    }
    for (const [x, w] of [[-14, W.bunga], [-11, W.bungaKuning], [12, W.bunga]]) {
        titik(g, x, -5, w);
        titik(g, x, -4, W.batang);
    }
    return keDaftar(0, 0, g);
}

const HANTU = ['....######....', '..##########..', '.############.', '##############', '###..####..###', '###..####..###',
    '##############', '##############', '##############'];
const EKOR_HANTU = [['###..###..###.', '.###..###..###'], ['.##..##..##..#', '#..##..##..##.']];

function hantu(g, cx, cy, f, panik = false) {
    HANTU.forEach((baris, j) => [...baris].forEach((c, i) => {
        if (c === '#')
            titik(g, cx + i - 7, cy + j - 12, i === 0 || i === 13 ? W.hantuBayang : W.hantu);
        else if (j >= 4 && j <= 5 && (i === 3 || i === 4 || i === 9 || i === 10))
            titik(g, cx + i - 7, cy + j - 12, W.mataHantu);
    }));
    if (panik) {
        // Mata membelalak & mulut "o".
        kotak(g, cx - 4, cy - 9, cx - 3, cy - 6, W.mataHantu);
        kotak(g, cx + 2, cy - 9, cx + 3, cy - 6, W.mataHantu);
        kotak(g, cx - 1, cy - 4, cx, cy - 3, W.mataHantu);
    }
    for (const [j, baris] of EKOR_HANTU[f % 2].entries()) {
        [...baris].forEach((c, i) => {
            if (c === '#')
                titik(g, cx + i - 7, cy - 3 + j, W.hantu);
        });
    }
}

function gerbangSurga(g, cx, cy, buka, f) {
    // Awan di kaki gerbang.
    for (const [dx, r] of [[-20, 4], [-12, 5], [-3, 6], [7, 5], [16, 5], [22, 3]]) {
        for (let y = -r; y <= 0; y++) {
            const l = Math.round(Math.sqrt(r * r - y * y));
            kotak(g, cx + dx - l, cy + y, cx + dx + l, cy + y, W.awan);
        }
    }
    // Tiang & lengkung emas.
    kotak(g, cx - 16, cy - 26, cx - 13, cy - 4, W.emas);
    kotak(g, cx + 12, cy - 26, cx + 15, cy - 4, W.emas);
    for (let x = -16; x <= 15; x++) {
        const y = cy - 27 - Math.round(5 * Math.sqrt(Math.max(0, 1 - (x / 16) ** 2)));
        kotak(g, cx + x, y, cx + x, y + 1, W.emas);
    }
    // Cahaya dari dalam saat terbuka.
    if (buka > 0) {
        const lebar = Math.round(12 * buka);
        kotak(g, cx - lebar, cy - 25, cx + lebar - 1, cy - 4, W.cahaya);
    }
    // Daun pintu jeruji bergeser ke samping.
    const geser = Math.round(11 * buka);
    for (const s of [-1, 1]) {
        for (let k = 0; k < 12; k += 2) {
            const x = s < 0 ? cx - 12 + k - geser : cx + k + geser;
            if ((s < 0 && x > cx - 13 && x < cx) || (s > 0 && x >= cx && x < cx + 12))
                kotak(g, x, cy - 24, x, cy - 4, W.emasGelap);
        }
        kotak(g, s < 0 ? cx - 12 - geser : cx + geser, cy - 15, s < 0 ? cx - 1 - geser : cx + 11 + geser, cy - 15, W.emasGelap);
    }
    if (buka >= 1 && f % 4 < 2) {
        for (const [dx, dy] of [[-18, -32], [18, -30], [0, -36]])
            titik(g, cx + dx, cy + dy, W.cahaya);
    }
}

function gerbangNeraka(g, cx, cy, naik, buka, f) {
    const tinggi = Math.round(26 * naik);
    if (tinggi > 0) {
        const atas = cy - tinggi;
        const gb = new Map();
        kotak(gb, cx - 12, cy - 26, cx - 9, cy - 1, W.batuMerah);
        kotak(gb, cx + 8, cy - 26, cx + 11, cy - 1, W.batuMerah);
        kotak(gb, cx - 12, cy - 28, cx + 11, cy - 26, W.batuMerahGelap);
        kotak(gb, cx - 8, cy - 25, cx + 7, cy - 1, buka > 0 ? W.lubang : W.batuMerahGelap);
        if (buka > 0) {
            const l = Math.round(8 * (1 - buka));
            if (l > 0) {
                kotak(gb, cx - 8, cy - 25, cx - 9 + l, cy - 1, W.batuMerahGelap);
                kotak(gb, cx + 8 - l, cy - 25, cx + 7, cy - 1, W.batuMerahGelap);
            }
            // Kilau api di dalam.
            for (let k = 0; k < 4; k++)
                titik(gb, cx - 3 + ((f + k * 3) % 7), cy - 3 - k * 2, k % 2 ? W.api : W.apiMerah);
        }
        for (const [k, w] of gb) {
            if (Number(k.split(',')[1]) >= atas)
                g.set(k, w);
        }
    }
    // Api menari di kaki gerbang.
    for (let i = 0; i < 9; i++) {
        const x = cx - 18 + i * 4 + (i % 2);
        const h = 2 + ((f + i * 5) % 4);
        for (let y = 0; y < h; y++)
            titik(g, x, cy - 1 - y, y === h - 1 ? W.apiKuning : y > 0 ? W.api : W.apiMerah);
    }
}

function wafat(r, f) {
    const g = new Map();
    const neraka = r.tujuan === 'neraka';
    const SELESAI = 114;
    if (f > SELESAI)
        return { badan: null, lepas: null, piksel: [], mata: null, selesai: true };
    if (f === SELESAI)
        return { badan: null, lepas: { vx: 0, vy: 0 }, piksel: [], mata: null, selesai: false };
    // Makam: gundukan sejak 12, batu naik 18-29.
    const ox = Math.round(r.asal.x / P), oy = Math.round(r.asal.y / P);
    const makam = f >= 12 ? pikselMakam(r.namaMemo, Math.min(1, Math.max(0, (f - 17) / 12))) : [];
    let badan = { x: r.asal.x, y: r.asal.y, rz: 0, sy: 1 };
    let ekspresi = null;
    if (f === 0)
        ekspresi = 'tidur';
    else if (f === 6)
        ekspresi = 'error';
    if (f >= 12)
        badan = { ...badan, sy: [0.8, 0.6, 0.4, 0.2, 0.1][f - 12] ?? 0 };
    // Hantu naik dari makam 30-65, bergoyang.
    let hx = 0, hy = null, panik = false;
    if (f >= 30 && f < 66) {
        const k = f - 30;
        hx = Math.round(3 * Math.sin(k / 4));
        hy = -6 - Math.round(k * 44 / 35);
    }
    const GX = 0, GY = -56; // gerbang surga di atas makam
    const NX = 40, NY = 0; // gerbang neraka di samping makam
    if (!neraka && f >= 66) {
        const buka = f < 72 ? 0 : f < 84 ? (f - 72) / 12 : f < 96 ? 1 : f < 108 ? 1 - (f - 96) / 12 : 0;
        gerbangSurga(g, GX, GY, buka, f);
        if (f < 96) {
            const k = Math.min(1, Math.max(0, (f - 84) / 11));
            hx = Math.round((GX - hx) * k + hx);
            hy = Math.round(-50 + (GY - 10 + 50) * k);
        }
    } else if (neraka && f >= 66) {
        const naik = f < 72 ? 0 : Math.min(1, (f - 72) / 12);
        const buka = f < 84 ? 0 : f < 90 ? (f - 84) / 6 : f < 100 ? 1 : f < 108 ? 1 - (f - 100) / 8 : 0;
        gerbangNeraka(g, NX, NY, naik, buka, f);
        panik = true;
        if (f < 100) {
            const k = Math.min(1, Math.max(0, (f - 90) / 9));
            hx = Math.round(hx + (NX - hx) * k);
            hy = Math.round(-50 + (NY - 6 + 50) * k);
        }
        if (f >= 108) {
            for (let i = 0; i < 4; i++)
                kotak(g, NX - 6 + i * 4, NY - 30 - (f - 108) * 2 - i, NX - 5 + i * 4, NY - 29 - (f - 108) * 2 - i, W.asapGelap);
        }
    }
    if (hy !== null && (neraka ? f < 100 : f < 96))
        hantu(g, hx, hy, f, panik);
    // Akhir: badan (tak tampak) dipindah ke atas samping makam, lalu dilepas
    // jadi telur yang jatuh.
    if (f >= SELESAI - 1)
        badan = { x: r.asal.x + 90, y: r.asal.y - 260, rz: 0, sy: 0 };
    return {
        badan, lepas: null, piksel: [...makam.map(([x, y, w]) => [x + ox, y + oy, w]), ...keDaftar(ox, oy, g)],
        mata: null, ekspresi, selesai: false,
    };
}

export const PERAWATAN = ['mandi', 'cebok', 'tidur'];

// Rencana perawatan (atau 'bintang') di tempat Memo berdiri sekarang.
export function rencanaPerawatan(nama, posisi, opsi = {}) {
    if (!PERAWATAN.includes(nama) && nama !== 'bintang' && nama !== 'wafat')
        return null;
    return { jenis: 'atraksi', nama, asal: { x: posisi.x, y: posisi.y }, x: posisi.x, y: posisi.y, jendelaId: null, ...opsi };
}

// --- Rencana & bingkai ----------------------------------------------------

const PENGGAMBAR = { ayunan, gelantungan, terjun, mobil, mandi, cebok, tidur, bintang, wafat };

export function bingkai(r, f) {
    return PENGGAMBAR[r.nama](r, f);
}

// Jumlah bingkai sampai selesai (untuk tes & batas aman).
export function lamaAtraksi(r) {
    switch (r.nama) {
    case 'ayunan':
        return AY.turun + 6 + AY.ayun + AY.naik;
    case 'gelantungan':
        return 6 + GANTUNG + 1;
    case 'terjun':
        return 7 + terjunTurun(r) + 6;
    case 'mandi':
        return 35;
    case 'cebok':
        return 29;
    case 'tidur':
        return 6 + (r.lamaTidur ?? 720) + 7;
    case 'bintang':
        return 49;
    case 'wafat':
        return 115;
    default:
        return 6 + mobilJalan(r) + 6;
    }
}

// Kotak (piksel logis) bebas dari jendela aktif & lingkar kursor, di dalam
// area kerja.
export function kotakBebas(peta, x1, y1, x2, y2) {
    const A = peta.areaKerja;
    if (x1 < A.x || x2 > A.x + A.lebar || y1 < A.y || y2 > A.y + A.tinggi)
        return false;
    if (peta.larangan.kotak.some(k => x1 < k.x + k.lebar && x2 > k.x && y1 < k.y + k.tinggi && y2 > k.y))
        return false;
    const c = peta.larangan.kursor;
    return Math.hypot(Math.max(x1 - c.x, 0, c.x - x2), Math.max(y1 - c.y, 0, c.y - y2)) >= c.r;
}

// c: { peta, ukuran, posisi, acak, berdiri }. Mengembalikan tujuan
// { jenis: 'atraksi', nama, ... } yang muat di layar sekarang, atau null.
export function rencanakan(nama, c) {
    const { peta, posisi, acak } = c;
    if (!peta || peta.hanyaTepi || peta.sembunyi)
        return null;
    const A = peta.areaKerja;
    const ay = snapP(A.y);
    const asal = { x: posisi.x, y: posisi.y };
    const arah = acak() < 0.5 ? -1 : 1;
    const xAcak = sisi => snapP(A.x + sisi + acak() * Math.max(0, A.lebar - 2 * sisi));
    switch (nama) {
    case 'ayunan': {
        const L = 40;
        if (A.tinggi < L * P + 220)
            return null;
        for (let n = 0; n < 6; n++) {
            const ax = xAcak(150);
            if (kotakBebas(peta, ax - 140, ay, ax + 140, ay + (L + 2) * P + 6))
                return { jenis: 'atraksi', nama, asal, ax, ay, L, arah, x: ax, y: ay + L * P, jendelaId: null };
        }
        return null;
    }
    case 'gelantungan': {
        const H = 12;
        for (let n = 0; n < 6; n++) {
            const hx = xAcak(90);
            if (kotakBebas(peta, hx - 70, ay, hx + 70, ay + (H + BADAN_T) * P + 8))
                return { jenis: 'atraksi', nama, asal, hx, ay, H, x: hx, y: ay + (H + BADAN_T) * P, jendelaId: null };
        }
        return null;
    }
    case 'terjun': {
        const l = c.ukuran.lebar;
        const lantai = peta.lantai.filter(L => L.y - (ay + 15 * P + KAKI_PAYUNG * P) >= 120)
            .sort(() => acak() - 0.5);
        for (const L of lantai) {
            for (let n = 0; n < 6; n++) {
                const t = titikDi(L, L.x1 + l / 2 + acak() * Math.max(0, L.x2 - L.x1 - l), l);
                const sx = snapP(jepit(t.x + (acak() - 0.5) * 160, A.x + 80, A.x + A.lebar - 80));
                if (bolehDi(peta, t, c.ukuran) && kotakBebas(peta, Math.max(A.x, Math.min(sx, t.x) - 85), ay,
                    Math.min(A.x + A.lebar, Math.max(sx, t.x) + 85), L.y))
                    return { jenis: 'atraksi', nama, asal, sx, tx: t.x, ty: L.y, ay, arah, x: t.x, y: L.y, jendelaId: L.jendelaId };
            }
        }
        return null;
    }
    case 'mobil': {
        if (!c.berdiri)
            return null;
        const L = peta.lantai.find(x => x.y === posisi.y && posisi.x >= x.x1 && posisi.x <= x.x2);
        if (!L)
            return null;
        const kiri = L.x1 + 105, kanan = L.x2 - 105;
        const ke = Math.abs(kanan - posisi.x) >= Math.abs(kiri - posisi.x) ? kanan : kiri;
        if (Math.abs(ke - posisi.x) < 200)
            return null;
        const tujuan = { x: ke, y: L.y, jendelaId: L.jendelaId };
        if (!bolehDi(peta, tujuan, c.ukuran) ||
            !kotakBebas(peta, Math.max(A.x, Math.min(posisi.x, ke) - 105), L.y - 32 * P,
                Math.min(A.x + A.lebar, Math.max(posisi.x, ke) + 105), L.y))
            return null;
        return { jenis: 'atraksi', nama, asal, dari: posisi.x, ke, y: L.y, arah: Math.sign(ke - posisi.x),
            x: ke, jendelaId: L.jendelaId };
    }
    default:
        return null;
    }
}

// Atraksi acak yang muat; `hindari` (atraksi terakhir) dicoba paling akhir.
export function rencanaAtraksi(c, hindari = null) {
    const urut = [...ATRAKSI].sort(() => c.acak() - 0.5).sort((a, b) => (a === hindari) - (b === hindari));
    for (const nama of urut) {
        const r = rencanakan(nama, c);
        if (r)
            return r;
    }
    return null;
}
