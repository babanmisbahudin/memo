// Jalankan: gjs -m extension/tests/test-pikiran.js
import { bolehDi, petaDari } from '../hidup/dunia.js';
import {
    KEBUTUHAN_BAWAAN, KEGIATAN, SIFAT_BAWAAN, dariJson, keJson, keadaanBaru, majukan, pikir,
} from '../hidup/pikiran.js';

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
const sama = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function acakDari(benih) {
    let a = benih >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), a | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const AREA = { x: 0, y: 32, lebar: 1600, tinggi: 868 };
const UKURAN = { lebar: 120, tinggi: 72 };
const YT = { id: 2, x: 950, y: 150, lebar: 600, tinggi: 400, aplikasi: 'firefox', judul: 'Lofi — YouTube' };
const VS = { id: 1, x: 100, y: 300, lebar: 800, tinggi: 500, aktif: true, aplikasi: 'Code', judul: 'memo' };
const TG = { id: 9, x: 1000, y: 600, lebar: 500, tinggi: 250, aplikasi: 'TelegramDesktop', judul: 'Telegram' };

// Kursor berpindah tiap 20 detik di dalam jendela VS Code (kamu sedang ngoding).
const kursorKerja = acak => {
    let kini = { x: 400, y: 500 };
    return t => {
        if (t % 20 === 0)
            kini = { x: Math.round(150 + acak() * 700), y: Math.round(350 + acak() * 400) };
        return kini;
    };
};

// Simulasi: Memo dianggap langsung tiba di tiap tujuan.
function simulasi({ sifat = {}, detik, jendela = () => [YT, VS], jam = () => 10, pergi = () => false, benih = 7 }) {
    const acak = acakDari(benih);
    const kursor = kursorKerja(acakDari(benih + 1));
    let k = keadaanBaru({ sifat });
    let posisi = { x: 1300, y: 900 };
    let tepi = null;
    let pergiLalu = false;
    const catat = { lama: {}, tujuan: [], niat: [] };
    for (let t = 0; t < detik; t++) {
        const persepsi = { areaKerja: AREA, jendela: jendela(t), kursor: kursor(t), jam: jam(t) };
        const peta = petaDari(persepsi, UKURAN);
        const pg = pergi(t);
        const r = pikir(k, { persepsi, peta, ukuran: UKURAN, posisi, tepi, dtMs: 1000, acak,
            pergi: pg, kembali: pergiLalu && !pg, sampai: true });
        pergiLalu = pg;
        k = r.keadaan;
        if (r.niat) {
            catat.niat.push({ t, ...r.niat });
            if (r.niat.tujuan) {
                catat.tujuan.push({ t, tujuan: r.niat.tujuan, peta });
                posisi = { x: r.niat.tujuan.x, y: r.niat.tujuan.y };
                tepi = r.niat.tujuan.tepi ?? null;
            }
        }
        catat.lama[k.kegiatan] = (catat.lama[k.kegiatan] ?? 0) + 1;
    }
    return { k, catat };
}

// --- keadaan & kebutuhan ---
let k = keadaanBaru({ sifat: { penasaran: 2, aktif: 'x' } });
cek('keadaanBaru: sifat dijepit 0..1, nilai rusak diabaikan', k.sifat.penasaran === 1 && k.sifat.aktif === SIFAT_BAWAAN.aktif);
cek('keadaanBaru: kebutuhan bawaan', sama(k.kebutuhan, KEBUTUHAN_BAWAAN));
const maju = (keg, opsi = {}) => majukan({ ...keadaanBaru(), kegiatan: keg }, { dtMs: 600000, jam: 10, ...opsi }).kebutuhan;
cek('tidur memulihkan energi', maju('tidur').energi > KEBUTUHAN_BAWAAN.energi);
cek('bergerak menguras energi lebih cepat dari melamun', maju('jelajah').energi < maju('melamun').energi);
cek('malam menguras energi lebih cepat', maju('melamun', { jam: 23 }).energi < maju('melamun').energi);
cek('melamun menambah bosan, jelajah mengurangi', maju('melamun').bosan > KEBUTUHAN_BAWAAN.bosan && maju('jelajah').bosan < KEBUTUHAN_BAWAAN.bosan);
cek('ngintip mengurangi penasaran', maju('ngintip').penasaran < maju('melamun').penasaran);
cek('jendela baru menaikkan penasaran', majukan(keadaanBaru(), { dtMs: 1000, jam: 10, temuanBaru: 1 }).kebutuhan.penasaran >
    majukan(keadaanBaru(), { dtMs: 1000, jam: 10 }).kebutuhan.penasaran + 0.1);
cek('semua kebutuhan tetap 0..1', Object.values(maju('tidur', { dtMs: 1e9 })).every(v => v >= 0 && v <= 1));

// --- simpan / muat ---
const simpan = keJson(keadaanBaru({ sifat: { manja: 0.9 }, kebutuhan: { energi: 0.3, bosan: 0.8 } }), Date.parse('2026-10-18T23:00:00Z'));
cek('keJson: sifat, kebutuhan, waktu', simpan.sifat.manja === 0.9 && simpan.kebutuhan.energi === 0.3 &&
    simpan.disimpan === '2026-10-18T23:00:00.000Z');
k = dariJson(simpan, Date.parse('2026-10-19T07:00:00Z'));
cek('muat sesudah 8 jam: energi penuh, tidak bosan, rindu naik', k.kebutuhan.energi === 1 && k.kebutuhan.bosan <= 0.2 &&
    k.kebutuhan.rindu > KEBUTUHAN_BAWAAN.rindu && k.sifat.manja === 0.9);
