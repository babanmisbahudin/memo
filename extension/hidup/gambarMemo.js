// Penggambar Memo dengan Cairo, satu sumber untuk panggung di panel
// (panel.js), telur/kotoran/makanan di desktop (memoHidup.js), dan galeri
// pratinjau (pratinjau/render.js). Murni Cairo: tanpa St/Clutter.
//
// Badan = pil 120 x 72 berwarna avatar, wajah face.js x2,6, rupa.js di
// atasnya, noda bila kotor. Kaki di (x, y); semua satuan piksel logis
// sebelum `ukuran`.

import { drawFace, resolveExpression } from '../face.js';
import { P } from './atraksi.js';
import { WARNA_BADAN } from './hayat.js';
import { pikselRupa } from './rupa.js';

export const hexRgb = h => h.match(/\w\w/g).map(x => parseInt(x, 16) / 255);

function pil(cr, dx, dy) {
    const r = 30;
    cr.newPath();
    cr.arc(dx + r, dy + r, r, Math.PI / 2, 3 * Math.PI / 2);
    cr.arc(dx + 120 - r, dy + r, r, -Math.PI / 2, Math.PI / 2);
    cr.closePath();
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
    gaze = [0, 0], kotor = 0, t = 0, kelamin = null, tahap = 'dewasa', opacity = 1 } = {}) {
    const w = WARNA_BADAN[warna] ?? WARNA_BADAN.hitam;
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
    pil(cr, 0, 4);
    cr.fill();
    cr.setSourceRGB(...hexRgb(w.badan));
    pil(cr, 0, 0);
    cr.fill();
    cr.save();
    cr.translate(60 - 22 * 2.6, 36 - 13 * 2.6);
    cr.scale(2.6, 2.6);
    const p = { ...(resolveExpression(ekspresi) ?? resolveExpression('netral')), mata, warnaMata: w.mata };
    p.gazeX += gaze[0];
    p.gazeY += gaze[1];
    drawFace(cr, 44, 26, p);
    cr.restore();
    if (kotor >= 0.3)
        gambarNoda(cr, kotor, t);
    gambarRupa(cr, { kelamin, tahap, warna });
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
    const bintik = hexRgb((WARNA_BADAN[warna] ?? WARNA_BADAN.hitam).badan);
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
