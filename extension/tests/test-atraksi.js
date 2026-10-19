// Jalankan: gjs -m extension/tests/test-atraksi.js
import { ATRAKSI, P, bingkai, kotakBebas, lamaAtraksi, putarGambar, rencanaAtraksi, rencanakan } from '../hidup/atraksi.js';
import { petaDari } from '../hidup/dunia.js';

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

const UKURAN = { lebar: 120, tinggi: 72 };
const acakDari = benih => () => ((benih = (benih * 16807) % 2147483647) - 1) / 2147483646;
const A = { x: 0, y: 32, lebar: 1536, tinggi: 832 };
const bawah = A.y + A.tinggi;
// Satu jendela tak aktif di kanan, kursor jauh di pojok kiri bawah.
const persepsi = (lain = {}) => ({
    areaKerja: A, kursor: { x: 20, y: 840 },
    jendela: [{ id: 7, x: 900, y: 400, lebar: 500, tinggi: 300, aktif: false, maksimal: false, layarPenuh: false, aplikasi: 'x', judul: 'y' }],
    ...lain,
});
const peta = petaDari(persepsi(), UKURAN);
const c = (lain = {}) => ({ peta, ukuran: UKURAN, posisi: { x: 700, y: bawah }, acak: acakDari(5), berdiri: true, ...lain });

for (const nama of ATRAKSI) {
    const r = rencanakan(nama, c());
    cek(`${nama}: ada rencana di layar lapang`, r?.jenis === 'atraksi' && r.nama === nama);
    if (!r)
        continue;
    const n = lamaAtraksi(r);
    const semua = Array.from({ length: n + 2 }, (_, f) => bingkai(r, f));
    cek(`${nama}: selesai tepat waktu`, !semua[n - 1].selesai && semua[n].selesai);
    const lepas = semua.filter(b => b.lepas);
    cek(`${nama}: badan diserahkan ke fisika tepat sekali`, lepas.length === 1);
    const iLepas = semua.findIndex(b => b.lepas);
    cek(`${nama}: sebelum lepas badan dikendalikan, sesudahnya tidak`,
        semua.slice(0, iLepas).every(b => b.badan) && semua.slice(iLepas).every(b => !b.badan));
    cek(`${nama}: putaran per 10 derajat, sedang`, semua.every(b => !b.badan || (b.badan.rz % 10 === 0 && Math.abs(b.badan.rz) <= 30)));
    cek(`${nama}: piksel di kisi bilangan bulat`, semua.every(b => b.piksel.every(([x, y, w]) => Number.isInteger(x) && Number.isInteger(y) && w.length === 3)));
    cek(`${nama}: badan & properti tetap di area kerja`, semua.every(b =>
        (!b.badan || (b.badan.x >= A.x && b.badan.x <= A.x + A.lebar && b.badan.y <= bawah)) &&
        b.piksel.every(([, y]) => y * P >= A.y - P && y * P <= bawah)));
    cek(`${nama}: punya properti yang tampak`, semua.some(b => b.piksel.length > 20));
    // Langkah badan halus kecuali saat menyelinap (pindah tempat) & lepas.
    let lompat = 0;
    for (let f = 1; f < iLepas; f++) {
        const a = semua[f - 1].badan, b = semua[f].badan;
        if (Math.hypot(b.x - a.x, b.y - a.y) > 40 && !(a.sy === 0 || b.sy < 1))
            lompat++;
    }
    cek(`${nama}: tidak ada lompatan posisi mendadak`, lompat === 0);
    cek(`${nama}: deterministik`, JSON.stringify(bingkai(r, 40)) === JSON.stringify(bingkai(r, 40)));
}

const ay = rencanakan('ayunan', c());
const ayun = Array.from({ length: lamaAtraksi(ay) }, (_, f) => bingkai(ay, f)).filter(b => b.badan);
cek('ayunan: berayun sampai ±30 derajat ke dua arah', ayun.some(b => b.badan.rz === 30) && ayun.some(b => b.badan.rz === -30));
const ayD = bingkai(ay, 30);
cek('ayunan: badan duduk di kursi (searah putaran tali)', ayD.badan.rz !== 0 && Math.sign(ayD.badan.x - ay.ax) === -Math.sign(ayD.badan.rz) * 1 || ayD.badan.rz === 0);

