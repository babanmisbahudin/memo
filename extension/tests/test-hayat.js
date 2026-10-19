// Jalankan: gjs -m extension/tests/test-hayat.js
import {
    WARNA_BADAN, bersihkan as bersihkanN, telurBaru, ubahIdentitas,
    HARI_MS, JAM_MS, LAMA_HIDUP_HARI, TAHAP, beriMakan, bersihkan, dariJson, hayatBaru, keJson, majukanHayat,
    mandikan, obati, tahapPada, tetaskan,
} from '../hidup/hayat.js';

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

const T0 = Date.parse('2026-10-19T08:00:00+07:00');
const acak = () => 0.5;
// Maju `jamLogin` jam waktu login (per menit), mulai dari `mulai`.
function jalan(h, jamLogin, { mulai = h._t ?? T0, kalenderPerLogin = 1 } = {}) {
    const kejadian = [];
    let t = mulai;
    for (let m = 0; m < jamLogin * 60; m++) {
        t += 60000 * kalenderPerLogin;
        const r = majukanHayat(h, { dtMs: 60000, sekarangMs: t, acak });
        h = r.hayat;
        kejadian.push(...r.kejadian.map(e => ({ ...e, t })));
    }
    h._t = t;
    return { h, kejadian };
}

// --- lahir & tahap ---
let h = hayatBaru({ nama: '  Mochi ', kelamin: 'perempuan', avatar: { warna: 'pink', mata: 'bulat' } }, T0);
cek('lahir sebagai telur', tahapPada(h, T0).tahap === 'telur' && h.nama === 'Mochi' && h.kelamin === 'perempuan');
cek('nama kosong -> Memo, kelamin asing -> belum dipilih', hayatBaru({ nama: ' ', kelamin: 'x' }, T0).nama === 'Memo' &&
    hayatBaru({ kelamin: 'x' }, T0).kelamin === null);
cek('avatar dirapikan', JSON.stringify(h.avatar) === '{"warna":"pink","mata":"bulat"}' &&
    JSON.stringify(hayatBaru({ avatar: { warna: 'ungu', mata: 'x' } }, T0).avatar) === '{"warna":"hitam","mata":"kotak"}');
cek('nama dipangkas 16 huruf', hayatBaru({ nama: 'a'.repeat(40) }, T0).nama.length === 16);
cek('telur tidak lapar & tidak menua', majukanHayat(h, { dtMs: 10 * JAM_MS, sekarangMs: T0 + 10 * JAM_MS, acak }).hayat.lapar === 0);
h = tetaskan(h, T0);
cek('menetas -> bayi', tahapPada(h, T0).tahap === 'bayi');
const urut = TAHAP.map(([n]) => n);
cek('urutan tahap', JSON.stringify(urut) === JSON.stringify(['bayi', 'balita', 'anak', 'remaja', 'dewasa', 'tua']));
cek('lama hidup ±5 bulan', LAMA_HIDUP_HARI >= 140 && LAMA_HIDUP_HARI <= 160);
const pada = hari => tahapPada(h, T0 + hari * HARI_MS).tahap;
cek('tahap menurut kalender', pada(1) === 'bayi' && pada(3) === 'balita' && pada(10) === 'anak' && pada(30) === 'remaja' &&
    pada(60) === 'dewasa' && pada(130) === 'tua');
cek('ukuran tumbuh', tahapPada(h, T0).ukuran < tahapPada(h, T0 + 10 * HARI_MS).ukuran &&
    tahapPada(h, T0 + 60 * HARI_MS).ukuran === 1);

// --- lapar, pup, kotor ---
let r = jalan(h, 2);
cek('bayi lapar lebih cepat (1,5x): 2 jam -> ±0,5', r.h.lapar > 0.45 && r.h.lapar < 0.55);
h = { ...r.h, lapar: 0.8 };
h = beriMakan(h, 'nasi', h._t, acak);
cek('makan mengurangi lapar & menjadwalkan pup', h.lapar < 0.5 && h.pupDalamMs > 0);
r = jalan(h, 2);
const pup = r.kejadian.filter(e => e.jenis === 'pup');
cek('pup sekali, 40-90 menit sesudah makan', pup.length === 1 && r.h.kotoran === 1);
cek('kotoran yang dibiarkan membuat cepat kotor', r.h.kotor > jalan({ ...h, pupDalamMs: 0 }, 2).h.kotor);
h = bersihkan(r.h);
cek('bersihkan kotoran', h.kotoran === 0);
h = mandikan({ ...h, kotor: 0.9 });
cek('mandi -> bersih', h.kotor === 0);
cek('makanan asing ditolak', beriMakan(h, 'batu', h._t, acak) === h);

