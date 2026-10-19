// Jalankan: gjs -m extension/tests/test-pintasan.js
import { MAKS_PINTASAN, PINTASAN_BAWAAN, bacaPintasan, jalurPenuh } from '../pintasanPola.js';

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

cek('bawaan: 5 pintasan sah', PINTASAN_BAWAAN.length === MAKS_PINTASAN && bacaPintasan(JSON.stringify(PINTASAN_BAWAAN)).length === 5);
cek('tanpa berkas -> bawaan', JSON.stringify(bacaPintasan(null)) === JSON.stringify(PINTASAN_BAWAAN));
cek('json rusak -> bawaan', JSON.stringify(bacaPintasan('{rusak')) === JSON.stringify(PINTASAN_BAWAAN));
cek('bukan larik -> bawaan', bacaPintasan('{"a":1}').length === 5);
const isi = bacaPintasan(JSON.stringify([
    { nama: 'Admin LT', jenis: 'url', target: 'https://admin.contoh.id' },
    { nama: 'Bahaya', jenis: 'url', target: 'file:///etc/passwd' },
    { nama: 'Skrip', jenis: 'perintah', target: 'rm -rf ~' },
    { nama: '', jenis: 'folder', target: '~/x' },
    { nama: 'Unduhan', jenis: 'folder', target: '~/Downloads' },
    { nama: 'Nama yang sangat panjang sekali', jenis: 'aplikasi', target: 'org.gnome.Nautilus' },
    { nama: 'Term', jenis: 'terminal', target: '~/Projects' },
    { nama: 'Keenam', jenis: 'url', target: 'https://enam.id' },
    { nama: 'Ketujuh', jenis: 'url', target: 'https://tujuh.id' },
]));
cek('url non-http, jenis asing, nama kosong dibuang', !isi.some(p => ['Bahaya', 'Skrip', ''].includes(p.nama)));
cek(`paling banyak ${MAKS_PINTASAN}`, isi.length === MAKS_PINTASAN && isi[0].nama === 'Admin LT');
cek('nama dipotong 12 huruf', isi.find(p => p.jenis === 'aplikasi').nama.length <= 12);
cek('larik kosong -> kosong (pengguna menghapus semua)', bacaPintasan('[]').length === 0);
cek('jalurPenuh: ~ jadi home', jalurPenuh('~/Downloads', '/home/x') === '/home/x/Downloads' && jalurPenuh('~', '/home/x') === '/home/x');
cek('jalurPenuh: jalur mutlak tetap', jalurPenuh('/tmp/a', '/home/x') === '/tmp/a' && jalurPenuh('~orang/x', '/home/x') === '~orang/x');

console.log(`\n${lolos} lolos, ${gagal} gagal`);
if (gagal)
    throw new Error(`${gagal} gagal`);
