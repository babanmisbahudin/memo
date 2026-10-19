// Jalankan: gjs -m login/tests/test-kunci.js
import { AnimasiKunci, BARIS, KOLOM, WARNA_BAGIAN, tanggalKunci } from '../kunciPola.js';
import { BAGIAN_HARI } from '../../extension/waktuPola.js';

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

const semua = (a, n = 600) => Array.from({ length: n }, (_, f) => a.titik(f));
for (const b of BAGIAN_HARI) {
    const a = new AnimasiKunci(b);
    const bingkai = semua(a);
    cek(`${b}: semua titik di dalam kisi`, bingkai.every(t => t.every(([x, y, , k]) =>
        Number.isInteger(x) && Number.isInteger(y) && x >= 0 && x < KOLOM && y >= 0 && y < BARIS && [1, 2, 3].includes(k))));
    cek(`${b}: bergerak (bingkai berbeda-beda)`, new Set(bingkai.map(t => JSON.stringify(t))).size > 20);
    cek(`${b}: tetap sama untuk benih yang sama`, JSON.stringify(new AnimasiKunci(b).titik(123)) === JSON.stringify(a.titik(123)));
    cek(`${b}: punya warna`, WARNA_BAGIAN[b]?.teks.length === 3 && WARNA_BAGIAN[b]?.cahaya.length === 3);
}

const jenis = b => new Set(semua(new AnimasiKunci(b)).flat().map(t => t[2]));
cek('siang: tanpa bintang & bintang jatuh, ada burung', !jenis('siang').has('bintang') && !jenis('siang').has('meteor') && jenis('siang').has('burung'));
cek('malam: bintang & bintang jatuh, tanpa burung', jenis('malam').has('bintang') && jenis('malam').has('meteor') && !jenis('malam').has('burung'));
cek('bagian asing -> malam', new AnimasiKunci('x').bagian === 'malam');

// Bintang tidak berkelip di wajah Memo maupun kolom jam.
const malam = new AnimasiKunci('malam');
cek('bintang menjauhi Memo & jam', malam.bintang.every(({ x, y }) => !(x >= 60 && x <= 132 && y >= 6 && y <= 36) && !(x >= 64 && x <= 128 && y >= 34)));

// Bintang jatuh: sekali per jeda, meluncur ke kiri bawah.
const kepala = f => malam.titik(f).find(t => t[2] === 'meteor' && t[3] === 3);
cek('bintang jatuh muncul di awal jeda', kepala(0) && kepala(9) && !kepala(10) && !kepala(89) && kepala(90));
cek('bintang jatuh meluncur ke kiri bawah', kepala(5)[0] < kepala(0)[0] && kepala(5)[1] > kepala(0)[1]);

// Burung terbang ke kanan dan mengepak.
const siang = new AnimasiKunci('siang');
const kiri = f => Math.min(...siang.titik(f).filter(t => t[2] === 'burung').map(t => t[0]));
cek('burung terbang ke kanan', kiri(20) > kiri(0));
cek('burung mengepak', JSON.stringify(siang.titik(0).map(t => t[1])) !== JSON.stringify(siang.titik(3).map(t => t[1])));

cek('tanggal berbahasa Indonesia', tanggalKunci(new Date(2026, 9, 18)) === 'minggu, 18 oktober' &&
    tanggalKunci(new Date(2026, 0, 2)) === 'jumat, 2 januari');

console.log(`${lolos} lolos, ${gagal} gagal`);
if (gagal)
    throw new Error(`${gagal} gagal`);
