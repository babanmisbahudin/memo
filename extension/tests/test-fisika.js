// Jalankan: gjs -m extension/tests/test-fisika.js
import {
    BATAS_IKUT, JANGKAU_NAIK, LOMPAT_KECIL, angkat, badanBaru, langkah, langkahJalan, lempar,
    mulaiLompat, ngintip, rencanaLompat, rute, titikDi,
} from '../hidup/fisika.js';

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
const L = UKURAN.lebar;
const DASAR = { x1: 0, x2: 1600, y: 900, jendelaId: null };
const J5 = { x1: 200, x2: 600, y: 600, jendelaId: 5 };
const J6 = { x1: 700, x2: 1100, y: 300, jendelaId: 6 };
const peta = (lantai, tepi = []) => ({ areaKerja: AREA, lantai, tepi, hanyaTepi: false, sembunyi: false });
const P = peta([DASAR, J5, J6]);

// Jalankan langkah sampai syarat terpenuhi; kembalikan jejak.
function jalankan(badan, pt, sampai, { maks = 80, gerakJendela } = {}) {
    const jejak = [];
    let b = badan;
    for (let i = 0; i < maks; i++) {
        const r = langkah(b, pt, { ukuran: UKURAN, gerakJendela });
        b = r.badan;
        jejak.push({ ...b, kejadian: r.kejadian });
        if (sampai(b, r.kejadian))
            break;
    }
    return { b, jejak };
}
const bulatSemua = jejak => jejak.every(j => Number.isInteger(j.x) && Number.isInteger(j.y));

// --- jatuh ---
let { b, jejak } = jalankan(badanBaru(1300, 100), P, x => x.keadaan === 'berdiri');
cek('jatuh: mendarat di dasar layar', b.y === 900 && b.pijakan === null);
cek('jatuh: ada kejadian mendarat', jejak.at(-1).kejadian.includes('mendarat'));
cek('jatuh: posisi selalu piksel bulat', bulatSemua(jejak));
({ b } = jalankan(badanBaru(400, 100), P, x => x.keadaan === 'berdiri'));
cek('jatuh: mendarat di lantai pertama yang dilintasi (atas jendela 5)', b.y === 600 && b.pijakan === 5);

// --- lompat berbusur ---
const berdiri = { ...badanBaru(300, 900), keadaan: 'berdiri', pijakan: null };
const tujuan = titikDi(J5, 400, L);
cek('titikDi menjepit supaya badan tidak menjulur', sama(titikDi(J5, 590, L), { x: 540, y: 600, jendelaId: 5 }));
const melompat = mulaiLompat(berdiri, tujuan);
cek('lompat: dalam jangkauan -> busur', melompat?.keadaan === 'melompat');
({ b, jejak } = jalankan(melompat, P, x => x.keadaan !== 'melompat'));
cek('lompat: tiba tepat di tujuan dan berdiri', b.keadaan === 'berdiri' && b.x === 400 && b.y === 600 && b.pijakan === 5);
cek('lompat: busur naik melewati tujuan', Math.min(...jejak.map(j => j.y)) < 600);
cek('lompat: piksel bulat', bulatSemua(jejak));
cek('lompat: terlalu tinggi -> null', mulaiLompat(berdiri, titikDi(J6, 800, L)) === null && 900 - 300 > JANGKAU_NAIK);
cek('lompat: terlalu jauh -> null', rencanaLompat({ x: 0, y: 900 }, { x: 600, y: 900 }) === null);
cek('lompat kecil rendah & cepat', rencanaLompat({ x: 0, y: 900 }, { x: 40, y: 900 }).n === 3);

// --- jalan ---
cek('jalan: satu langkah kecil ke arah tujuan', langkahJalan(berdiri, 500).x === 300 + LOMPAT_KECIL);
cek('jalan: langkah terakhir tidak kebablasan', langkahJalan(berdiri, 310).x === 310);
cek('jalan: ke kiri', langkahJalan(berdiri, 0).x === 300 - LOMPAT_KECIL);

