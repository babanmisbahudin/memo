// Adegan layar penuh sambutan Memo, digambar seperti game piksel.
//
// Island hitam di tepi atas layar membesar sampai memenuhi layar (Memo ikut
// membesar di dalamnya), lalu menyala jadi adegan: langit ber-dither, bintang
// berkelip, bulan/matahari menurut jam, siluet kota yang lampunya menyala
// atau padam, Memo besar di tengah, dan teks huruf piksel yang diketik.
// Tiap jenis punya penutup sendiri:
//
//   island  mengecil kembali jadi island (login, dan semua yang dibatalkan)
//   iris    lingkaran menutup ke arah Memo, Memo berkedip (logout)
//   crt     layar TV tabung padam: pepat jadi garis, jadi titik (shutdown;
//           restart didahului glitch)
//   larut   melarut ke gelap petak demi petak, mata Memo terakhir (suspend)
//
// Gaya piksel (lihat extension/gerakPola.js): semua melangkah 12 kali per
// detik, posisi dikunci ke petak, putaran per 10 derajat, gradasi memakai
// dither Bayer, bukan transparansi halus.
//
// Murni Cairo + GdkPixbuf, tanpa Gtk: sambutan.js menggambarnya ke
// Gtk.DrawingArea, tes merekamnya bingkai demi bingkai di luar GNOME.

import Cairo from 'cairo';
import GLib from 'gi://GLib';
import Gdk from 'gi://Gdk?version=4.0';
import GdkPixbuf from 'gi://GdkPixbuf';

import { drawFace, lerpParams, resolveExpression } from '../extension/face.js';
import { DASAR, EASE, FPS_PIKSEL, POSE_TIDUR, SPRITE, durasi, poseEmote } from '../extension/gerakPola.js';
import { HURUF, TINGGI_BARIS, lebarTeks, tulisTeks } from './hurufPiksel.js';

export const NAMA_JENIS = ['masuk', 'keluar', 'restart', 'matikan', 'tidur'];
export const MS_LANGKAH = 1000 / FPS_PIKSEL;
const langkahDari = t => Math.floor(t / MS_LANGKAH);

// Lama island membesar memenuhi layar, dalam langkah.
export const PEMBUKA = 8;
const GLITCH = 4;
const LANGKAH_TUTUP = { island: 8, batal: 6, iris: 12, crt: 11, larut: 10 };
const PENUTUP_GELAP = ['iris', 'crt', 'larut'];

// Ukuran island Memo di tepi atas (piksel layar), titik awal & akhir animasi.
const ISLAND = { lebar: 200, tinggi: 32, sudut: 14 };

const WAJAH_L = 44;
const WAJAH_T = 26;
// Wajah dirender sekian kali lebih halus, lalu dicuplik di tengah tiap petak:
// LED mata jadi kotak tajam, bukan abu-abu belang hasil antialias.
const HALUS = 4;

const HITAM = [0, 0, 0];
const PUTIH = [255, 255, 255];
const WARNA_BINTANG = [[66, 68, 92], [150, 155, 190], [255, 255, 255]];
const WARNA_KONFETI = [[255, 213, 74], [255, 126, 182], [126, 231, 135], [150, 210, 255], [210, 168, 255]];
const TEKS_SUB = [176, 179, 192];

const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus',
    'September', 'Oktober', 'November', 'Desember'];

// Langit menurut jam: gradasi dasar (atas, bawah), warna cahaya cakrawala,
// benda langit, awan, kerapatan bintang, dan kegelapan bayangan judul.
const LANGIT = {
    pagi: { dasar: [[14, 20, 52], [72, 52, 94]], warna: [255, 170, 90], benda: 'matahari',
        awan: [178, 142, 180], bintang: 0.15, bayangan: 0.35 },
    siang: { dasar: [[10, 36, 84], [36, 92, 160]], warna: [110, 170, 240], benda: 'matahari',
        awan: [214, 228, 246], bintang: 0, bayangan: 0.3 },
    sore: { dasar: [[22, 14, 48], [110, 44, 86]], warna: [255, 120, 90], benda: 'senja',
        awan: null, bintang: 0.35, bayangan: 0.4 },
    malam: { dasar: [[0, 0, 0], [8, 8, 26]], warna: [130, 110, 255], benda: 'bulan',
        awan: null, bintang: 1, bayangan: 0.55 },
};

export function bagianHari(jam) {
    if (jam >= 4 && jam < 11)
        return 'pagi';
    if (jam >= 11 && jam < 15)
        return 'siang';
    if (jam >= 15 && jam < 18)
        return 'sore';
    return 'malam';
}

export function waktuSekarang() {
    const d = GLib.DateTime.new_now_local();
    return { jam: d.get_hour(), menit: d.get_minute(), hari: d.get_day_of_week() % 7,
        tanggal: d.get_day_of_month(), bulan: d.get_month() };
}

