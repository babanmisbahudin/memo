// Jalankan: gjs -m sambutan/tests/test-layar.js
//
// Merekam adegan sambutan bingkai demi bingkai (tanpa GNOME) dan memeriksa:
// island membesar jadi layar penuh, gambar terkunci ke petak piksel, tiap
// penutup berakhir hitam/kosong sesuai jenisnya, Esc bisa menyela penutup,
// dan semua teks bisa ditulis dengan huruf piksel.
import Cairo from 'cairo';
import Gdk from 'gi://Gdk?version=4.0';
import system from 'system';

import { HURUF, lebarTeks } from '../hurufPiksel.js';
import { Layar, MS_LANGKAH, NAMA_JENIS, PEMBUKA, bagianHari, ukuranPetak } from '../layar.js';

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

const L = 1600, T = 900;
const WAKTU = { jam: 21, menit: 5, hari: 0, tanggal: 18, bulan: 10 };

function rekam(layar, t) {
    const s = new Cairo.ImageSurface(Cairo.Format.ARGB32, L, T);
    const cr = new Cairo.Context(s);
    layar.gambar(cr, t);
    cr.$dispose();
    s.flush();
    const pb = Gdk.pixbuf_get_from_surface(s, 0, 0, L, T);
    const px = pb.get_pixels(), baris = pb.get_rowstride();
    return (x, y) => {
        const i = y * baris + x * 4;
        return [px[i], px[i + 1], px[i + 2], px[i + 3]];
    };
}
const kisi = Array.from({ length: 8 }, (_, i) => Array.from({ length: 6 },
    (__, j) => [Math.round((i + 0.5) * L / 8), Math.round((j + 0.5) * T / 6)])).flat();
const semua = (p, syarat) => kisi.every(([x, y]) => syarat(p(x, y)));
const kosong = c => c[3] === 0;
const hitam = c => c[3] === 255 && c[0] === 0 && c[1] === 0 && c[2] === 0;
const pejal = c => c[3] === 255;

const S = ukuranPetak(L, T);
cek('petak: ±108 petak setinggi layar', S === 8);

for (const jenis of NAMA_JENIS) {
    const layar = new Layar(jenis, { lebar: L, tinggi: T, waktu: WAKTU });

    // Pembuka: island kecil di tengah atas, sisanya desktop (transparan).
    let p = rekam(layar, 0);
    cek(`${jenis}: awal = island hitam di tengah atas`, hitam(p(L / 2, 4)));
    cek(`${jenis}: awal = pojok & tengah layar masih desktop`, kosong(p(4, T - 4)) && kosong(p(L / 2, T / 2)));
    p = rekam(layar, (PEMBUKA / 2) * MS_LANGKAH);
    cek(`${jenis}: di tengah pembuka island sudah besar tapi belum penuh`,
        pejal(p(L / 2, T / 4)) && kosong(p(2, T - 2)));

    // Adegan: layar penuh, tanpa celah transparan.
    p = rekam(layar, 1800);
    cek(`${jenis}: adegan memenuhi seluruh layar`, semua(p, pejal));
    // Gaya piksel: langit di pojok kiri atas seragam per petak S×S.
    let rata = true;
    for (let cy = 0; cy < 6; cy++) {
        for (let cx = 0; cx < 6; cx++) {
            const a = p(cx * S, cy * S).join();
            for (let k = 1; k < S && rata; k++)
                rata = p(cx * S + k, cy * S + (k * 3) % S).join() === a;
        }
    }
    cek(`${jenis}: langit terkunci ke petak ${S}×${S}`, rata);

    // Penutup lanjut: login kembali kosong (desktop), lainnya hitam.
    cek(`${jenis}: tutup lanjut diterima`, layar.tutup(2000, true));
    cek(`${jenis}: tutup lanjut kedua diabaikan`, !layar.tutup(2050, true));
    let akhir = 2000;
    while (!layar.selesai(akhir) && akhir < 6000)
        akhir += MS_LANGKAH / 2;
    cek(`${jenis}: penutup selesai < 2 detik (${Math.round(akhir - 2000)} ms)`, akhir - 2000 < 2000);
    cek(`${jenis}: total tampil + penutup < 6,5 detik`, layar.J.lama + (akhir - 2000) < 6500);
    p = rekam(layar, akhir + 100);
    if (jenis === 'masuk')
        cek('masuk: sesudah penutup layar kosong lagi (desktop)', semua(p, kosong) && !layar.gelapAkhir);
    else
        cek(`${jenis}: sesudah penutup layar hitam pekat sampai sesi berakhir`, semua(p, hitam) && layar.gelapAkhir);
    // Di tengah penutup masih ada gambar (bukan langsung hilang).
    p = rekam(layar, 2000 + 2 * MS_LANGKAH);
    // (CRT memepatkan gambar jadi pita di tengah, jadi baris tengah ikut dicuplik.)
    const tengah = Array.from({ length: 32 }, (_, i) => [Math.round((i + 0.5) * L / 32), T / 2]);
    cek(`${jenis}: penutup beranimasi`, [...kisi, ...tengah].some(([x, y]) => !hitam(p(x, y)) && !kosong(p(x, y))));

    // Esc membatalkan: island mengecil, lalu desktop kembali.
    const batal = new Layar(jenis, { lebar: L, tinggi: T, waktu: WAKTU });
    cek(`${jenis}: Esc diterima`, batal.tutup(1500, false) && batal.cara === 'batal');
    cek(`${jenis}: klik sesudah Esc diabaikan`, !batal.tutup(1550, true));
    p = rekam(batal, 1500 + 7 * MS_LANGKAH);
    cek(`${jenis}: sesudah batal layar kosong lagi`, batal.selesai(1500 + 7 * MS_LANGKAH) && semua(p, kosong));
}