// --- penelantaran: hanya waktu login ---
let d = { ...h, lapar: 1 };
r = jalan(d, 3.5);
cek('lapar penuh 3 jam login -> sakit', r.h.sakit && r.kejadian.some(e => e.jenis === 'sakit'));
const sakitPada = r.kejadian.find(e => e.jenis === 'sakit').t;
d = r.h;
r = jalan(d, 30);
const mati = r.kejadian.find(e => e.jenis === 'mati');
cek('sakit dibiarkan 24 jam login -> meninggal karena ditelantarkan', mati?.sebab === 'ditelantarkan' && r.h.mati);
cek('tepat 24 jam sesudah sakit', Math.abs(mati.t - sakitPada - 24 * JAM_MS) <= 2 * 60000);
const per = r.kejadian.filter(e => e.jenis === 'peringatan').map(e => e.sisaJam);
cek('peringatan saat 12 jam & 2 jam tersisa', JSON.stringify(per) === JSON.stringify([12, 2]));
cek('sudah meninggal: tidak berubah lagi', majukanHayat(r.h, { dtMs: JAM_MS, sekarangMs: r.h._t + JAM_MS, acak }).kejadian.length === 0);
cek('album mencatat', r.h.album.at(-1).sebab === 'ditelantarkan' && r.h.album.at(-1).nama === 'Mochi');

// Laptop mati/tidur: kalender maju, login tidak -> tidak menambah sakit.
d = { ...jalan({ ...h, lapar: 1 }, 3.5).h };
const lalu = d.sakitMs;
const lompat = majukanHayat(d, { dtMs: 0, sekarangMs: d._t + 5 * HARI_MS, acak }).hayat;
cek('laptop mati 5 hari tidak menambah lapar/sakit', lompat.sakitMs === lalu && !lompat.mati);
const sehat = { ...h, lapar: 0.2, kotor: 0.1, sakit: false, sakitMs: 0, penuhMs: 0 };
const tidur = majukanHayat(sehat, { dtMs: 0, sekarangMs: sehat._t + 2 * HARI_MS, acak }).hayat;
cek('laptop mati 2 hari: lapar & kotor Memo sehat tidak berubah', tidur.lapar === 0.2 && tidur.kotor === 0.1);
const obat = obati(d);
cek('obat menyembuhkan', !obat.sakit && obat.sakitMs === 0);
cek('obat saja tanpa makan: sakit lagi sesudah 3 jam', jalan(obat, 3.5).h.sakit);
cek('obat + makan: sehat terus', !jalan(beriMakan(obat, 'kue', obat._t, acak), 3.5).h.sakit);

// --- tumbuh & tua ---
r = jalan({ ...h, lapar: 0, _t: T0 + 1.99 * HARI_MS }, 0.5);
cek('pergantian tahap jadi kejadian tumbuh', r.kejadian.some(e => e.jenis === 'tumbuh' && e.tahap === 'balita'));
const tua = majukanHayat({ ...h, lapar: 0 }, { dtMs: 60000, sekarangMs: T0 + (LAMA_HIDUP_HARI + 1) * HARI_MS, acak });
cek('melewati lama hidup -> meninggal karena tua', tua.hayat.mati && tua.kejadian.some(e => e.jenis === 'mati' && e.sebab === 'tua'));

// --- identitas, kotoran satu per satu, telur baru ---
const ganti = ubahIdentitas(h, { nama: 'Kiki', kelamin: 'laki-laki', avatar: { warna: 'biru', mata: 'sipit' } });
cek('ubah identitas', ganti.nama === 'Kiki' && ganti.kelamin === 'laki-laki' && ganti.avatar.warna === 'biru' && ganti.lahirMs === h.lahirMs);
cek('ubah identitas: nilai asing diabaikan', ubahIdentitas(h, { kelamin: 'x' }).kelamin === h.kelamin);
cek('bersihkan satu kotoran', bersihkanN({ ...h, kotoran: 3 }, 1).kotoran === 2 && bersihkanN({ ...h, kotoran: 3 }).kotoran === 0);
cek('setiap warna badan punya warna mata', Object.values(WARNA_BADAN).every(w => /^#[0-9a-f]{6}$/.test(w.badan) && w.mata.length === 3));
const baru = telurBaru({ ...h, album: [{ nama: 'Lama' }], mati: true }, T0);
cek('telur baru: album tetap, belum menetas', baru.album.length === 1 && baru.lahirMs === null && !baru.mati);

// --- simpan & muat ---
const j = keJson(h);
const m = dariJson(JSON.parse(JSON.stringify(j)), T0);
cek('simpan-muat bolak-balik', m.nama === h.nama && m.lahirMs === h.lahirMs && m.kotor === h.kotor && m.kelamin === h.kelamin);
const lama = dariJson({ sifat: {}, kebutuhan: {} }, T0);
cek('data lama tanpa hayat -> Memo dewasa yang baru dewasa hari ini', tahapPada(lama, T0).tahap === 'dewasa' &&
    tahapPada(lama, T0 - HARI_MS).tahap === 'remaja' && lama.nama === 'Memo' && !lama.mati);
const rusak = dariJson({ hayat: { nama: 7, lapar: 'x', lahirMs: 'kemarin', kotoran: -3 } }, T0);
cek('data rusak -> nilai aman', rusak.nama === 'Memo' && rusak.lapar === 0 && rusak.kotoran === 0 && Number.isFinite(rusak.lahirMs));

console.log(`\n${lolos} lolos, ${gagal} gagal`);
if (gagal)
    throw new Error(`${gagal} gagal`);
