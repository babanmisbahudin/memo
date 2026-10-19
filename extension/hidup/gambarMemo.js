// Penggambar Memo dengan Cairo, satu sumber untuk panggung di panel
// (panel.js), telur/kotoran/makanan di desktop (memoHidup.js), dan galeri
// pratinjau (pratinjau/render.js). Murni Cairo: tanpa St/Clutter.
//
// Badan = pil 120 x 72 berwarna avatar, wajah face.js x2,6, rupa.js di
// atasnya, noda bila kotor. Kaki di (x, y); semua satuan piksel logis
// sebelum `ukuran`.

import { drawFace, resolveExpression } from '../face.js';
import { P } from './atraksi.js';
import { WARNA, warnaMataDipakai } from './studio.js';
import { pikselRupa } from './rupa.js';

export const hexRgb = h => h.match(/\w\w/g).map(x => parseInt(x, 16) / 255);

// Jalur badan dalam kotak 120 x 72 (semua subjalur searah jarum jam, supaya
// gabungannya terisi penuh dengan aturan nonzero).
export function jalurBadan(cr, bentuk = 'pil', dx = 0, dy = 0) {
    cr.newPath();
    const lingkaran = (x, y, r) => {
        cr.newSubPath();
        cr.arc(dx + x, dy + y, r, 0, 2 * Math.PI);
    };
    const segi = titik => {
        cr.newSubPath();
        cr.moveTo(dx + titik[0][0], dy + titik[0][1]);
        for (const [x, y] of titik.slice(1))
            cr.lineTo(dx + x, dy + y);
        cr.closePath();
    };
    const kapsul = (r, x1 = 0, y1 = 0, x2 = 120, y2 = 72) => {
        cr.newSubPath();
        cr.arc(dx + x1 + r, dy + y1 + r, r, Math.PI, 1.5 * Math.PI);
        cr.arc(dx + x2 - r, dy + y1 + r, r, 1.5 * Math.PI, 2 * Math.PI);
        cr.arc(dx + x2 - r, dy + y2 - r, r, 0, 0.5 * Math.PI);
        cr.arc(dx + x1 + r, dy + y2 - r, r, 0.5 * Math.PI, Math.PI);
        cr.closePath();
    };
    switch (bentuk) {
    case 'bulat':
        lingkaran(60, 36, 36);
        break;
    case 'kotak':
        kapsul(14);
        break;
    case 'tetes':
        lingkaran(60, 44, 28);
        segi([[60, 0], [84, 30], [36, 30]]);
        break;
    case 'awan':
        lingkaran(32, 44, 26);
        lingkaran(60, 30, 30);
        lingkaran(90, 44, 26);
        kapsul(12, 8, 40, 112, 72);
        break;
    case 'kucing':
        kapsul(30);
        segi([[10, 14], [20, -16], [48, 4]]);
        segi([[72, 4], [100, -16], [110, 14]]);
        break;
    default:
        kapsul(30);
    }
}

const gelapkan = (rgb, k) => rgb.map(v => v * (1 - k));
const terangkan = (rgb, k) => rgb.map(v => v + (1 - v) * k);

// Pola di dalam badan (dipotong jalur badan).
function gambarPola(cr, pola, rgb, bentuk) {
    if (!pola || pola === 'polos')
        return;
    cr.save();
    jalurBadan(cr, bentuk);
    cr.clip();
    const lain = rgb[0] + rgb[1] + rgb[2] < 0.6 ? terangkan(rgb, 0.18) : gelapkan(rgb, 0.22);
    cr.setSourceRGB(...lain);
    if (pola === 'belang') {
        for (let y = 6; y < 80; y += 14)
            cr.rectangle(0, y, 120, 5);
        cr.fill();
    } else if (pola === 'totol') {
        for (const [x, y, r] of [[18, 20, 6], [100, 16, 5], [28, 58, 5], [94, 56, 7], [62, 64, 4], [8, 42, 4], [112, 40, 4]]) {
            cr.newSubPath();
            cr.arc(x, y, r, 0, 2 * Math.PI);
        }
        cr.fill();
    } else if (pola === 'gradasi') {
        // Dither Bayer 2x2 makin rapat ke bawah (gaya piksel, tanpa alpha).
        for (let y = 30; y < 74; y += P) {
            const rapat = (y - 30) / 44;
            for (let x = 0; x < 120; x += P) {
                const ambang = [[0, 0.5], [0.75, 0.25]][(y / P) % 2][(x / P) % 2];
                if (rapat > ambang)
                    cr.rectangle(x, y, P, P);
            }
        }
        cr.fill();
    } else if (pola === 'bintang') {
        cr.setSourceRGBA(1, 0.95, 0.7, 0.85);
        for (const [x, y] of [[16, 18], [102, 22], [24, 56], [96, 58], [60, 8], [8, 38], [112, 44]]) {
            cr.rectangle(x - P, y, 3 * P, P);
            cr.rectangle(x, y - P, P, 3 * P);
        }
        cr.fill();
    }
    cr.restore();
}