cek('muat data rusak -> bawaan', sama(dariJson({ sifat: 'x', disimpan: 'kemarin' }, Date.now()).kebutuhan, KEBUTUHAN_BAWAAN));
cek('muat tanpa data -> bawaan', sama(dariJson(null, Date.now()).sifat, SIFAT_BAWAAN));

// --- satu detik pikiran, kasus khusus ---
const dasar = (jendela, kursor = { x: 400, y: 500 }) => {
    const persepsi = { areaKerja: AREA, jendela, kursor, jam: 10 };
    return { persepsi, peta: petaDari(persepsi, UKURAN), ukuran: UKURAN, posisi: { x: 1300, y: 900 }, tepi: null,
        dtMs: 1000, acak: acakDari(3) };
};
let r = pikir(keadaanBaru(), { ...dasar([YT, VS]), pergi: true });
cek('kamu pergi -> tidur', r.keadaan.kegiatan === 'tidur' && r.niat.ekspresi === 'tidur');
r = pikir(r.keadaan, { ...dasar([YT, VS]), kembali: true });
cek('kamu kembali -> sambut dengan hati', r.keadaan.kegiatan === 'sambut' && r.niat.ikon === 'hati');
r = pikir(keadaanBaru(), dasar([YT, { ...VS, layarPenuh: true }]));
cek('aplikasi layar penuh -> sembunyi', r.niat?.kegiatan === 'sembunyi');
cek('sembunyi: detik berikutnya tidak ada niat baru', pikir(r.keadaan, dasar([YT, { ...VS, layarPenuh: true }])).niat === null);
r = pikir({ ...keadaanBaru({ kebutuhan: { rindu: 0.9 } }), sisaMs: 99999 }, { ...dasar([YT, VS]), dielus: true });
cek('dielus -> rindu turun & bereaksi tanpa pindah', Math.abs(r.keadaan.kebutuhan.rindu - 0.4) < 0.01 &&
    r.niat.emote === 'tepuk' && r.niat.ikon === 'hati' && r.niat.tujuan === undefined);
const dekat = dasar([YT, VS], { x: 1300, y: 880 });
r = pikir({ ...keadaanBaru(), sisaMs: 99999 }, dekat);
cek('kursor mendekat -> menyingkir ke tempat yang boleh', r.niat?.tujuan &&
    bolehDi(dekat.peta, { ...r.niat.tujuan, jenis: r.niat.tujuan.tepi?.jenis ?? null }, UKURAN));
const MAX = { ...VS, x: 0, y: 32, lebar: 1600, tinggi: 868, maksimal: true };
r = pikir(keadaanBaru(), dasar([YT, MAX], { x: 400, y: 500 }));
cek('jendela aktif maximize -> ke tepi layar', r.niat?.tujuan?.jenis === 'tepi' && r.niat.tujuan.tepi.jenis === 'layar');

// --- simulasi ---
let { catat } = simulasi({ detik: 4 * 3600 });
const salah = catat.tujuan.filter(({ tujuan, peta }) =>
    !bolehDi(peta, { ...tujuan, jenis: tujuan.tepi?.jenis ?? null }, UKURAN));
cek(`4 jam: tujuan tidak pernah di zona larangan (${salah.length} salah dari ${catat.tujuan.length})`,
    salah.length === 0 && catat.tujuan.length > 50);
cek('4 jam: semua kegiatan sah', Object.keys(catat.lama).every(n => KEGIATAN.includes(n)));
cek('4 jam: ada jendela video -> pernah nonton', (catat.lama.nonton ?? 0) > 0);
cek('4 jam: kamu ngoding -> pernah menemani', (catat.lama.temani ?? 0) > 0);
cek(`4 jam: kegiatan bervariasi (${Object.keys(catat.lama).join(', ')})`, Object.keys(catat.lama).length >= 4);

const malas = simulasi({ sifat: { aktif: 0.05 }, detik: 6 * 3600, jam: () => 23 }).catat.lama.tidur ?? 0;
const rajin = simulasi({ sifat: { aktif: 0.95 }, detik: 6 * 3600, jam: () => 23 }).catat.lama.tidur ?? 0;
cek(`sifat malas lebih banyak tidur (${malas} dtk) daripada aktif (${rajin} dtk)`, malas > rajin);

({ catat } = simulasi({ sifat: { penasaran: 0.95 }, detik: 1800, jendela: t => (t < 600 ? [YT, VS] : [YT, TG, VS]) }));
const intipTG = catat.niat.find(n => n.t >= 600 && n.kegiatan === 'ngintip' && n.tujuan?.jendelaId === 9);
cek(`jendela baru (Telegram) diintip dalam 10 menit (detik ke-${intipTG?.t})`, intipTG && intipTG.t < 1200);

({ catat } = simulasi({ detik: 1200, pergi: t => t >= 300 && t < 900 }));
cek('pergi 10 menit: tidur sepanjang waktu itu', catat.niat.some(n => n.t === 300 && n.kegiatan === 'tidur') &&
    !catat.niat.some(n => n.t > 300 && n.t < 900 && n.kegiatan !== 'tidur'));
cek('lalu menyambut saat kembali', catat.niat.some(n => n.t === 900 && n.kegiatan === 'sambut'));

console.log(`\n${lolos} lolos, ${gagal} gagal`);
if (gagal)
    throw new Error(`${gagal} gagal`);
