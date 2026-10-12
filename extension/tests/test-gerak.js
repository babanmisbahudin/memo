// Jalankan: gjs -m tests/test-gerak.js   (atau node tests/test-gerak.js)
import { DASAR, EMOTE, POSE_TIDUR, EASE, ISENG, SPRITE, LANGKAH_RZ, bolehTidur, durasi, keAktor, langkahPartikel, nilaiKanal, poseEmote, DETIK_TIDUR }
    from '../gerakPola.js';

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
const dekat = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

for (const [nama, f] of Object.entries(EASE))
    cek(`ease ${nama} 0->0 dan 1->1`, dekat(f(0), 0) && dekat(f(1), 1));

for (const nama of Object.keys(EMOTE)) {
    const d = durasi(nama);
    cek(`${nama} punya durasi`, d > 0 && d < 1500);
    const akhir = poseEmote(nama, d);
    // Putaran 360 derajat sama dengan 0 secara visual.
    const sama = k => (k === 'rz' ? dekat(((akhir[k] % 360) + 360) % 360, 0) : dekat(akhir[k], DASAR[k]));
    cek(`${nama} berakhir di pose dasar`, Object.keys(DASAR).every(sama));
    const awal = poseEmote(nama, 0);
    cek(`${nama} mulai dari pose dasar (tanpa lonjakan)`, Object.keys(DASAR).every(k => dekat(awal[k], DASAR[k])));
}

cek('lompat: durasi = kanal terpanjang (sy/sx 570 ms)', durasi('lompat') === 570);
cek('lompat: puncak naik di 120 ms', dekat(poseEmote('lompat', 120).oy, -0.30));
cek('lompat: naik, bukan turun', poseEmote('lompat', 60).oy < 0);
cek('lompat: gepeng saat tolakan', poseEmote('lompat', 80).sy < 1 && poseEmote('lompat', 80).sx > 1);
cek('kaget: tersentak naik', poseEmote('kaget', 150).oy < -0.19);
cek('geleng: bergeser kiri lalu kanan', poseEmote('geleng', 50).ox < 0 && poseEmote('geleng', 140).ox > 0);
cek('emote tak dikenal: durasi 0', durasi('tak-ada') === 0);
cek('kanal yang tak dipakai ikut pose diam', dekat(poseEmote('geleng', 100, POSE_TIDUR).sy, POSE_TIDUR.sy));
cek('nilaiKanal sebelum mulai = awal', dekat(nilaiKanal([[5, 100, 'lin']], 0, 1), 1));
cek('nilaiKanal pertengahan linear', dekat(nilaiKanal([[5, 100, 'lin']], 50, 1), 3));
cek('nilaiKanal sesudah selesai = target terakhir', dekat(nilaiKanal([[5, 100, 'lin'], [2, 100, 'lin']], 999, 1), 2));

cek('putar: satu putaran penuh', dekat(poseEmote('putar', 950).rz, 360));
cek('dansa: miring kiri lalu kanan', poseEmote('dansa', 180).rz <= -9.99 && poseEmote('dansa', 540).rz >= 9.99);
cek('pusing: sempoyongan lalu tegak', poseEmote('pusing', 120).rz > 19 && dekat(poseEmote('pusing', durasi('pusing')).rz, 0));
cek('gerak iseng semuanya emote sah', ISENG.every(n => durasi(n) > 0));
cek('gerak iseng pendek (< 1,5 dtk)', ISENG.every(n => durasi(n) < 1500));
cek('jumlah emote bertambah (>= 14)', Object.keys(EMOTE).length >= 14);
cek('tidur: kepala miring', POSE_TIDUR.rz < 0);

// Gaya piksel
for (const [nama, e] of Object.entries(EMOTE)) {
    const rz = Object.values(e.rz ?? []).map(k => k[0]);
    cek(`${nama}: kemiringan kelipatan ${LANGKAH_RZ} derajat (tidak hilang saat dikunci)`, rz.every(v => v % LANGKAH_RZ === 0));
}
const ukuran = { lebar: 44, tinggi: 26 };
const a = keAktor(poseEmote('lompat', 60), { ...ukuran, amplitudo: 0.45 });
cek('island: geser dikunci ke piksel bulat', Number.isInteger(a.translation_y) && Number.isInteger(a.translation_x));
cek('island: tinggi hasil skala = piksel bulat', Number.isInteger(Math.round(a.scale_y * 26 * 1e9) / 1e9));
const d = keAktor(poseEmote('lompat', 120), { ...ukuran, skala: 2.6 });
cek('desktop: geser kelipatan satu piksel seni (2,6 px)', Math.abs(d.translation_y / 2.6 - Math.round(d.translation_y / 2.6)) < 1e-9 && d.translation_y < 0);
cek('desktop: skala dasar tetap 2,6', Math.abs(keAktor(DASAR, { ...ukuran, skala: 2.6 }).scale_y - 2.6) < 1e-9);
cek('putaran dikunci per 10 derajat', keAktor({ ...DASAR, rz: 23 }, ukuran).rotation_angle_z === 20);
cek('pose dasar = aktor netral', JSON.stringify(keAktor(DASAR, ukuran)) === JSON.stringify({ translation_x: 0, translation_y: 0, scale_x: 1, scale_y: 1, rotation_angle_z: 0 }));
for (const [nama, s] of Object.entries(SPRITE)) {
    cek(`sprite ${nama}: baris sama panjang`, s.baris.every(b => b.length === s.baris[0].length));
    cek(`sprite ${nama}: hanya # dan .`, s.baris.every(b => /^[#.]+$/.test(b)) && s.baris.join('').includes('#'));
    cek(`sprite ${nama}: warna hex`, /^#[0-9a-f]{6}$/i.test(s.warna));
}
const jalur = [...Array(12).keys()].map(i => langkahPartikel(i, { arah: -1, simpang: 1 }));
cek('partikel naik 2 petak per langkah', jalur[1].dy === -2 && jalur[5].dy === -10);
cek('partikel berkedip menjelang hilang', jalur[6].tampak === false && jalur[7].tampak === true);
cek('partikel hilang setelah 10 langkah', jalur[10] === null);
cek('partikel island turun', langkahPartikel(3, { arah: 1 }).dy === 6);

const diam = { diamMs: DETIK_TIDUR * 1000, jarakKursor: 400, adaIzin: false, adaAktivitas: false, ekspresi: 'netral' };
cek('tidur: diam lama + kursor jauh', bolehTidur(diam));
cek('tidak tidur: belum cukup lama', !bolehTidur({ ...diam, diamMs: 5000 }));
cek('tidak tidur: kursor dekat', !bolehTidur({ ...diam, jarakKursor: 100 }));
cek('tidak tidur: ada izin menunggu', !bolehTidur({ ...diam, adaIzin: true }));
cek('tidak tidur: agen sedang bekerja', !bolehTidur({ ...diam, adaAktivitas: true }));
cek('tidak tidur: sedang menunjukkan galat', !bolehTidur({ ...diam, ekspresi: 'error' }));
cek('ambang tidur bisa diganti (uji)', bolehTidur({ ...diam, diamMs: 2000 }, 2));

console.log(`\n${lolos} lolos, ${gagal} gagal`);
if (gagal)
    throw new Error(`${gagal} gagal`);
