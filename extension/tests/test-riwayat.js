// Jalankan: gjs -m extension/tests/test-riwayat.js
import { BATAS, Riwayat } from '../riwayatPola.js';

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

const jam = (j, m = 0, hari = 18) => new Date(2026, 9, hari, j, m).getTime();
const r = new Riwayat();
cek('tambah agen', r.tambah({ jenis: 'agen', judul: 'claude · toko selesai', isi: '+2 -1', warna: '#3fb950',
    buka: { jenis: 'folder', target: '/home/x/toko' } }, jam(23, 4)));
cek('tambah kabar', r.tambah({ jenis: 'kabar', judul: 'LebihTeratur', isi: 'Pembayaran masuk',
    buka: { jenis: 'url', target: 'https://contoh.id/x' } }, jam(22, 51)));
cek('tambah notifikasi', r.tambah({ jenis: 'notifikasi', judul: 'Telegram', isi: '3 pesan' }, jam(21, 15)));
let d = r.hariIni('semua', jam(23, 30));
cek('hari ini: terbaru di atas', d.map(e => e.judul).join('|') === 'claude · toko selesai|LebihTeratur|Telegram');
cek('saring agen', r.hariIni('agen', jam(23, 30)).length === 1 && r.hariIni('agen', jam(23, 30))[0].jenis === 'agen');
cek('saring kabar', r.hariIni('kabar', jam(23, 30)).length === 1);
cek('saring notifikasi', r.hariIni('notifikasi', jam(23, 30)).length === 1);

cek('duplikat beruntun < 10 dtk diabaikan', !r.tambah({ jenis: 'notifikasi', judul: 'Telegram', isi: '3 pesan' }, jam(21, 15) + 5000));
cek('sesudah 10 dtk boleh lagi', r.tambah({ jenis: 'notifikasi', judul: 'Telegram', isi: '3 pesan' }, jam(21, 16)));
cek('jenis tak dikenal ditolak', !r.tambah({ jenis: 'volume', judul: 'Volume 50%' }, jam(21, 20)));
cek('judul kosong ditolak', !r.tambah({ jenis: 'kabar', judul: '' }, jam(21, 20)));
cek('buka berbahaya dibuang', r.tambah({ jenis: 'kabar', judul: 'X', buka: { jenis: 'url', target: 'javascript:alert(1)' } }, jam(20, 0)) &&
    r.hariIni('kabar', jam(23, 30)).find(e => e.judul === 'X').buka === null);
cek('buka folder harus jalur mutlak', r.tambah({ jenis: 'agen', judul: 'Y', buka: { jenis: 'folder', target: 'relatif' } }, jam(20, 1)) &&
    r.hariIni('agen', jam(23, 30)).find(e => e.judul === 'Y').buka === null);

cek('kemarin tidak tampil hari ini', r.tambah({ jenis: 'kabar', judul: 'Kemarin' }, jam(22, 0, 17)) &&
    !r.hariIni('semua', jam(23, 30)).some(e => e.judul === 'Kemarin'));
cek('besok: hari ini kosong', r.hariIni('semua', jam(9, 0, 19)).length === 0);

const banyak = new Riwayat();
for (let i = 0; i < BATAS + 25; i++)
    banyak.tambah({ jenis: 'notifikasi', judul: `n${i}` }, jam(1) + i * 60000);
cek(`batas ${BATAS} entri, yang tertua dibuang`, banyak.keJson().length === BATAS && banyak.keJson()[0].judul === 'n25');

const pulih = Riwayat.dariJson(JSON.parse(JSON.stringify(r.keJson())));
cek('simpan/muat sama', JSON.stringify(pulih.keJson()) === JSON.stringify(r.keJson()));
const rusak = Riwayat.dariJson([{ jenis: 'kabar', judul: 'ok', waktu: jam(1) }, { jenis: 'x' }, null, 'teks', { judul: 'tanpa waktu', jenis: 'kabar' }]);
cek('muat data rusak: yang sah saja', rusak.keJson().length === 1);
cek('muat bukan larik -> kosong', Riwayat.dariJson({ a: 1 }).keJson().length === 0);

console.log(`\n${lolos} lolos, ${gagal} gagal`);
if (gagal)
    throw new Error(`${gagal} gagal`);