export function gambarNoda(cr, kotor, t = 0) {
    const tempat = [[8, 52], [22, 60], [96, 56], [108, 44], [14, 34], [102, 26], [40, 62], [80, 62], [6, 18], [112, 14]];
    const n = Math.min(tempat.length, Math.max(1, Math.round((kotor - 0.2) * 12)));
    cr.setSourceRGBA(0.45, 0.3, 0.16, 0.9);
    for (const [x, y] of tempat.slice(0, n)) {
        cr.rectangle(x, y, 3 * P, 2 * P);
        cr.rectangle(x + P, y + 2 * P, P, P);
        cr.fill();
    }
    if (kotor >= 0.85) {
        for (let i = 0; i < 2; i++) {
            const x = Math.round((60 + 46 * Math.cos(t * 2.3 + i * 3)) / P) * P;
            const y = Math.round((12 + 8 * Math.sin(t * 3.1 + i)) / P) * P;
            // Lalat abu-abu terang supaya tampak di badan gelap.
            cr.setSourceRGB(0.62, 0.64, 0.6);
            cr.rectangle(x, y, 2 * P, P);
            cr.fill();
            cr.setSourceRGBA(0.92, 0.95, 1, 0.95);
            cr.rectangle(x + (Math.floor(t * 12) % 2 ? -P : P), y - P, P, P);
            cr.fill();
        }
    }
}

export function gambarRupa(cr, opsi, ox = 0, oy = 0) {
    for (const [x, y, [r, g, b]] of pikselRupa(opsi)) {
        cr.setSourceRGB(r / 255, g / 255, b / 255);
        cr.rectangle(ox + x * P, oy + y * P, P, P);
        cr.fill();
    }
}

// Badan Memo lengkap, kaki di (x, y).
export function gambarMemo(cr, x, y, { warna = 'hitam', mata = 'kotak', ekspresi = 'netral', ukuran = 1, rz = 0, sy = 1,
    gaze = [0, 0], kotor = 0, t = 0, kelamin = null, tahap = 'dewasa', opacity = 1,
    bentuk = 'pil', pola = 'polos', warnaMata = 'otomatis', mulut = 'tanpa', pipi = 'tanpa', kepala = 'bawaan', ekstra = 'tanpa' } = {}) {
    const w = WARNA[warna] ?? WARNA.hitam;
    if (ukuran * sy < 0.01 || opacity <= 0)
        return; // tenggelam penuh saat menyelinap
    if (opacity < 1)
        cr.pushGroup();
    cr.save();
    cr.translate(x, y);
    cr.rotate(rz * Math.PI / 180);
    cr.scale(ukuran, ukuran * sy);
    cr.translate(-60, -72);
    cr.setSourceRGBA(0, 0, 0, 0.3);
    jalurBadan(cr, bentuk, 0, 4);
    cr.fill();
    cr.setSourceRGB(...hexRgb(w.badan));
    jalurBadan(cr, bentuk);
    cr.fill();
    gambarPola(cr, pola, hexRgb(w.badan), bentuk);
    cr.save();
    cr.translate(60 - 22 * 2.6, 36 - 13 * 2.6);
    cr.scale(2.6, 2.6);
    const p = { ...(resolveExpression(ekspresi) ?? resolveExpression('netral')), mata, mulut, pipi,
        warnaMata: warnaMataDipakai({ warna, warnaMata }) };
    p.gazeX += gaze[0];
    p.gazeY += gaze[1];
    drawFace(cr, 44, 26, p);
    cr.restore();
    if (kotor >= 0.3)
        gambarNoda(cr, kotor, t);
    gambarRupa(cr, { kelamin, tahap, warna, kepala, ekstra });
    cr.restore();
    if (opacity < 1) {
        cr.popGroupToSource();
        cr.paintWithAlpha(opacity);
    }
}

