// Rupa Memo menurut tahap umur & jenis kelamin (tahap 3 desain siklus
// hidup): aksesori pixel-art di atas badan. Murni, tanpa St/Clutter —
// dipakai memoHidup.js (kanvas di atas badan) dan pratinjau/render.js.
//
// Koordinat: kisi P = 3 px, (0, 0) = pojok kiri atas badan 40 x 24 petak
// (UKURAN 120 x 72). Mata kiri ±kolom 11-16, kanan 24-29, baris 10-14.
// Boleh menjulur keluar badan: baris -6..29, kolom -4..44.
//
//   laki-laki  topi    perempuan  pita     (belum dipilih: tanpa aksesori)
//   bayi       empeng  remaja     headphone
//   tua        alis putih + janggut (laki-laki) / kacamata (perempuan) + tongkat

export const RUPA_BARIS = [-6, 29];
export const RUPA_KOLOM = [-4, 44];

const W = {
    topi: [225, 60, 60], topiTerang: [255, 120, 110], topiBiru: [70, 120, 230], topiBiruTerang: [120, 165, 255], pita: [255, 90, 140], pitaGelap: [200, 50, 100],
    empeng: [120, 200, 255], empengPutih: [245, 248, 255],
    headphone: [70, 72, 82], headphoneTerang: [130, 134, 148],
    alis: [235, 235, 230], janggut: [240, 240, 235], kacamata: [200, 170, 90],
    tongkat: [140, 95, 55], tongkatTerang: [185, 135, 85],
};

function kotak(daftar, x1, y1, x2, y2, w) {
    for (let y = y1; y <= y2; y++) {
        for (let x = x1; x <= x2; x++)
            daftar.set(`${x},${y}`, [x, y, w]);
    }
}

// Piksel aksesori untuk { kelamin, tahap, warna } (warna badan: pita di
// badan pink jadi merah supaya tetap terlihat).
export function pikselRupa({ kelamin = null, tahap = 'dewasa', warna = 'hitam' } = {}) {
    const g = new Map();
    if (tahap === 'telur')
        return [];
    if (kelamin === 'laki-laki') {
        // Topi: mahkota membulat di kiri atas, lidah topi ke kanan. Merah,
        // kecuali di badan pink/kuning (biru supaya kontras).
        const [t, tt] = ['pink', 'kuning'].includes(warna) ? [W.topiBiru, W.topiBiruTerang] : [W.topi, W.topiTerang];
        kotak(g, 11, -4, 22, -4, t);
        kotak(g, 9, -3, 24, -1, t);
        kotak(g, 12, -3, 20, -3, tt);
        kotak(g, 24, -1, 31, -1, t);
        kotak(g, 16, -5, 17, -5, tt);
    } else if (kelamin === 'perempuan') {
        // Pita di kanan atas: dua sayap + simpul.
        const p = warna === 'pink' ? W.pitaGelap : W.pita;
        kotak(g, 26, -4, 29, -1, p);
        kotak(g, 33, -4, 36, -1, p);
        kotak(g, 27, -5, 28, -5, p);
        kotak(g, 34, -5, 35, -5, p);
        kotak(g, 30, -3, 32, -2, W.pitaGelap);
    }
    if (tahap === 'bayi') {
        // Empeng di bawah mata.
        kotak(g, 18, 17, 21, 19, W.empeng);
        kotak(g, 19, 18, 20, 18, W.empengPutih);
    } else if (tahap === 'remaja') {
        // Headphone: bando melengkung + dua bantalan di sisi.
        kotak(g, 6, -2, 33, -2, W.headphone);
        kotak(g, 4, -1, 5, 1, W.headphone);
        kotak(g, 34, -1, 35, 1, W.headphone);
        kotak(g, -2, 7, 1, 14, W.headphone);
        kotak(g, 38, 7, 41, 14, W.headphone);
        kotak(g, -1, 8, 0, 13, W.headphoneTerang);
        kotak(g, 39, 8, 40, 13, W.headphoneTerang);
    } else if (tahap === 'tua') {
        // Alis putih tebal di atas mata.
        kotak(g, 10, 7, 16, 8, W.alis);
        kotak(g, 23, 7, 29, 8, W.alis);
        if (kelamin === 'perempuan') {
            // Kacamata bulat: bingkai di sekeliling mata + jembatan.
            for (const x0 of [9, 22]) {
                kotak(g, x0 + 1, 9, x0 + 7, 9, W.kacamata);
                kotak(g, x0 + 1, 16, x0 + 7, 16, W.kacamata);
                kotak(g, x0, 10, x0, 15, W.kacamata);
                kotak(g, x0 + 8, 10, x0 + 8, 15, W.kacamata);
            }
            kotak(g, 18, 11, 21, 11, W.kacamata);
        } else {
            // Janggut & kumis putih bergerigi di bawah mata.
            kotak(g, 14, 16, 25, 17, W.janggut);
            kotak(g, 13, 18, 26, 19, W.janggut);
            for (let x = 13; x <= 25; x += 3)
                kotak(g, x, 20, x + 1, 21, W.janggut);
        }
        // Tongkat di samping kanan, kaitnya di atas.
        kotak(g, 43, 9, 43, 23, W.tongkat);
        kotak(g, 42, 7, 44, 7, W.tongkatTerang);
        kotak(g, 41, 8, 41, 9, W.tongkatTerang);
    }
    return [...g.values()];
}