// Tiap jenis: teks, langit, warna cahaya, ekspresi & gerak Memo sepanjang
// waktu (ms sejak tampil), efek, perilaku lampu kota, lama tampil sebelum
// aksi berjalan sendiri, dan penutupnya.
function buatJenis(jenis, waktu) {
    const bagian = bagianHari(waktu.jam);
    const langit = LANGIT[bagian];
    const dua = n => String(n).padStart(2, '0');
    const daftar = {
        masuk: {
            ...langit,
            judul: 'Hallo, Baban!', sub: `Selamat ${bagian}, semoga harimu menyenangkan.`,
            info: `${dua(waktu.jam)}:${dua(waktu.menit)} · ${HARI[waktu.hari]}, ${waktu.tanggal} ${BULAN[waktu.bulan - 1]}`,
            petunjuk: 'klik untuk mulai',
            ekspresi: [[0, 'tidur'], [800, 'senang']],
            gerak: [[700, 'bangun'], [1500, 'sapa'], [2600, 'lompat'], [3400, 'kedip']],
            efek: [['konfeti', 1500, 30], ['konfeti', 2600, 16]],
            lampu: 'nyala', ombak: true, lama: 4300, penutup: 'island',
        },
        keluar: {
            ...langit, warna: [88, 166, 255],
            judul: 'Sampai nanti, Baban', sub: 'Memo jaga laptopnya. Login lagi ya.',
            ekspresi: [[0, 'logout'], [1000, 'senang']],
            gerak: [[700, 'kaget'], [1100, 'sapa'], [2200, 'angguk'], [2800, 'sapa']],
            efek: [['hati', 1200]],
            lampu: 'tetap', lama: 3500, penutup: 'iris',
        },
        restart: {
            ...langit, warna: [240, 180, 41],
            judul: 'Restart sebentar', sub: 'Memo segera kembali, Baban.',
            ekspresi: [[0, 'restart'], [1200, 'berpikir']],
            gerak: [[700, 'kaget'], [1300, 'oleng'], [2400, 'pusing']],
            efek: [['putaran', 800]],
            lampu: 'kedip', lama: 3500, penutup: 'crt', glitch: true,
        },
        matikan: {
            ...LANGIT.malam, warna: [160, 120, 255],
            judul: 'Selamat istirahat, Baban', sub: 'Memo matikan laptopnya dulu.',
            ekspresi: [[0, 'shutdown'], [1100, 'netral'], [2000, 'tidur']],
            gerak: [[700, 'kaget'], [1300, 'angguk'], [2100, 'angguk']],
            efek: [['z', 2200], ['bintangJatuh', 900]],
            lampu: 'padam', lama: 3900, penutup: 'crt',
        },
        tidur: {
            ...LANGIT.malam, warna: [100, 130, 255], bintang: 0.8,
            judul: 'Tidur sebentar', sub: 'Memo ikut tidur. Bangunkan kapan saja.',
            ekspresi: [[0, 'netral'], [900, 'tidur']],
            gerak: [[700, 'kaget'], [1000, 'angguk']],
            efek: [['z', 1200], ['bintangJatuh', 1000]],
            lampu: 'redup', lama: 2900, penutup: 'larut',
        },
    };
    const J = daftar[jenis];
    if (J)
        J.petunjuk ??= 'Esc batal · klik untuk lanjut';
    return J;
}

// Satu petak adegan = S piksel layar; ±108 petak setinggi layar.
export function ukuranPetak(lebar, tinggi) {
    return Math.max(3, Math.round(Math.min(tinggi, lebar * 0.5625) / 108));
}

const batas = (v, a, b) => Math.min(b, Math.max(a, v));
const redup = (w, k) => w.map(v => Math.round(v * k));
const campur = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
const hexKeRgb = h => {
    const n = parseInt(h.slice(1), 16);
    return [n >> 16 & 255, n >> 8 & 255, n & 255];
};

function matriksBayer(n) {
    if (n === 1)
        return [[0]];
    const h = n / 2;
    const kecil = matriksBayer(h);
    const kuadran = [[0, 2], [3, 1]];
    return Array.from({ length: n }, (_, y) => Array.from({ length: n },
        (__, x) => 4 * kecil[y % h][x % h] + kuadran[Math.floor(y / h)][Math.floor(x / h)]));
}
const BAYER4 = matriksBayer(4).flat();
const BAYER8 = matriksBayer(8).flat();
const ambang = (x, y) => (BAYER4[((y & 3) << 2) | (x & 3)] + 0.5) / 16;