// Kotak-kotak pixel-art dari daftar [gx, gy, [r, g, b]] (kisi P).
export function gambarPiksel(cr, daftar) {
    for (const [gx, gy, [r, g, b]] of daftar) {
        cr.setSourceRGB(r / 255, g / 255, b / 255);
        cr.rectangle(gx * P, gy * P, P, P);
        cr.fill();
    }
}

function sprite(cr, x, y, pola, warna) {
    pola.forEach((baris, j) => [...baris].forEach((c, i) => {
        if (c !== '#')
            return;
        cr.setSourceRGB(...warna(i, j));
        cr.rectangle(x + i * P, y + j * P, P, P);
        cr.fill();
    }));
}

// Gumpal kotoran 8 x 7 petak, alas di (x, y).
export const KOTORAN_L = 8 * P;
export const KOTORAN_T = 7 * P;
export function gambarKotoran(cr, x, y) {
    sprite(cr, x - 4 * P, y - 7 * P, ['...#....', '..##....', '.####...', '.#####..', '######..', '#######.', '.######.'],
        (i, j) => ((i + j) % 3 === 0 ? [0.55, 0.36, 0.2] : [0.42, 0.26, 0.13]));
}

const MAKANAN = {
    nasi: [['.####.', '######', '#....#', '.####.'], [[250, 250, 245], [160, 110, 70]]],
    kue: [['..#...', '.####.', '######', '######'], [[255, 140, 180], [200, 140, 80]]],
    buah: [['...#..', '.####.', '######', '.####.'], [[110, 200, 90], [235, 70, 70]]],
};
export const MAKANAN_L = 6 * P;
export const MAKANAN_T = 4 * P;

// Makanan 6 x 4 petak, pojok kiri atas di (x, y).
export function gambarMakanan(cr, x, y, jenis) {
    const [pola, w] = MAKANAN[jenis] ?? MAKANAN.nasi;
    sprite(cr, x, y, pola, (i, j) => w[j === 0 ? 0 : 1].map(v => v / 255));
}

// Telur 18 x 22 petak, alas tengah di (x, y); `retak` 0..4.
export const TELUR_L = 18 * P;
export const TELUR_T = 22 * P;
export function gambarTelur(cr, x, y, warna, retak = 0, rz = 0) {
    const bintik = hexRgb((WARNA[warna] ?? WARNA.hitam).badan);
    cr.save();
    cr.translate(x, y);
    cr.rotate(rz * Math.PI / 180);
    cr.translate(-TELUR_L / 2, -TELUR_T);
    for (let j = 0; j < 22; j++) {
        const t = (j - 13) / (j < 13 ? 13 : 9);
        const setengah = Math.floor(8.5 * Math.sqrt(Math.max(0, 1 - t * t)) + 0.3);
        for (let i = 9 - setengah; i < 9 + setengah; i++) {
            const tepi = i === 9 - setengah || i === 8 + setengah;
            const b = !tepi && [[5, 6], [11, 4], [7, 12], [12, 15], [4, 16], [9, 19], [13, 9]].some(([bx, by]) =>
                (i === bx || i === bx + 1) && (j === by || j === by + 1));
            cr.setSourceRGB(...(tepi ? [0.72, 0.68, 0.6] : b ? bintik : [0.96, 0.93, 0.86]));
            cr.rectangle(i * P, j * P, P, P);
            cr.fill();
        }
    }
    const garis = [[4, 9], [5, 10], [6, 9], [7, 10], [8, 9], [9, 10], [10, 9], [11, 10], [12, 9], [13, 10]];
    cr.setSourceRGB(0.25, 0.22, 0.2);
    for (const [i, j] of garis.slice(0, retak * 4)) {
        cr.rectangle(i * P, j * P, P, P);
        cr.fill();
    }
    cr.restore();
}