// Esc menyela penutup yang sedang berjalan (shutdown masih bisa dibatalkan).
const sela = new Layar('matikan', { lebar: L, tinggi: T, waktu: WAKTU });
sela.tutup(2000, true);
cek('Esc menyela penutup CRT yang belum selesai', sela.tutup(2300, false) && sela.cara === 'batal');
const telat = new Layar('matikan', { lebar: L, tinggi: T, waktu: WAKTU });
telat.tutup(2000, true);
cek('Esc sesudah penutup selesai diabaikan', !telat.tutup(5000, false) && telat.cara === 'crt');

// Ukuran jendela berubah: keadaan penutup ikut dibawa.
const baru = new Layar('keluar', { lebar: 1280, tinggi: 720, waktu: WAKTU, dari: sela });
cek('Layar baru (ukuran berubah) membawa keadaan penutup', baru.tutupPada === 2300 && baru.cara === 'batal');

cek('bagian hari', bagianHari(4) === 'pagi' && bagianHari(11) === 'siang' && bagianHari(15) === 'sore' &&
    bagianHari(18) === 'malam' && bagianHari(2) === 'malam');

// Semua teks (semua jam, hari, tanggal, bulan) tertulis tanpa huruf cadangan '?'.
const tanpaHuruf = new Set();
for (let jam = 0; jam < 24; jam++) {
    for (let hari = 0; hari < 7; hari++) {
        for (let bulan = 1; bulan <= 12; bulan++) {
            for (const jenis of NAMA_JENIS) {
                const { J } = new Layar(jenis, { lebar: 64, tinggi: 36,
                    waktu: { jam, menit: 59, hari, tanggal: 31, bulan } });
                for (const teks of [J.judul, J.sub, J.info ?? '', J.petunjuk]) {
                    for (const c of teks) {
                        if (!HURUF[c])
                            tanpaHuruf.add(c);
                    }
                }
            }
        }
    }
}
cek(`semua huruf teks ada di huruf piksel (kurang: ${[...tanpaHuruf].join(' ')})`, tanpaHuruf.size === 0);
cek('huruf piksel: tinggi 7 (atau 9 berekor), lebar baris seragam', Object.values(HURUF).every(b =>
    (b.length === 7 || b.length === 8 || b.length === 9) && b.every(r => r.length === b[0].length && /^[#.]+$/.test(r))));
cek('lebarTeks: A = 5u, AA = 11u', lebarTeks('A', 3) === 15 && lebarTeks('AA', 3) === 33);

console.log(`${lolos} lolos, ${gagal} gagal`);
if (gagal)
    system.exit(1);
