// Animasi & teks layar kunci Memo, di atas latar latar-<bagian>.png. Murni
// (tanpa St/Clutter): extension.js tinggal memasang titik-titiknya sebagai
// aktor kecil.
//
// Koordinat dalam petak latar: gambar 1920x1080 = 192x108 petak 10 px
// (petak yang sama dengan adegan sambutan), jadi titik animasi jatuh tepat di
// kisi piksel latarnya. Semua melangkah per bingkai 12 fps (FPS_PIKSEL).

export const KOLOM = 192;
export const BARIS = 108;

// Warna teks jam & tanggal, dan pendarnya, menurut bagian hari (selaras
// warna cahaya langit di sambutan/layar.js).
export const WARNA_BAGIAN = {
    pagi: { teks: [255, 215, 160], cahaya: [255, 170, 90] },
    siang: { teks: [207, 230, 255], cahaya: [110, 170, 240] },
    sore: { teks: [255, 192, 176], cahaya: [255, 120, 90] },
    malam: { teks: [216, 204, 255], cahaya: [150, 120, 255] },
};

// Banyak bintang berkelip, burung lewat, dan jeda bintang jatuh (bingkai).
const ISI = {
    pagi: { bintang: 6, burung: 2, meteor: 0 },
    siang: { bintang: 0, burung: 3, meteor: 0 },
    sore: { bintang: 12, burung: 0, meteor: 150 },
    malam: { bintang: 26, burung: 0, meteor: 90 },
};

// Daerah yang dibiarkan tenang: Memo (seperempat atas, tengah) dan kolom
// jam/kartu sandi (sepertiga tengah).
const TENANG = [[60, 6, 132, 36], [64, 34, 128, 92]];
const diTenang = (x, y) => TENANG.some(([x1, y1, x2, y2]) => x >= x1 && x <= x2 && y >= y1 && y <= y2);

function acak(benih) {
    let s = benih >>> 0;
    return () => {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Kepak burung: sayap naik / turun, 5x3 petak.
const BURUNG = [
    ['X...X', '.X.X.', '..X..'],
    ['.....', 'XX.XX', '..X..'],
];

export class AnimasiKunci {
    constructor(bagian, benih = 20261019) {
        this.bagian = ISI[bagian] ? bagian : 'malam';
        this.isi = ISI[this.bagian];
        this.benih = benih;
        const r = acak(benih);
        this.bintang = [];
        while (this.bintang.length < this.isi.bintang) {
            const x = 2 + Math.floor(r() * (KOLOM - 4));
            const y = 2 + Math.floor(r() * 64);
            if (diTenang(x, y))
                continue;
            this.bintang.push({ x, y, periode: 24 + Math.floor(r() * 40), fase: Math.floor(r() * 64), besar: r() < 0.3 });
        }
    }

    // Titik pada bingkai f: [x, y, jenis, kuat] — jenis 'bintang' | 'meteor'
    // | 'burung', kuat 1..3 (tiga tingkat terang, bukan transparansi halus).
    titik(f) {
        const hasil = [];
        for (const b of this.bintang)
            this._bintang(hasil, b, f);
        for (let i = 0; i < this.isi.burung; i++)
            this._burung(hasil, i, f);
        if (this.isi.meteor)
            this._meteor(hasil, f);
        return hasil.filter(([x, y]) => x >= 0 && x < KOLOM && y >= 0 && y < BARIS);
    }

    _bintang(hasil, b, f) {
        // Segitiga 0..3..0 sepanjang periode, melangkah per tingkat.
        const k = ((f + b.fase) % b.periode) / b.periode;
        const kuat = Math.round(3 * (1 - Math.abs(2 * k - 1)));
        if (kuat === 0)
            return;
        hasil.push([b.x, b.y, 'bintang', kuat]);
        if (b.besar && kuat === 3) {
            for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]])
                hasil.push([b.x + dx, b.y + dy, 'bintang', 1]);
        }
    }

    // Burung terbang ke kanan, satu petak tiap 2 bingkai; tiap burung punya
    // jalur sendiri dan muncul lagi dari kiri sesudah keluar layar.
    _burung(hasil, i, f) {
        const panjang = KOLOM + 40;
        const x = Math.floor((f / 2 + i * 23 + (this.benih % 50)) % panjang) - 20;
        const y = 40 + i * 5 + (Math.floor(f / 12 + i) % 2);
        const bentuk = BURUNG[Math.floor(f / 3 + i) % 2];
        bentuk.forEach((baris, dy) => {
            [...baris].forEach((c, dx) => {
                if (c === 'X')
                    hasil.push([x + dx, y + dy, 'burung', 3]);
            });
        });
    }

    // Bintang jatuh: tiap `meteor` bingkai satu kali, 10 bingkai, meluncur
    // ke kiri bawah dengan ekor yang meredup.
    _meteor(hasil, f) {
        const jeda = this.isi.meteor;
        const ke = Math.floor(f / jeda);
        const k = f % jeda;
        if (k >= 10)
            return;
        const r = acak(this.benih + ke * 7919);
        const x0 = 120 + Math.floor(r() * 66);
        const y0 = 2 + Math.floor(r() * 14);
        for (let e = 0; e < 5; e++) {
            const j = k - e;
            if (j < 0)
                break;
            hasil.push([x0 - 2 * j, y0 + j, 'meteor', e === 0 ? 3 : e < 3 ? 2 : 1]);
        }
    }
}

const HARI = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];
const BULAN = ['januari', 'februari', 'maret', 'april', 'mei', 'juni', 'juli', 'agustus',
    'september', 'oktober', 'november', 'desember'];

// "minggu, 19 oktober" — Memo berbahasa Indonesia walau sistemnya Inggris.
export function tanggalKunci(d) {
    return `${HARI[d.getDay()]}, ${d.getDate()} ${BULAN[d.getMonth()]}`;
}
