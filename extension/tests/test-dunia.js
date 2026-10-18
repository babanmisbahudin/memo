// Jalankan: gjs -m extension/tests/test-dunia.js
import { BAGIAN_NGINTIP, LINGKAR_KURSOR, bolehDi, kurangiInterval, petaDari } from '../hidup/dunia.js';

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

const AREA = { x: 0, y: 32, lebar: 1600, tinggi: 868 };   // dasar di y = 900
const UKURAN = { lebar: 120, tinggi: 72 };
const persepsi = (jendela, kursor = { x: 20, y: 40 }) => ({ areaKerja: AREA, jendela, kursor });

// --- kurangiInterval ---
cek('interval: dua penutup', sama(kurangiInterval([0, 100], [[20, 30], [50, 200]]), [[0, 20], [30, 50]]));
cek('interval: tanpa penutup', sama(kurangiInterval([0, 100], []), [[0, 100]]));
cek('interval: tertutup penuh', sama(kurangiInterval([0, 100], [[-10, 200]]), []));
cek('interval: kosong tetap kosong', sama(kurangiInterval([5, 5], []), []));

// --- desktop kosong ---
let p = petaDari(persepsi([]), UKURAN);
cek('kosong: satu lantai = dasar area kerja', sama(p.lantai, [{ x1: 0, x2: 1600, y: 900, jendelaId: null }]));
cek('kosong: empat tepi layar', p.tepi.length === 4 && p.tepi.every(e => e.jenis === 'layar'));
cek('kosong: tepi kiri/kanan menyembul 40%', p.tepi[0].x === -12 && p.tepi[1].x === 1612 && BAGIAN_NGINTIP === 0.4);
cek('kosong: tepi bawah hanya bagian atas badan yang tampak', p.tepi[2].y === 943 && p.tepi[3].x === 1200);
cek('kosong: tidak hanyaTepi, tidak sembunyi', !p.hanyaTepi && !p.sembunyi);

// --- tiga jendela bertumpuk (urut bawah -> atas) ---
const B = { id: 2, x: 800, y: 150, lebar: 600, tinggi: 350, aplikasi: 'firefox', judul: 'YouTube' };
const C = { id: 3, x: 1200, y: 50, lebar: 300, tinggi: 200, aplikasi: 'spotify', judul: '' };
const A = { id: 1, x: 100, y: 300, lebar: 800, tinggi: 500, aktif: true, aplikasi: 'Code', judul: 'memo' };
p = petaDari(persepsi([B, C, A]), UKURAN);
cek('susun: lantai dasar + atas B (terpotong C) + atas A', sama(p.lantai, [
    { x1: 0, x2: 1600, y: 900, jendelaId: null },
    { x1: 800, x2: 1200, y: 150, jendelaId: 2 },
    { x1: 100, x2: 900, y: 300, jendelaId: 1 },
]));
cek('susun: jendela tanpa ruang di atasnya (C) bukan lantai', !p.lantai.some(L => L.jendelaId === 3));
cek('susun: ngintip dari balik B (tak aktif), bukan dari A (aktif)', sama(p.tepi.filter(e => e.jenis === 'jendela'),
    [{ jenis: 'jendela', sisi: 'atas', x: 980, y: 193, jendelaId: 2 }]));
cek('susun: zona larangan = isi jendela aktif', sama(p.larangan.kotak, [{ x: 100, y: 300, lebar: 800, tinggi: 500 }]));
cek('susun: lingkar kursor 160 px', p.larangan.kursor.r === LINGKAR_KURSOR && LINGKAR_KURSOR === 160);

// --- bolehDi ---
cek('boleh berdiri di atas jendela aktif (isinya tidak tertutup)', bolehDi(p, { x: 500, y: 300 }, UKURAN));
cek('tidak boleh di dalam isi jendela aktif', !bolehDi(p, { x: 500, y: 600 }, UKURAN));
cek('boleh ngintip dari balik B', bolehDi(p, { x: 980, y: 193, jenis: 'jendela' }, UKURAN));
const dekatKursor = petaDari(persepsi([B, C, A], { x: 1000, y: 880 }), UKURAN);
cek('tidak boleh di lingkar kursor', !bolehDi(dekatKursor, { x: 1000, y: 900 }, UKURAN));
cek('boleh di luar lingkar kursor', bolehDi(dekatKursor, { x: 1300, y: 900 }, UKURAN));

// --- jendela aktif memenuhi layar ---
const M = { id: 1, x: 0, y: 32, lebar: 1600, tinggi: 868, aktif: true, maksimal: true, aplikasi: 'Code', judul: '' };
p = petaDari(persepsi([B, M]), UKURAN);
cek('maximize: hanyaTepi, tanpa lantai', p.hanyaTepi && p.lantai.length === 0);
cek('maximize: hanya tepi layar', p.tepi.length === 4 && p.tepi.every(e => e.jenis === 'layar'));
cek('maximize: tepi layar boleh walau menimpa pinggir jendela aktif', bolehDi(p, { ...p.tepi[1] }, UKURAN));
cek('maximize: dasar tetap terlarang', !bolehDi(p, { x: 800, y: 900 }, UKURAN));
const kursorDiKanan = petaDari(persepsi([B, M], { x: 1550, y: 880 }), UKURAN);
cek('maximize: lingkar kursor tetap berlaku di tepi', !bolehDi(kursorDiKanan, { ...kursorDiKanan.tepi[1] }, UKURAN));
p = petaDari(persepsi([{ ...M, maksimal: false }]), UKURAN);
cek('jendela seukuran area kerja (tanpa tanda maksimal) juga hanyaTepi', p.hanyaTepi);

// --- layar penuh ---
p = petaDari(persepsi([B, { ...A, layarPenuh: true }]), UKURAN);
cek('aplikasi layar penuh -> sembunyi', p.sembunyi);

console.log(`\n${lolos} lolos, ${gagal} gagal`);
if (gagal)
    throw new Error(`${gagal} gagal`);