const gl = rencanakan('gelantungan', c());
const glB = Array.from({ length: lamaAtraksi(gl) }, (_, f) => bingkai(gl, f)).filter(b => b.badan);
cek('gelantungan: pull-up mengangkat badan', Math.min(...glB.map(b => b.badan.y)) < Math.max(...glB.slice(6).map(b => b.badan.y)) - 10);

const tj = rencanakan('terjun', c());
const tjB = Array.from({ length: lamaAtraksi(tj) }, (_, f) => bingkai(tj, f)).filter(b => b.badan).slice(7);
cek('terjun: turun terus', tjB.every((b, i) => i === 0 || b.badan.y >= tjB[i - 1].badan.y - 6));
cek('terjun: mendarat tepat di lantai tujuan', tjB.at(-1).badan.x === tj.tx && tjB.at(-1).badan.y === tj.ty - 1);

const mb = rencanakan('mobil', c());
cek('mobil: menyetir ke ujung lantai yang jauh', Math.abs(mb.ke - mb.dari) >= 200 && mb.arah === Math.sign(mb.ke - mb.dari));
const roda = [bingkai(mb, 10), bingkai(mb, 11)].map(b => JSON.stringify(b.piksel.filter(p => p[2][0] === 170)));
cek('mobil: velg berputar', roda[0] !== roda[1]);
cek('mobil: perlu berdiri di lantai', rencanakan('mobil', c({ berdiri: false })) === null && rencanakan('mobil', c({ posisi: { x: 700, y: 500 } })) === null);

// Jendela aktif memenuhi layar / kursor di atas -> tidak ada atraksi di sana.
const penuh = petaDari(persepsi({ jendela: [{ id: 1, x: 0, y: 32, lebar: 1536, tinggi: 832, aktif: true, maksimal: true, layarPenuh: false, aplikasi: 'x', judul: 'y' }] }), UKURAN);
cek('jendela aktif dimaksimalkan -> tidak ada atraksi', rencanaAtraksi(c({ peta: penuh })) === null);
const kiri = petaDari(persepsi({ jendela: [{ id: 1, x: 0, y: 32, lebar: 1536, tinggi: 600, aktif: true, maksimal: false, layarPenuh: false, aplikasi: 'x', judul: 'y' }] }), UKURAN);
cek('tepi atas tertutup jendela aktif -> tanpa ayunan/gelantungan/terjun',
    ['ayunan', 'gelantungan', 'terjun'].every(n => rencanakan(n, c({ peta: kiri })) === null));
const pojok = petaDari(persepsi({ kursor: { x: 0, y: 0 } }), UKURAN);
cek('Memo di dekat tepi kiri, kursor di pojok: mobil & terjun tetap bisa',
    rencanakan('mobil', c({ peta: pojok, posisi: { x: 60, y: bawah } })) !== null && rencanakan('terjun', c({ peta: pojok, posisi: { x: 60, y: bawah } })) !== null);
cek('kotakBebas: lingkar kursor', !kotakBebas(peta, 0, 780, 60, 860) && kotakBebas(peta, 600, 100, 700, 200));
cek('rencanaAtraksi menghindari yang terakhir bila ada pilihan lain', rencanaAtraksi(c(), 'ayunan').nama !== 'ayunan');
cek('putarGambar 0 derajat = sama', putarGambar(new Map([['1,2', [1, 2, 3]]]), 0).get('1,2')[0] === 1);
cek('putarGambar 90 derajat searah jarum jam', putarGambar(new Map([['3,0', [9, 9, 9]]]), 90).has('-1,3'));

console.log(`\n${lolos} lolos, ${gagal} gagal`);
if (gagal)
    throw new Error(`${gagal} gagal`);