// Acak yang bisa diulang (mulberry32) dan cincang dua bilangan -> [0, 1).
function acak(benih) {
    let a = benih >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), a | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function cincang(a, b) {
    let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
    h ^= h >>> 13;
    h = Math.imul(h, 0x27d4eb2f);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

// Papan piksel: satu sel = satu petak adegan, RGBA, ditempel ke Cairo lewat
// GdkPixbuf lalu diperbesar dengan filter nearest.
class Papan {
    constructor(l, t) {
        this.l = l;
        this.t = t;
        this.data = new Uint8Array(l * t * 4);
    }

    isi([r, g, b], a = 255) {
        const d = this.data;
        for (let i = 0; i < d.length; i += 4) {
            d[i] = r;
            d[i + 1] = g;
            d[i + 2] = b;
            d[i + 3] = a;
        }
    }

    titik(x, y, [r, g, b], a = 255) {
        x = Math.round(x);
        y = Math.round(y);
        if (x < 0 || y < 0 || x >= this.l || y >= this.t)
            return;
        const i = (y * this.l + x) * 4;
        this.data[i] = r;
        this.data[i + 1] = g;
        this.data[i + 2] = b;
        this.data[i + 3] = a;
    }

    kotak(x, y, l, t, w, a = 255) {
        for (let j = 0; j < t; j++)
            for (let i = 0; i < l; i++)
                this.titik(x + i, y + j, w, a);
    }

    bulat(cx, cy, r, w) {
        for (let dy = -r; dy <= r; dy++) {
            const dx = Math.floor(Math.sqrt((r + 0.5) ** 2 - dy * dy));
            this.kotak(cx - dx, cy + dy, 2 * dx + 1, 1, w);
        }
    }

    sprite(baris, x, y, w, s = 1) {
        baris.forEach((isi, j) => [...isi].forEach((c, i) => {
            if (c === '#')
                this.kotak(x + i * s, y + j * s, s, s, w);
        }));
    }

    keSurface() {
        const pb = GdkPixbuf.Pixbuf.new_from_bytes(new GLib.Bytes(this.data), GdkPixbuf.Colorspace.RGB,
            true, 8, this.l, this.t, this.l * 4);
        const s = new Cairo.ImageSurface(Cairo.Format.ARGB32, this.l, this.t);
        const cr = new Cairo.Context(s);
        Gdk.cairo_set_source_pixbuf(cr, pb, 0, 0);
        cr.setOperator(Cairo.Operator.SOURCE);
        cr.paint();
        cr.$dispose();
        return s;
    }
}

function tempelPetak(cr, surface, S, dx = 0, dy = 0) {
    cr.save();
    cr.scale(S, S);
    cr.setSourceSurface(surface, dx, dy);
    cr.getSource().setFilter(Cairo.Filter.NEAREST);
    cr.paint();
    cr.restore();
}

export class Layar {
    // `dari`: Layar lama (ukuran jendela berubah) — keadaan penutupnya dibawa.
    constructor(jenis, { lebar, tinggi, waktu = waktuSekarang(), benih = 20261018, dari = null }) {
        this.jenis = jenis;
        this.J = buatJenis(jenis, waktu);
        if (!this.J)
            throw new Error(`jenis sambutan tidak dikenal: ${jenis}`);
        this.lebar = lebar;
        this.tinggi = tinggi;
        const S = this.S = ukuranPetak(lebar, tinggi);
        this.kol = Math.ceil(lebar / S);
        this.bar = Math.ceil(tinggi / S);
        this.papan = new Papan(this.kol, this.bar);
        this.lapis = new Papan(this.kol, this.bar);
        this.bingkai = new Cairo.ImageSurface(Cairo.Format.ARGB32, lebar, tinggi);

        // Memo: pusat wajah (petak) dan ukuran satu piksel wajah (petak).
        this.mx = Math.round(this.kol / 2);
        this.my = Math.round(this.bar * 0.4);
        const M = this.M = 3;
        // Setengah lebar & tinggi sepasang mata Memo (petak), patokan efek di sekitarnya.
        this.mataL = Math.round(10.7 * M);
        this.mataT = Math.round(3.2 * M);
        this.uJudul = Math.max(2, Math.round(S * 0.6));
        this.uSub = Math.max(2, Math.round(S * 0.375));
        this.uKecil = Math.max(1, Math.round(S * 0.25));
        this.yBatang = Math.round(this.bar * 0.745);

        const w = this.J.warna;
        this.cahaya = [0.08, 0.15, 0.24, 0.36].map(k => redup(w, k));
        const [atas, bawah] = this.J.dasar;
        this.warnaDasar = [0, 1, 2, 3, 4].map(i => campur(atas, bawah, i / 4));

        const r = acak(benih);
        this._siapkanBintang(r);
        this._siapkanKota(r);
        this._siapkanKonfeti(r);
        this._siapkanAwan(r);

        this.tutupPada = dari?.tutupPada ?? null;
        this.cara = dari?.cara ?? null;
        this._ekspresiTutup = dari?._ekspresiTutup ?? [];
        this._gerakTutup = dari?._gerakTutup ?? [];
    }

    // Mulai penutup pada waktu t. lanjut=false (Esc) memakai penutup
    // 'batal', dan boleh menyela penutup lain yang belum selesai.
    tutup(t, lanjut) {
        if (this.tutupPada !== null && (lanjut || this.cara === 'batal' || this.selesai(t)))
            return false;
        this.tutupPada = t;
        this.cara = lanjut ? this.J.penutup : 'batal';
        const k = n => t + n * MS_LANGKAH;
        if (this.cara === 'batal') {
            this._ekspresiTutup = [[t, 'senang']];
            this._gerakTutup = [[t, 'lompat']];
        } else if (this.cara === 'iris') {
            this._gerakTutup = [[k(5), 'kedip']];
        } else if (this.cara === 'island') {
            this._gerakTutup = [[t, 'sapa']];
        } else if (this.cara === 'crt' && this.J.glitch) {
            this._gerakTutup = [[t, 'kaget']];
        }
        return true;
    }

    get langkahTutup() {
        if (this.cara === null)
            return Infinity;
        return LANGKAH_TUTUP[this.cara] + (this.cara === 'crt' && this.J.glitch ? GLITCH : 0);
    }

    // Penutup selesai: sesudah ini layar hitam (gelapAkhir) atau kosong.
    selesai(t) {
        return this.tutupPada !== null && langkahDari(t) - langkahDari(this.tutupPada) >= this.langkahTutup;
    }

    get gelapAkhir() {
        return PENUTUP_GELAP.includes(this.cara);
    }

    gambar(cr, t) {
        const f = langkahDari(t);
        const tq = f * MS_LANGKAH;
        const kT = this.tutupPada === null ? -1 : f - langkahDari(this.tutupPada);
        if (kT >= this.langkahTutup) {
            if (this.gelapAkhir) {
                cr.setSourceRGB(0, 0, 0);
                cr.paint();
            }
            return;
        }
        // Ukuran island (0 = island, 1 = layar penuh): membesar di awal, dan
        // mengecil lagi pada penutup island/batal, dari ukuran saat itu.
        let pulau = Math.min(1, f / PEMBUKA);
        if (kT >= 0 && (this.cara === 'island' || this.cara === 'batal')) {
            pulau = Math.min(1, langkahDari(this.tutupPada) / PEMBUKA) *
                (1 - (kT + 1) / LANGKAH_TUTUP[this.cara]);
        }
        this._susunBingkai(tq, f, pulau);
        if (pulau < 1) {
            this._island(cr, pulau);
            return;
        }
        if (kT < 0) {
            this._tempel(cr);
            return;
        }
        switch (this.cara) {
        case 'iris':
            this._iris(cr, kT);
            break;
        case 'crt':
            if (this.J.glitch && kT < GLITCH)
                this._glitch(cr, kT, f);
            else
                this._crt(cr, kT - (this.J.glitch ? GLITCH : 0));
            break;
        case 'larut':
            this._larut(cr, kT);
            break;
        }
    }

    // --- Penyusunan satu bingkai --------------------------------------------

    _susunBingkai(t, f, pulau) {
        const P = this.papan;
        const J = this.J;
        P.isi(HITAM);
        // Adegan menyala pelan-pelan sesudah island penuh, dan padam lagi
        // saat island mengecil.
        const nyala = batas((f - PEMBUKA + 1) / 6, 0, 1) * batas((pulau - 0.35) / 0.5, 0, 1);
        if (nyala > 0) {
            this._langit(P, f, nyala);
            this._bintang(P, f);
            this._bendaLangit(P, f, nyala);
            if (J.awan && nyala >= 0.7)
                this._awan(P, f);
            for (const [nama, t0] of J.efek) {
                if (nama === 'bintangJatuh')
                    this._bintangJatuh(P, t, t0);
            }
            this._kota(P, t, f, nyala);
            for (const [nama, t0] of J.efek) {
                if (nama === 'hati')
                    this._hati(P, t, t0);
                else if (nama === 'z')
                    this._z(P, t, t0);
                else if (nama === 'putaran')
                    this._putaran(P, t, t0, f);
            }
            this._konfeti(P, t);
            // Login tidak menjalankan aksi apa pun: jam & tanggal di tempat batang.
            if (!J.info)
                this._batang(P, t, f);
        }
        this._memo(P, t, f, pulau);
        const papan = P.keSurface();

        const bc = new Cairo.Context(this.bingkai);
        bc.save();
        bc.setOperator(Cairo.Operator.SOURCE);
        tempelPetak(bc, papan, this.S);
        bc.restore();
        if (pulau > 0.9)
            this._teks(bc, t, f);
        bc.$dispose();
    }

    _tempel(cr) {
        cr.setSourceSurface(this.bingkai, 0, 0);
        cr.getSource().setFilter(Cairo.Filter.NEAREST);
        cr.paint();
    }

    // --- Langit -------------------------------------------------------------

    _langit(P, f, nyala) {
        const { kol, bar, mx, my } = this;
        const pal = this.cahaya, dasar = this.warnaDasar;
        const d = P.data;
        // Gradasi dasar ber-dither + cahaya cakrawala dari bawah tengah +
        // pendar di sekeliling Memo, bernapas pelan (±6% tiap 3 detik).
        // Saat menyala/padam, petak muncul berurutan menurut matriks Bayer.
        const napas = 0.94 + 0.06 * Math.sin(f * 2 * Math.PI / 36);
        const gx = kol / 2, gy = bar * 1.05, rx = kol * 0.6, ry = bar * 0.62;
        const hrx = this.mataL * 1.6, hry = this.mataT * 3;
        for (let y = 0; y < bar; y++) {
            for (let x = 0; x < kol; x++) {
                if (nyala < 1 && BAYER8[((y & 7) << 3) | (x & 7)] / 64 >= nyala)
                    continue;
                const ax = (x - gx) / rx, ay = (y - gy) / ry;
                const hx = (x - mx) / hrx, hy = (y - my) / hry;
                const g = Math.max(1 - Math.sqrt(ax * ax + ay * ay),
                    (1 - Math.sqrt(hx * hx + hy * hy)) * 0.5) * nyala * napas;
                const w = dasar[Math.min(4, Math.floor(y / bar * 4 + ambang(x, y)))];
                const lv = g > 0 ? Math.min(4, Math.floor(g * 4 + ambang(x, y))) : 0;
                const c = lv > 0 ? pal[lv - 1] : HITAM;
                const i = (y * kol + x) * 4;
                d[i] = Math.min(255, w[0] + c[0]);
                d[i + 1] = Math.min(255, w[1] + c[1]);
                d[i + 2] = Math.min(255, w[2] + c[2]);
            }
        }
    }

    _siapkanBintang(r) {
        const n = Math.round(this.kol * this.bar / 150 * this.J.bintang);
        this.bintang = [];
        for (let coba = 0; coba < n * 4 && this.bintang.length < n; coba++) {
            const x = Math.floor(r() * this.kol);
            const y = Math.floor(r() * this.bar * 0.8);
            const dx = (x - this.mx) / (this.mataL * 1.9), dy = (y - this.my) / (this.mataT * 3.6);
            if (dx * dx + dy * dy < 1)
                continue;
            if (y > this.bar * 0.55 && Math.abs(x - this.kol / 2) < this.kol * 0.36)
                continue;
            this.bintang.push({ x, y, periode: 10 + Math.floor(r() * 20), fase: Math.floor(r() * 30),
                plus: r() < 0.18, muncul: PEMBUKA + Math.floor(r() * 14) });
        }
    }

    _bintang(P, f) {
        for (const b of this.bintang) {
            if (f < b.muncul)
                continue;
            const q = ((f + b.fase) % b.periode) / b.periode;
            const lv = Math.min(2, Math.floor((1 - Math.abs(2 * q - 1)) * 3));
            P.titik(b.x, b.y, WARNA_BINTANG[lv]);
            if (b.plus && lv === 2) {
                for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
                    P.titik(b.x + dx, b.y + dy, WARNA_BINTANG[1]);
            }
        }
    }

    _siapkanAwan(r) {
        this.awan = Array.from({ length: 3 }, (_, i) => ({
            x: Math.floor(r() * this.kol), y: Math.round(this.bar * (0.07 + i * 0.065)),
            s: 1 + Math.floor(r() * 2), laju: 3 + Math.floor(r() * 3),
        }));
    }

    _awan(P, f) {
        const w = this.J.awan;
        const bayang = campur(w, this.J.dasar[1], 0.45);
        const rentang = this.kol + 30;
        for (const a of this.awan) {
            const x = ((a.x + Math.floor(f / a.laju)) % rentang + rentang) % rentang - 15;
            const s = a.s;
            // Bentuk yang sama digambar dua kali: bayangan, lalu awan satu petak di atasnya.
            for (const [dy, warna] of [[0, bayang], [-1, w]]) {
                const y = a.y + dy;
                P.bulat(x, y, 2 * s, warna);
                P.bulat(x + 3 * s, y - s, 3 * s, warna);
                P.bulat(x + 6 * s, y, 2 * s, warna);
                P.kotak(x, y, 6 * s, 2 * s + 1, warna);
            }
        }
    }

    _bendaLangit(P, f, nyala) {
        const { kol, bar } = this;
        const benda = this.J.benda;
        const pendar = (cx, cy, r, w, kuat) => {
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    const g = (1 - Math.sqrt(dx * dx + dy * dy) / r) * kuat * nyala;
                    if (g > ambang(cx + dx, cy + dy))
                        P.titik(cx + dx, cy + dy, w);
                }
            }
        };
        if (nyala < 0.5)
            return;
        if (benda === 'bulan') {
            const cx = Math.round(kol * 0.8), cy = Math.round(bar * 0.2);
            const r = Math.max(5, Math.round(bar * 0.08));
            pendar(cx, cy, r * 2 + 2, redup(this.J.warna, 0.2), 0.9);
            const ox = Math.round(r * 0.55), oy = -Math.round(r * 0.3), r2 = r * 0.9;
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    if (dx * dx + dy * dy > (r + 0.5) ** 2)
                        continue;
                    const k = (dx - ox) ** 2 + (dy - oy) ** 2;
                    if (k <= r2 * r2)
                        continue;
                    // Tepi dalam sabit sedikit lebih gelap, plus dua kawah.
                    const tepi = k < (r2 + 1.6) ** 2;
                    P.titik(cx + dx, cy + dy, tepi ? [214, 200, 160] : [246, 236, 196]);
                }
            }
            P.titik(cx - Math.round(r * 0.6), cy + Math.round(r * 0.1), [214, 200, 160]);
            P.titik(cx - Math.round(r * 0.3), cy + Math.round(r * 0.55), [214, 200, 160]);
        } else if (benda === 'matahari') {
            const cx = Math.round(kol * 0.8), cy = Math.round(bar * 0.2);
            const r = Math.max(4, Math.round(bar * 0.055));
            pendar(cx, cy, r * 3, redup(this.J.warna, 0.22), 0.7);
            P.bulat(cx, cy, r, [255, 170, 40]);
            P.bulat(cx, cy, r - 1, [255, 214, 92]);
            const fase = Math.floor(f / 6) % 2;
            for (let k = 0; k < 8; k++) {
                const a = (k * 45 + fase * 22.5) * Math.PI / 180;
                const panjang = k % 2 ? 2 : 3;
                for (let d = r + 2; d < r + 2 + panjang; d++)
                    P.titik(cx + Math.round(Math.cos(a) * d), cy + Math.round(Math.sin(a) * d), [255, 196, 64]);
            }
        } else if (benda === 'senja') {
            // Matahari terbenam bergaris ala synthwave, separuh di balik kota.
            const cx = Math.round(kol * 0.8), cy = Math.round(bar * 0.82);
            const r = Math.max(8, Math.round(bar * 0.12));
            pendar(cx, cy, r * 2, redup(this.J.warna, 0.25), 0.8);
            const geser = Math.floor(f / 2) % 6;
            for (let dy = -r; dy <= r; dy++) {
                if (dy > 0 && ((dy - geser) % 6 + 6) % 6 < 1 + Math.floor(dy * 2 / r))
                    continue;
                const w = campur([255, 222, 100], [255, 78, 140], (dy + r) / (2 * r));
                const dx = Math.floor(Math.sqrt((r + 0.5) ** 2 - dy * dy));
                P.kotak(cx - dx, cy + dy, 2 * dx + 1, 1, w);
            }
        }
    }

    _bintangJatuh(P, t, t0) {
        if (t < t0)
            return;
        const k0 = langkahDari(t - t0);
        const n = Math.floor(k0 / 20), k = k0 % 20;
        if (k > 10)
            return;
        const kepalaX = Math.round(this.kol * (0.06 + 0.45 * cincang(n, 1))) + k * 3;
        const kepalaY = Math.round(this.bar * (0.04 + 0.16 * cincang(n, 2))) + Math.round(k * 1.5);
        const ekor = [PUTIH, [200, 210, 255], [140, 150, 205], [92, 98, 145], [60, 62, 96]];
        for (let s = 14; s >= 0; s--)
            P.titik(kepalaX - s, kepalaY - Math.round(s / 2), ekor[Math.floor(s / 3)]);
    }

    // --- Kota ---------------------------------------------------------------

    _siapkanKota(r) {
        this.gedung = [];
        this.jendela = [];
        this.antena = [];
        // Lapis 0 di belakang (lebih tinggi, lebih terang, tanpa jendela),
        // lapis 1 di depan dengan jendela.
        for (const [lapis, tMin, tMaks] of [[0, 0.08, 0.17], [1, 0.04, 0.12]]) {
            let x = -Math.floor(r() * 4);
            while (x < this.kol) {
                const l = 4 + Math.floor(r() * (lapis ? 9 : 7));
                const t = Math.round(this.bar * (tMin + r() * (tMaks - tMin)));
                const g = { x, l, t, lapis, atap: r() };
                this.gedung.push(g);
                if (lapis === 1) {
                    for (let wx = x + 1; wx < x + l - 1; wx += 2) {
                        for (let wy = this.bar - t + 2; wy < this.bar - 1; wy += 3)
                            this.jendela.push({ x: wx, y: wy, kunci: r(), hangat: r() < 0.8, id: this.jendela.length });
                    }
                }
                if (g.atap > 0.82 && t > 6)
                    this.antena.push({ x: x + Math.floor(l / 2), t, tinggi: 3 + Math.floor(r() * 3), fase: Math.floor(r() * 16) });
                x += l + (r() < 0.3 ? 1 : 0);
            }
        }
    }

    _lampu(j, t, f) {
        const maju = batas((t - 800) / Math.max(1, this.J.lama - 1200), 0, 1);
        switch (this.J.lampu) {
        case 'nyala':
            return j.kunci < 0.12 + 0.43 * maju;
        case 'tetap':
            return (j.kunci < 0.45) !== (cincang(j.id, Math.floor(f / 14)) < 0.05);
        case 'kedip':
            return cincang(j.id, Math.floor(f / 3)) < 0.42;
        case 'padam':
            return j.kunci < 0.55 * (1 - maju);
        case 'redup':
            return j.kunci < 0.04 + 0.32 * (1 - maju);
        }
        return false;
    }

    _kota(P, t, f, nyala) {
        const { bar } = this;
        const w = this.J.warna;
        const warnaGedung = [campur([18, 18, 30], w, 0.1), campur([7, 7, 13], w, 0.045)];
        const kaca = campur(warnaGedung[1], PUTIH, 0.05);
        const hangat = [242, 196, 112], sejuk = [150, 196, 246];
        // Kota tumbuh dari bawah selagi adegan menyala.
        const naik = t2 => Math.round(t2 * nyala);
        for (const g of this.gedung) {
            const t2 = naik(g.t);
            P.kotak(g.x, bar - t2, g.l, t2, warnaGedung[g.lapis]);
            if (g.atap < 0.25 && g.l >= 6)
                P.kotak(g.x + 1, bar - t2 - 2, g.l - 2, 2, warnaGedung[g.lapis]);
        }
        for (const a of this.antena) {
            const atas = bar - naik(a.t) - a.tinggi;
            P.kotak(a.x, atas, 1, a.tinggi, warnaGedung[0]);
            if ((f + a.fase) % 16 < 3)
                P.titik(a.x, atas - 1, [255, 84, 84]);
        }
        if (nyala < 1)
            return;
        for (const j of this.jendela)
            P.titik(j.x, j.y, this._lampu(j, t, f) ? (j.hangat ? hangat : sejuk) : kaca);
    }

    // --- Efek ---------------------------------------------------------------

    _siapkanKonfeti(r) {
        this.konfeti = [];
        for (const [nama, t0, n] of this.J.efek) {
            if (nama !== 'konfeti')
                continue;
            for (let i = 0; i < n; i++) {
                this.konfeti.push({ t0, x: this.mx + (r() - 0.5) * this.mataL * 1.2, y: this.my - this.mataT + r() * 6,
                    vx: (r() - 0.5) * 6, vy: -(2 + r() * 4), w: WARNA_KONFETI[Math.floor(r() * 5)],
                    bintang: r() < 0.25, fase: Math.floor(r() * 4) });
            }
        }
    }

    _konfeti(P, t) {
        for (const c of this.konfeti) {
            if (t < c.t0)
                continue;
            const k = langkahDari(t - c.t0);
            if (k > 26 || (k > 21 && k % 2))
                continue;
            const x = Math.round(c.x + c.vx * k), y = Math.round(c.y + c.vy * k + 0.16 * k * k);
            if (c.bintang)
                P.sprite(SPRITE.bintang.baris, x - 1, y - 1, c.w);
            else if ((k + c.fase) % 4 < 2)
                P.kotak(x, y, 2, 1, c.w);
            else
                P.kotak(x, y, 1, 2, c.w);
        }
    }

    // Hati melayang dari kiri-kanan Memo bergantian, tiap setengah detik.
    _hati(P, t, t0) {
        const k0 = langkahDari(t - t0);
        if (k0 < 0)
            return;
        const warna = hexKeRgb(SPRITE.hati.warna);
        for (let n = Math.max(0, Math.floor((k0 - 18) / 6)); n <= Math.floor(k0 / 6); n++) {
            const k = k0 - n * 6;
            if (k > 17 || k === 13 || k === 15)
                continue;
            const sisi = n % 2 ? 1 : -1;
            const x = this.mx + sisi * (this.mataL + 7 + (n * 5) % 9) + (Math.floor(k / 3) % 2 ? sisi : 0) - 2;
            P.sprite(SPRITE.hati.baris, x, this.my + 4 - k, warna);
        }
    }

    // Huruf Z naik dari atas mata kanan Memo, membesar di tengah jalan.
    _z(P, t, t0) {
        const k0 = langkahDari(t - t0);
        if (k0 < 0)
            return;
        const warna = hexKeRgb(SPRITE.z.warna);
        for (let n = Math.max(0, Math.floor((k0 - 20) / 8)); n <= Math.floor(k0 / 8); n++) {
            const k = k0 - n * 8;
            if (k > 19 || k === 16 || k === 18)
                continue;
            // Kecil dulu (sprite island), lalu Z besar dari huruf piksel.
            const besar = k >= 8;
            P.sprite(besar ? HURUF.Z : SPRITE.z.baris, this.mx + this.mataL - 2 + Math.floor(k / 2) + (Math.floor(k / 4) % 2),
                this.my - this.mataT - 3 - k - (besar ? 3 : 0), warna);
        }
    }

    // Cincin enam belas petak berputar searah jarum jam mengelilingi Memo,
    // kepalanya terang dengan ekor yang meredup.
    _putaran(P, t, t0, f) {
        if (t < t0)
            return;
        const n = 16, kepala = f % n;
        const rx = this.mataL * 1.45, ry = this.mataT * 2.6;
        const w = this.J.warna;
        for (let i = 0; i < n; i++) {
            const a = (i / n) * 2 * Math.PI - Math.PI / 2;
            const d = (kepala - i + n) % n;
            const warna = d === 0 ? campur(w, PUTIH, 0.5) : redup(w, [1, 0.75, 0.55][d - 1] ?? 0.3);
            P.kotak(this.mx + Math.round(Math.cos(a) * rx) - 1, this.my + Math.round(Math.sin(a) * ry) - 1, 3, 2, warna);
        }
    }

    // Batang hitung mundur sampai aksi berjalan sendiri.
    _batang(P, t, f) {
        const muncul = 900;
        if (t < muncul)
            return;
        const J = this.J;
        const lb = Math.min(this.kol - 8, Math.max(24, Math.round(this.kol * 0.2)));
        const x0 = Math.round((this.kol - lb) / 2), y0 = this.yBatang;
        const sampai = this.tutupPada ?? t;
        const maju = batas((Math.min(t, sampai) - muncul) / (J.lama - muncul), 0, 1);
        const tepi = redup(J.warna, 0.45);
        P.kotak(x0, y0 - 1, lb, 1, tepi);
        P.kotak(x0, y0 + 1, lb, 1, tepi);
        P.titik(x0 - 1, y0, tepi);
        P.titik(x0 + lb, y0, tepi);
        const n = Math.round(lb * maju);
        for (let x = 0; x < n; x++) {
            if (x % 3 !== 2)
                P.titik(x0 + x, y0, x === n - 1 && f % 2 ? PUTIH : J.warna);
        }
    }

    // --- Memo ---------------------------------------------------------------

    _ekspresi(t) {
        const daftar = [...this.J.ekspresi, ...this._ekspresiTutup];
        let i = 0;
        while (i + 1 < daftar.length && daftar[i + 1][0] <= t)
            i++;
        const [tk, nama] = daftar[i];
        const kini = resolveExpression(nama);
        const lalu = i > 0 ? resolveExpression(daftar[i - 1][1]) : kini;
        // face.js tidak bisa memudarkan ikon ke mata (selama transisi hanya
        // ikon yang digambar, padahal ikonnya sudah 'none'): potong langsung,
        // dengan satu langkah mata terpejam seperti berkedip.
        if (lalu.iconAlpha !== kini.iconAlpha) {
            const params = t - tk < MS_LANGKAH ? { ...kini, iconAlpha: 0, open: 0.06 } : kini;
            return { params, nama, sejak: t - tk };
        }
        return { params: lerpParams(lalu, kini, (t - tk) / 450), nama, sejak: t - tk };
    }

    _wajah(params) {
        const l = WAJAH_L * HALUS, t = WAJAH_T * HALUS;
        const s = new Cairo.ImageSurface(Cairo.Format.ARGB32, l, t);
        const c = new Cairo.Context(s);
        c.scale(HALUS, HALUS);
        drawFace(c, WAJAH_L, WAJAH_T, params);
        c.$dispose();
        s.flush();
        const pb = Gdk.pixbuf_get_from_surface(s, 0, 0, l, t);
        return { px: pb.get_pixels(), baris: pb.get_rowstride() };
    }

    _memo(P, t, f, pulau) {
        const { params, nama, sejak } = this._ekspresi(t);
        const tidur = nama === 'tidur' && sejak > 450;
        const diam = tidur ? POSE_TIDUR : DASAR;
        let aktif = null;
        for (const g of [...this.J.gerak, ...this._gerakTutup]) {
            if (g[0] <= t && t - g[0] < durasi(g[1]))
                aktif = g;
        }
        const p = aktif ? poseEmote(aktif[1], t - aktif[0], diam) : { ...diam };

        let skala = this.M, x = this.mx, y = this.my;
        if (pulau < 1) {
            // Memo ikut membesar/mengecil bersama island, tetap di tengahnya;
            // tidak digambar selagi island terlalu pendek untuk matanya.
            const tinggiIsland = this._bentukIsland(pulau).t;
            if (tinggiIsland < 9)
                return;
            skala = 1 + (this.M - 1) * EASE.out(pulau);
            y = Math.min(this.my, Math.round(tinggiIsland * 0.45));
        } else if (!aktif) {
            // Mengambang naik-turun satu petak; saat tidur lebih pelan.
            y += tidur ? Math.floor(f / 12) % 2 : -(Math.floor(f / 8) % 2);
        }

        // Tiap petak di sekitar Memo dipetakan balik (putar, skala) ke wajah,
        // seperti sprite diputar di konsol lama.
        const { px, baris } = this._wajah(params);
        // Geser diredam (seperti amplitudo island): Memo sebesar ini yang
        // melambung penuh saat berguling akan keluar dari tepi atas layar.
        const amp = 0.6;
        const cx = Math.round(x + p.ox * WAJAH_L * skala * amp), cy = Math.round(y + p.oy * WAJAH_T * skala * amp);
        const a = Math.round(p.rz / 10) * 10 * Math.PI / 180;
        const cos = Math.cos(a), sin = Math.sin(a);
        const kx = Math.max(1, Math.round(p.sx * WAJAH_L * skala)) / WAJAH_L;
        const ky = Math.max(1, Math.round(p.sy * WAJAH_T * skala)) / WAJAH_T;
        const R = Math.ceil(Math.hypot(WAJAH_L * kx, WAJAH_T * ky) / 2) + 1;
        // Kecerahan LED seragam (rumus alpha face.js), supaya tepi LED yang
        // kebetulan tercuplik di piksel antialias tidak lebih gelap.
        const terang = 0.72 + 0.28 * params.glow;
        const d = P.data;
        for (let dy = -R; dy < R; dy++) {
            for (let dx = -R; dx < R; dx++) {
                const X = cx + dx, Y = cy + dy;
                if (X < 0 || Y < 0 || X >= P.l || Y >= P.t)
                    continue;
                const rx = dx + 0.5, ry = dy + 0.5;
                const u = (rx * cos + ry * sin) / kx + WAJAH_L / 2;
                const v = (-rx * sin + ry * cos) / ky + WAJAH_T / 2;
                if (u < 0 || v < 0 || u >= WAJAH_L || v >= WAJAH_T)
                    continue;
                const j = Math.floor(v * HALUS) * baris + Math.floor(u * HALUS) * 4;
                if (px[j + 3] < 128)
                    continue;
                const i = (Y * P.l + X) * 4;
                for (let c = 0; c < 3; c++)
                    d[i + c] = Math.round(px[j + c] * terang + d[i + c] * (1 - terang));
            }
        }
    }

    // --- Teks ---------------------------------------------------------------

    _teks(cr, t, f) {
        const J = this.J;
        const { lebar, tinggi, S } = this;
        const uJ = this.uJudul, uS = this.uSub, uK = this.uKecil;
        const tengah = (teks, u) => Math.round((lebar - lebarTeks(teks, u)) / 2);

        // Judul: mesin ketik dua huruf per langkah, huruf baru meloncat.
        const tJudul = 1000;
        const kJ = langkahDari(t - tJudul);
        if (kJ < 0)
            return;
        const huruf = [...J.judul];
        const akhirJ = Math.ceil(huruf.length / 2) - 1;
        const jumlah = Math.min(huruf.length, (kJ + 1) * 2);
        const yJ = Math.round(tinggi * 0.6);
        const xJ = tengah(J.judul, uJ);
        const geser = i => {
            if (kJ === Math.floor(i / 2))
                return -1;
            // Ombak: huruf meloncat bergiliran dari kiri ke kanan.
            const o = kJ - akhirJ - 6 - i;
            return J.ombak && o >= 0 && o % 20 < 2 ? -1 : 0;
        };
        tulisTeks(cr, J.judul, xJ + uJ, yJ + uJ, uJ, [...redup(J.warna, J.bayangan), 1], { jumlah, geser });
        tulisTeks(cr, J.judul, xJ, yJ, uJ, [...PUTIH, 1], { jumlah, geser });
        if (jumlah < huruf.length || (kJ - akhirJ < 10 && kJ % 4 < 2)) {
            const xk = xJ + lebarTeks(huruf.slice(0, jumlah).join(''), uJ) + uJ;
            cr.setSourceRGB(...J.warna.map(v => v / 255));
            cr.rectangle(xk, yJ, 5 * uJ, 7 * uJ);
            cr.fill();
        }

        // Anak judul & info: tiga huruf per langkah sesudah judul selesai.
        const kS = kJ - akhirJ - 3;
        const yS = yJ + 9 * uJ + 2 * uS;
        if (kS >= 0)
            tulisTeks(cr, J.sub, tengah(J.sub, uS), yS, uS, [...TEKS_SUB, 1], { jumlah: (kS + 1) * 3 });
        if (J.info && kS >= 4)
            tulisTeks(cr, J.info, tengah(J.info, uS), (this.yBatang - 1) * S, uS,
                [...campur(J.warna, PUTIH, 0.25), 1], { jumlah: (kS - 3) * 3 });

        // Petunjuk berkedip dua kali lalu diam.
        const kP = kS - 6;
        if (kP >= 0 && (kP >= 4 || kP % 2 === 0)) {
            const yP = (this.yBatang + 3) * S + (J.info ? TINGGI_BARIS * uS - 2 * S : 0);
            tulisTeks(cr, J.petunjuk, tengah(J.petunjuk, uK), yP, uK, [...campur(J.dasar[1], PUTIH, 0.45), 1]);
        }
    }

    // --- Pembuka & penutup --------------------------------------------------

    // Bentuk island pada kemajuan p (0 = island, 1 = layar penuh), dalam
    // petak: lebar, tinggi, jari-jari sudut bawah. Lebar mendahului tinggi,
    // sudut membulat besar di tengah jalan seperti Dynamic Island.
    _bentukIsland(p) {
        const S = this.S;
        p = batas(p, 0, 1);
        const l0 = Math.round(ISLAND.lebar / S), t0 = Math.max(2, Math.round(ISLAND.tinggi / S));
        const r0 = Math.max(1, Math.round(ISLAND.sudut / S));
        const l = Math.round(l0 + (this.kol - l0) * EASE.out(Math.min(1, p * 1.25)));
        const t = Math.round(t0 + (this.bar - t0) * EASE.inOut(p));
        const r = Math.round((r0 + (Math.min(l, t) * 0.3 - r0) * Math.sin(Math.PI * p)) * (1 - p ** 4));
        return { l, t, r };
    }

    _island(cr, p) {
        const { l, t, r } = this._bentukIsland(p);
        const L = this.lapis;
        L.isi(HITAM, 0);
        const x0 = Math.round((this.kol - l) / 2);
        for (let y = 0; y < t; y++) {
            const dy = y - (t - r) + 0.5;
            const sisip = r > 0 && dy > 0 ? Math.round(r - Math.sqrt(Math.max(0, r * r - dy * dy))) : 0;
            L.kotak(x0 + sisip, y, l - 2 * sisip, 1, HITAM);
        }
        this._tempel(cr);
        cr.save();
        cr.setOperator(Cairo.Operator.DEST_IN);
        tempelPetak(cr, L.keSurface(), this.S);
        cr.restore();
    }

    _iris(cr, k) {
        const { mx, my, kol, bar } = this;
        const R0 = Math.hypot(Math.max(mx, kol - mx), Math.max(my, bar - my)) + 1;
        // Cepat menyempit, berhenti sebentar di sekeliling Memo, lalu tutup.
        const m = this.mataL;
        const R = [R0, R0 * 0.72, R0 * 0.48, R0 * 0.32, m * 1.9, m * 1.45, m * 1.28, m * 1.24, m * 1.24,
            m * 1.24, m * 0.57, 0][k] ?? 0;
        const L = this.lapis;
        L.isi(HITAM);
        if (R > 0) {
            for (let dy = -Math.floor(R); dy <= R; dy++) {
                const dx = Math.floor(Math.sqrt(Math.max(0, (R + 0.5) ** 2 - dy * dy)));
                L.kotak(mx - dx, my + dy, 2 * dx + 1, 1, HITAM, 0);
            }
        }
        this._tempel(cr);
        tempelPetak(cr, L.keSurface(), this.S);
    }

    _glitch(cr, k, f) {
        const { S, kol, bar, lebar } = this;
        this._tempel(cr);
        const w = this.J.warna.map(v => v / 255);
        for (let b = 0; b < 6 + k * 3; b++) {
            const y0 = Math.floor(cincang(b, f) * bar), h = 1 + Math.floor(cincang(b, f + 7) * 6);
            const dx = Math.round((cincang(b, f + 3) - 0.5) * 16 * (k + 1));
            cr.save();
            cr.rectangle(0, y0 * S, lebar, h * S);
            cr.clip();
            cr.setSourceRGB(0, 0, 0);
            cr.paint();
            cr.setSourceSurface(this.bingkai, dx * S, 0);
            cr.getSource().setFilter(Cairo.Filter.NEAREST);
            cr.paint();
            if (cincang(b, f + 11) < 0.35) {
                cr.setSourceRGBA(...(cincang(b, f + 13) < 0.5 ? w : [0.3, 0.9, 1]), 0.35);
                cr.paint();
            }
            cr.restore();
        }
        // Beberapa petak putih acak, seperti sinyal rusak.
        cr.setSourceRGB(1, 1, 1);
        for (let i = 0; i < 10 + k * 8; i++) {
            cr.rectangle(Math.floor(cincang(i, f + 17) * kol) * S, Math.floor(cincang(i, f + 19) * bar) * S,
                S * (1 + Math.floor(cincang(i, f + 23) * 4)), S);
        }
        cr.fill();
    }

    _crt(cr, k) {
        const { S, kol, bar, lebar, tinggi } = this;
        cr.setSourceRGB(0, 0, 0);
        cr.paint();
        const cy = Math.floor(bar / 2);
        const L = this.lapis;
        if (k < 4) {
            // Gambar dipepatkan jadi pita, makin putih.
            const hb = Math.max(2, Math.round(bar * [0.5, 0.22, 0.07, 0.02][k]));
            const y0 = cy - Math.floor(hb / 2);
            cr.save();
            cr.rectangle(0, y0 * S, lebar, hb * S);
            cr.clip();
            cr.translate(0, y0 * S);
            cr.scale(1, hb * S / tinggi);
            this._tempel(cr);
            cr.restore();
            const putih = [0.06, 0.2, 0.45, 0.75][k];
            L.isi(HITAM, 0);
            for (let y = y0; y < y0 + hb; y++) {
                for (let x = 0; x < kol; x++) {
                    if (ambang(x, y) < putih)
                        L.titik(x, y, PUTIH);
                }
            }
            tempelPetak(cr, L.keSurface(), S);
        } else if (k < 8) {
            // Garis putih menyusut ke tengah, berpendar biru tipis.
            const lb = Math.max(2, Math.round(kol * [1, 0.55, 0.25, 0.08][k - 4]));
            const x0 = Math.round((kol - lb) / 2);
            L.isi(HITAM, 0);
            L.kotak(x0 + 1, cy - 1, lb - 2, 3, [64, 92, 190]);
            L.kotak(x0, cy, lb, 1, PUTIH);
            tempelPetak(cr, L.keSurface(), S);
        } else if (k < 11) {
            // Titik terakhir, lalu padam.
            const n = [2, 1, 1][k - 8];
            const w = k === 10 ? [0.45, 0.47, 0.6] : [1, 1, 1];
            cr.setSourceRGB(...w);
            cr.rectangle((Math.round(kol / 2) - Math.floor(n / 2)) * S, (cy - Math.floor(n / 2)) * S, n * S, n * S);
            cr.fill();
        }
    }

    _larut(cr, k) {
        const { kol, bar, mx, my } = this;
        const p = (k + 1) / LANGKAH_TUTUP.larut;
        this._tempel(cr);
        const L = this.lapis;
        L.isi(HITAM, 0);
        for (let y = 0; y < bar; y++) {
            for (let x = 0; x < kol; x++) {
                // Mata Memo yang terakhir padam.
                const mata = Math.abs(x - mx) < this.mataL + 3 && Math.abs(y - my) < this.mataT + 3;
                if ((mata ? p >= 0.9 : true) && BAYER8[((y & 7) << 3) | (x & 7)] / 64 < p)
                    L.titik(x, y, HITAM);
            }
        }
        tempelPetak(cr, L.keSurface(), this.S);
    }
}
