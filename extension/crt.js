// Gaya CRT Memo: layar retro kecil — sudut bertangga piksel, scanline tipis,
// pendar fosfor berwarna menurut keadaan — dan teks huruf piksel bercahaya.
// Murni Cairo (tanpa St/Clutter/Meta): dipakai island & panel lewat
// widgetCrt.js, dan diuji di luar GNOME.

import { HURUF, lebarTeks, tulisTeks } from './hurufPiksel.js';

// Hitam fosfor, sedikit kebiruan seperti tabung yang mati.
export const LATAR = [5, 6, 8];

export const WARNA_KEADAAN = {
    diam: [126, 231, 135],
    kerja: [88, 166, 255],
    izin: [240, 180, 41],
    galat: [248, 81, 73],
};

// Warna fosfor dari rona wardrobe (0-360): terang & agak pucat supaya
// menyala di atas hitam. Rona 120 (bawaan) = hijau fosfor.
export function warnaHue(h) {
    const s = 0.7, l = 0.7;
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
    const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
        : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return [r, g, b].map(v => Math.round((v + m) * 255));
}

// Jalur persegi panjang l×t dengan sudut bertangga: `atas`/`bawah` anak
// tangga selebar & setinggi `s` px. Disusun dari pita-pita persegi panjang,
// jadi tetap tajam di skala layar berapa pun.
export function jalurTangga(cr, l, t, { s = 2, atas = 0, bawah = 4 } = {}) {
    cr.rectangle(0, atas * s, l, t - (atas + bawah) * s);
    for (let k = 0; k < atas; k++) {
        const sisip = (atas - k) * s;
        cr.rectangle(sisip, k * s, l - 2 * sisip, s);
    }
    for (let k = 0; k < bawah; k++) {
        const sisip = (bawah - k) * s;
        cr.rectangle(sisip, t - (k + 1) * s, l - 2 * sisip, s);
    }
}

// Latar CRT selebar l×t. `sapuan` (0..1 atau null): posisi garis terang yang
// menyapu turun saat agen bekerja. `denyut` (0..1) menebalkan pendar (izin).
export function gambarCrt(cr, l, t, { warna = WARNA_KEADAAN.diam, s = 2, atas = 0, bawah = 4,
    pendar = 0.22, sapuan = null, denyut = 0 } = {}) {
    cr.save();
    jalurTangga(cr, l, t, { s, atas, bawah });
    cr.clip();
    cr.setSourceRGB(...LATAR.map(v => v / 255));
    cr.paint();

    // Pendar dalam: bingkai-bingkai berundak ke dalam, makin ke tengah makin tipis.
    const [r, g, b] = warna.map(v => v / 255);
    const lapis = 6, kuat = pendar * (1 + denyut);
    for (let k = 0; k < lapis; k++) {
        cr.setSourceRGBA(r, g, b, kuat * (1 - k / lapis) * 0.5);
        const d = k * s;
        cr.rectangle(d, d, l - 2 * d, s);
        cr.rectangle(d, t - d - s, l - 2 * d, s);
        cr.rectangle(d, d + s, s, t - 2 * d - 2 * s);
        cr.rectangle(l - d - s, d + s, s, t - 2 * d - 2 * s);
        cr.fill();
    }
    if (sapuan !== null) {
        cr.setSourceRGBA(r, g, b, 0.14);
        cr.rectangle(0, Math.round(sapuan * t / s) * s - s, l, 2 * s);
        cr.fill();
    }
    // Scanline: garis tipis tiap 2s px.
    cr.setSourceRGBA(1, 1, 1, 0.035);
    for (let y = 0; y < t; y += 2 * s)
        cr.rectangle(0, y, l, s / 2);
    cr.fill();
    cr.restore();
}

// Teks huruf piksel bercahaya: salinan tembus pandang bergeser satu satuan
// ke empat arah (pendar fosfor), lalu teksnya sendiri. Warna 0-255.
export function tulisBercahaya(cr, teks, x, y, u, warna, { cahaya = 0.35 } = {}) {
    const [r, g, b] = warna;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]])
        tulisTeks(cr, teks, x + dx * u, y + dy * u, u, [r, g, b, cahaya * 0.35]);
    tulisTeks(cr, teks, x, y, u, [r, g, b, 1]);
}

const GANTI = {
    '—': '-', '–': '-', '−': '-', '…': '...', '“': '"', '”': '"', '„': '"', '‘': "'", '’': "'",
    '×': 'x', '•': '·', ' ': ' ', '\t': ' ',
    // Jam GNOME: rasio U+2236 sebagai titik dua, spasi tipis sebelum AM/PM.
    '∶': ':', '\u2009': ' ', '\u202f': ' ',
};

// Teks siap ditulis huruf piksel (aksen dibuang, tanda baca tipografis
// disederhanakan), atau null bila ada huruf yang tidak dikenal — pemanggil
// lalu memakai huruf biasa, bukan tanda tanya.
export function normalkan(teks) {
    let hasil = '';
    for (const c of String(teks ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')) {
        const g = GANTI[c] ?? c;
        for (const h of g) {
            if (!HURUF[h])
                return null;
        }
        hasil += g;
    }
    return hasil;
}

// Potong supaya muat `lebarMaks` piksel, diakhiri '...'.
export function muatkan(teks, u, lebarMaks) {
    if (lebarTeks(teks, u) <= lebarMaks)
        return teks;
    const huruf = [...teks];
    while (huruf.length && lebarTeks(`${huruf.join('')}...`, u) > lebarMaks)
        huruf.pop();
    return `${huruf.join('').trimEnd()}...`;
}
