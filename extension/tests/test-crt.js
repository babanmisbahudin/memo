// Jalankan: gjs -m extension/tests/test-crt.js
import Cairo from 'cairo';
import Gdk from 'gi://Gdk?version=4.0';

import { LATAR, WARNA_KEADAAN, WARNA_LATAR, gambarCrt, jalurTangga, muatkan, normalkan, tulisBercahaya, warnaHue } from '../crt.js';
import { lebarTeks } from '../hurufPiksel.js';

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

function gambar(l, t, fn) {
    const s = new Cairo.ImageSurface(Cairo.Format.ARGB32, l, t);
    const cr = new Cairo.Context(s);
    fn(cr);
    cr.$dispose();
    s.flush();
    const pb = Gdk.pixbuf_get_from_surface(s, 0, 0, l, t);
    const px = pb.get_pixels(), baris = pb.get_rowstride();
    return (x, y) => {
        const i = y * baris + x * 4;
        return [px[i], px[i + 1], px[i + 2], px[i + 3]];
    };
}
const terang = c => c[0] + c[1] + c[2];

// --- jalur bersudut tangga ---
let p = gambar(200, 40, cr => {
    jalurTangga(cr, 200, 40, { s: 2, atas: 0, bawah: 4 });
    cr.setSourceRGB(1, 1, 1);
    cr.fill();
});
cek('tangga: pojok kiri bawah kosong', p(0, 39)[3] === 0 && p(7, 39)[3] === 0);
cek('tangga: anak tangga terbawah mulai di x = 8', p(8, 39)[3] === 255);
cek('tangga: anak tangga berikutnya mulai di x = 6', p(5, 37)[3] === 0 && p(6, 37)[3] === 255);
cek('tangga: pojok kanan bawah simetris', p(199, 39)[3] === 0 && p(191, 39)[3] === 255 && p(192, 39)[3] === 0);
cek('tangga: sudut atas tetap siku (atas = 0)', p(0, 0)[3] === 255 && p(199, 0)[3] === 255);
p = gambar(40, 40, cr => {
    jalurTangga(cr, 40, 40, { s: 2, atas: 2, bawah: 0 });
    cr.setSourceRGB(1, 1, 1);
    cr.fill();
});
cek('tangga: sudut atas bisa bertangga juga', p(0, 0)[3] === 0 && p(4, 0)[3] === 255 && p(0, 39)[3] === 255);

// --- latar CRT ---
p = gambar(200, 40, cr => gambarCrt(cr, 200, 40, { warna: WARNA_KEADAAN.diam }));
cek('latar: tengah hitam fosfor', terang(p(100, 21)) < 40 && Math.abs(p(100, 21)[0] - LATAR[0]) < 12);
cek('latar: pojok tangga tetap transparan', p(0, 39)[3] === 0);
const pm = gambar(200, 40, cr => gambarCrt(cr, 200, 40, { warna: WARNA_KEADAAN.diam, latar: WARNA_LATAR.marun }));
cek('warna island: latar marun dipakai', pm(100, 21)[0] > pm(100, 21)[2] + 10 && pm(100, 21)[0] >= 25);
cek('warna island: semua latar gelap (teks putih terbaca)', Object.values(WARNA_LATAR).every(c => c[0] + c[1] + c[2] < 120));
cek('latar: pendar tepi berwarna keadaan (hijau)', p(1, 21)[1] > p(1, 21)[0] + 10 && terang(p(1, 21)) > terang(p(100, 21)));
cek('latar: scanline tiap 4 px', terang(p(100, 4)) > terang(p(100, 6)));
const biru = gambar(200, 40, cr => gambarCrt(cr, 200, 40, { warna: WARNA_KEADAAN.kerja }));
cek('latar: warna keadaan bekerja = biru', biru(1, 21)[2] > biru(1, 21)[0] + 10);
const sapu = gambar(200, 40, cr => gambarCrt(cr, 200, 40, { warna: WARNA_KEADAAN.kerja, sapuan: 0.5 }));
cek('latar: garis sapuan menerangi pitanya', terang(sapu(100, 21)) > terang(biru(100, 21)) + 10);

// --- teks bercahaya ---
p = gambar(40, 30, cr => {
    cr.setSourceRGB(0, 0, 0);
    cr.paint();
    tulisBercahaya(cr, 'A', 10, 10, 2, [126, 231, 135]);
});
cek('teks: piksel huruf menyala penuh', p(12, 10)[1] > 200);
cek('teks: pendar di sekeliling huruf', p(12, 8)[1] > 20 && p(12, 8)[1] < 150);
cek('teks: jauh dari huruf tetap gelap', terang(p(35, 25)) === 0);

// --- normalkan & muatkan ---
cek('normalkan: tanda pisah & elipsis', normalkan('Kopi — 3 cangkir…') === 'Kopi - 3 cangkir...');
cek('normalkan: jam GNOME (rasio U+2236, spasi tipis)', normalkan('08\u{2236}23') === '08:23' && normalkan('8\u{2236}23\u{202f}AM') === '8:23 AM');
cek('normalkan: minus & tanda kutip', normalkan('+2 −1 “ok” ‘ya’') === '+2 -1 "ok" \'ya\'');
cek('normalkan: huruf beraksen jadi dasar', normalkan('café Ñandú') === 'cafe Nandu');
cek('normalkan: tanda baca umum dikenal', normalkan('50% @memo #1 [a] {b} a=b <> | * & ; ~ $ ^ _ \\') !== null);
cek('normalkan: emoji -> null (pakai huruf biasa)', normalkan('Hallo 👋') === null);
cek('normalkan: kosong', normalkan('') === '' && normalkan(null) === '');
const panjang = 'claude · toko — checkout.js +2 -1 dan masih banyak lagi';
const m = muatkan(panjang, 2, 200);
cek('muatkan: muat di lebar & diakhiri ...', lebarTeks(m, 2) <= 200 && m.endsWith('...'));
cek('muatkan: teks pendek tidak diubah', muatkan('halo', 2, 200) === 'halo');

const hijau = warnaHue(120), merahMuda = warnaHue(330);
cek('warnaHue 120 = hijau fosfor', hijau[1] > 220 && hijau[0] < 140 && hijau[2] < 140);
cek('warnaHue 330 = merah muda', merahMuda[0] > 220 && merahMuda[2] > merahMuda[1]);
cek('warnaHue selalu 0..255', [0, 45, 205, 280, 359].every(h => warnaHue(h).every(v => v >= 0 && v <= 255)));

console.log(`\n${lolos} lolos, ${gagal} gagal`);
if (gagal)
    throw new Error(`${gagal} gagal`);