// --- berdiri, lantai hilang, ikut jendela ---
const diJ5 = { ...badanBaru(400, 600), keadaan: 'berdiri', pijakan: 5 };
cek('berdiri: lantai ada -> tetap', langkah(diJ5, P, { ukuran: UKURAN }).badan.keadaan === 'berdiri');
let r = langkah(diJ5, peta([DASAR, J6]), { ukuran: UKURAN });
cek('berdiri: jendela ditutup -> jatuh', r.badan.keadaan === 'jatuh' && r.kejadian.includes('jatuh'));
({ b } = jalankan(r.badan, peta([DASAR, J6]), x => x.keadaan === 'berdiri'));
cek('berdiri: lalu mendarat di dasar', b.y === 900);
const J5geser = { ...J5, x1: 210, x2: 610, y: 595 };
r = langkah(diJ5, peta([DASAR, J5geser, J6]), { ukuran: UKURAN, gerakJendela: new Map([[5, { dx: 10, dy: -5 }]]) });
cek('ikut jendela yang digeser pelan', r.badan.keadaan === 'berdiri' && r.badan.x === 410 && r.badan.y === 595);
r = langkah(diJ5, P, { ukuran: UKURAN, gerakJendela: new Map([[5, { dx: BATAS_IKUT + 60, dy: 0 }]]) });
cek('jendela digeser cepat -> terjatuh', r.badan.keadaan === 'jatuh');

// --- dilempar & memantul ---
({ b, jejak } = jalankan(lempar({ ...badanBaru(1500, 500), keadaan: 'diangkat' }, 80, -20), P,
    x => x.keadaan === 'berdiri'));
const pantul = jejak.find(j => j.kejadian.includes('pantul'));
cek('lempar: memantul di tepi kanan layar', pantul && pantul.x === 1540 && pantul.vx < 0);
cek('lempar: mendarat keras', b.keadaan === 'berdiri' && jejak.at(-1).kejadian.includes('mendaratKeras'));
cek('lempar: tidak pernah keluar layar', jejak.every(j => j.x >= 60 && j.x <= 1540));

// --- diangkat & ngintip ---
const diangkat = angkat(diJ5, 800, 400);
cek('diangkat: fisika diam', sama(langkah(diangkat, P, { ukuran: UKURAN }).badan, diangkat));
const tepiJ7 = { jenis: 'jendela', sisi: 'atas', x: 980, y: 193, jendelaId: 7 };
const intip = ngintip(diJ5, tepiJ7);
cek('ngintip: diam selama jendelanya masih ada', langkah(intip, peta([DASAR], [tepiJ7]), { ukuran: UKURAN }).badan.keadaan === 'ngintip');
cek('ngintip: jendela hilang -> jatuh', langkah(intip, peta([DASAR], []), { ukuran: UKURAN }).badan.keadaan === 'jatuh');
const intipLayar = ngintip(diJ5, { jenis: 'layar', sisi: 'kanan', x: 1612, y: 900, jendelaId: null });
cek('ngintip tepi layar: tetap', langkah(intipLayar, P, { ukuran: UKURAN }).badan.keadaan === 'ngintip');

// --- rute ---
cek('rute: lewat lantai perantara', sama(rute({ x: 300, y: 900 }, { x: 900, y: 300 }, P, L), [
    { jenis: 'jalan', ke: { x: 400, y: 900, jendelaId: null } },
    { jenis: 'lompat', ke: { x: 400, y: 600, jendelaId: 5 } },
    { jenis: 'jalan', ke: { x: 540, y: 600, jendelaId: 5 } },
    { jenis: 'lompat', ke: { x: 760, y: 300, jendelaId: 6 } },
    { jenis: 'jalan', ke: { x: 900, y: 300, jendelaId: 6 } },
]));
cek('rute: lantai yang sama -> jalan saja', sama(rute({ x: 300, y: 900 }, { x: 1000, y: 900 }, P, L),
    [{ jenis: 'jalan', ke: { x: 1000, y: 900, jendelaId: null } }]));
cek('rute: sudah di tujuan -> kosong', sama(rute({ x: 300, y: 900 }, { x: 300, y: 900 }, P, L), []));
cek('rute: tak terjangkau -> null', rute({ x: 300, y: 900 }, { x: 900, y: 300 }, peta([DASAR, J6]), L) === null);
cek('rute: tujuan bukan lantai -> null', rute({ x: 300, y: 900 }, { x: 900, y: 450 }, P, L) === null);
cek('rute: berdiri di luar lantai peta -> satu lompatan bila terjangkau',
    sama(rute({ x: 800, y: 900 }, { x: 400, y: 600 }, peta([J5, J6]), L), [{ jenis: 'lompat', ke: { x: 400, y: 600, jendelaId: 5 } }]));

console.log(`\n${lolos} lolos, ${gagal} gagal`);
if (gagal)
    throw new Error(`${gagal} gagal`);
