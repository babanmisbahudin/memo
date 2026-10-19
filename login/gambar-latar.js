// Latar piksel layar login & layar kunci, satu per bagian hari.
//
//   gjs -m gambar-latar.js <pagi|siang|sore|malam> <keluaran.png> [lebar tinggi]
//
// Adegan "masuk" mesin sambutan (langit, benda langit, awan, bintang, kota,
// Memo) dibekukan tanpa teks dan konfeti. Memo ditaruh di seperempat atas
// layar: jam layar kunci dan kartu sandi GDM mulai di sepertiga tinggi, tepat
// di bawahnya. Awan ditata tangan supaya tidak menutupi mata Memo dan
// matahari. Malam hari Memo tidur. Bawaan 3072x1728 (layar laptop ini, skala 2): ditampilkan 1:1
// sehingga pecah pikselnya tidak kabur.

import Cairo from 'cairo';
import system from 'system';

import { Layar, MS_LANGKAH } from '../sambutan/layar.js';

// Jam wakil tiap bagian: langitnya sama dengan sambutan pada jam itu.
const JAM = { pagi: 7, siang: 12, sore: 16, malam: 21 };

const [bagian, keluaran, l = '3072', t = '1728'] = ARGV;
if (!(bagian in JAM) || !keluaran) {
    printerr('pakai: gjs -m gambar-latar.js <pagi|siang|sore|malam> <keluaran.png> [lebar tinggi]');
    system.exit(2);
}
const lebar = Number(l), tinggi = Number(t);
const malam = bagian === 'malam';
const T = 3000; // ms sejak tampil: adegan sudah menyala penuh
const layar = new Layar('masuk', {
    lebar, tinggi, tinggiMemo: 0.22,
    waktu: { jam: JAM[bagian], menit: 0, hari: 0, tanggal: 19, bulan: 10 },
});
layar.J = {
    ...layar.J, judul: ' ', sub: ' ', petunjuk: ' ', info: ' ', lama: 1e9,
    // Malam: satu z kecil baru keluar (z besar akan terpotong tepi atas).
    ekspresi: [[0, malam ? 'tidur' : 'netral']], gerak: [], efek: malam ? [['z', T - 6 * MS_LANGKAH]] : [],
};
layar.konfeti = [];
// Tepi kiri awan (bagian lebar) dan dasarnya (bagian tinggi). Laju besar =
// awan diam; _awan() menggeser x sejauh -15 petak, jadi ditambahkan lagi.
const kol = layar.kol, bar = layar.bar;
layar.awan = [[0.05, 0.11, 2], [0.18, 0.24, 1], [0.86, 0.4, 1]].map(([x, y, s]) =>
    ({ x: Math.round(kol * x) + 15, y: Math.round(bar * y), s, laju: 1e9 }));

const s = new Cairo.ImageSurface(Cairo.Format.ARGB32, lebar, tinggi);
const cr = new Cairo.Context(s);
layar.gambar(cr, T);
cr.$dispose();
s.writeToPNG(keluaran);
