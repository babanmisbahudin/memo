// Jalankan: gjs -m extension/tests/test-studio.js
import {
    KATALOG, KATEGORI, RUPA_BAWAAN, WARNA, acakRupa, bolehDipilih, geser, harga, rapikanRupa, warnaMataDipakai,
} from '../hidup/studio.js';

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

cek('semua kategori ada di rupa bawaan', KATEGORI.every(k => k in RUPA_BAWAAN) && Object.keys(RUPA_BAWAAN).length === KATEGORI.length);
for (const k of KATEGORI) {
    const ids = KATALOG[k].map(([id]) => id);
    cek(`${k}: tanpa id ganda`, new Set(ids).size === ids.length);
    cek(`${k}: bawaan gratis`, harga(k, RUPA_BAWAAN[k]) === 0 && ids.includes(RUPA_BAWAAN[k]));
    cek(`${k}: ada pilihan dasar ≥ 2`, KATALOG[k].filter(([, c]) => c === 0).length >= 2);
}
cek('12 warna badan, tiap warna punya warna mata', Object.keys(WARNA).length === 12 &&
    Object.values(WARNA).every(w => /^#[0-9a-f]{6}$/.test(w.badan) && w.mata.length === 3));
cek('item istimewa terkunci tanpa koin', !bolehDipilih('bentuk', 'kucing') && bolehDipilih('bentuk', 'kucing', ['bentuk:kucing']));
cek('item dasar selalu boleh', bolehDipilih('mata', 'bulat') && !bolehDipilih('mata', 'ngawur'));

const lama = rapikanRupa({ warna: 'pink', mata: 'bulat' });
cek('simpanan lama {warna, mata} terbaca, sisanya bawaan', lama.warna === 'pink' && lama.mata === 'bulat' && lama.bentuk === 'pil' &&
    lama.mulut === 'tanpa');
const rusak = rapikanRupa({ bentuk: 'segitiga', warna: 7, pola: 'belang' });
cek('nilai asing -> bawaan', rusak.bentuk === 'pil' && rusak.warna === 'hitam' && rusak.pola === 'belang');

let benih = 9;
const acak = () => ((benih = (benih * 16807) % 2147483647) - 1) / 2147483646;
const banyak = Array.from({ length: 200 }, () => acakRupa(acak));
cek('acak hanya memilih item dasar bila belum ada yang dibuka', banyak.every(r => KATEGORI.every(k => harga(k, r[k]) === 0)));
cek('acak bervariasi', new Set(banyak.map(r => JSON.stringify(r))).size > 100);
cek('acak bisa memilih item yang sudah dibuka', Array.from({ length: 200 }, () => acakRupa(acak, ['bentuk:awan'])).some(r => r.bentuk === 'awan'));
cek('◀ ▶ berputar', geser('bentuk', 'pil', -1) === 'kucing' && geser('bentuk', 'kucing', 1) === 'pil' && geser('mulut', 'tanpa', 1) === 'senyum');
cek('warna mata otomatis ikut badan, pilihan menang', warnaMataDipakai({ warna: 'putih', warnaMata: 'otomatis' })[0] < 0.2 &&
    warnaMataDipakai({ warna: 'putih', warnaMata: 'pink' })[0] === 1);

console.log(`\n${lolos} lolos, ${gagal} gagal`);
if (gagal)
    throw new Error(`${gagal} gagal`);
