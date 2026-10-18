// Badan Memo: gravitasi, lompatan berbusur, jatuh, terbawa jendela yang
// digeser, dilempar & memantul, dan rute lompatan antar lantai. Murni (tanpa
// St/Clutter/Meta). Satu langkah = 1/12 detik, sama dengan gaya piksel
// island; posisi selalu dibulatkan ke piksel.
//
// Titik badan = tengah bawah ("kaki"), sama dengan dunia.js. `peta` adalah
// keluaran dunia.petaDari().
//
// badan.keadaan:
//   berdiri   di lantai; pijakan = jendelaId (null = dasar layar)
//   melompat  mengikuti busur menuju titik pijak
//   jatuh     gravitasi sampai menyentuh lantai
//   dilempar  seperti jatuh, tapi memantul di tepi layar
//   diangkat  diseret kursor; fisika diam
//   ngintip   menempel di tepi (badan.tepi); fisika diam

export const LANGKAH_PER_DETIK = 12;
export const GRAVITASI = 9;          // piksel per langkah²
export const JANGKAU_X = 480;        // jarak mendatar terjauh satu lompatan
export const JANGKAU_NAIK = 320;     // kenaikan tertinggi satu lompatan
export const LOMPAT_KECIL = 40;      // satu "langkah jalan"
export const BATAS_IKUT = 40;        // jendela bergeser > ini per langkah -> Memo jatuh
export const REDAM_PANTUL = 0.5;

const bulat = v => Math.round(v);
const jepit = (v, a, b) => Math.min(b, Math.max(a, v));

export function badanBaru(x, y) {
    return { x: bulat(x), y: bulat(y), vx: 0, vy: 0, keadaan: 'jatuh', pijakan: undefined, busur: null, tepi: null };
}

// Titik pijak di lantai L yang paling dekat ke x, tanpa badan menjulur keluar.
export function titikDi(L, x, l) {
    return { x: bulat(jepit(x, L.x1 + l / 2, L.x2 - l / 2)), y: L.y, jendelaId: L.jendelaId };
}

const cocok = (L, p, l) => L.y === p.y && p.x >= L.x1 + l / 2 - 1 && p.x <= L.x2 - l / 2 + 1;

// Lantai fisik: lantai di peta + dasar layar sebagai lantai cadangan, supaya
// Memo yang jatuh selalu mendarat walau dasar sedang bukan tujuan yang boleh.
function lantaiFisik(peta) {
    const A = peta.areaKerja;
    return [...peta.lantai, { x1: A.x, x2: A.x + A.lebar, y: A.y + A.tinggi, jendelaId: null }];
}

export function mulaiJatuh(badan) {
    return { ...badan, keadaan: 'jatuh', vx: 0, vy: 0, pijakan: undefined, busur: null, tepi: null };
}

export function angkat(badan, x, y) {
    return { ...badan, x: bulat(x), y: bulat(y), vx: 0, vy: 0, keadaan: 'diangkat', pijakan: undefined, busur: null, tepi: null };
}

export function lempar(badan, vx, vy) {
    return { ...badan, vx, vy, keadaan: 'dilempar', pijakan: undefined, busur: null, tepi: null };
}

export function ngintip(badan, tepi) {
    return { ...badan, x: tepi.x, y: tepi.y, vx: 0, vy: 0, keadaan: 'ngintip', pijakan: tepi.jendelaId, busur: null, tepi: { ...tepi } };
}

// Busur dari titik `dari` ke titik pijak `ke`, atau null bila di luar jangkauan.
// Puncak ±36 px di atas titik yang lebih tinggi; lompatan kecil ("jalan")
// rendah dan cepat.
export function rencanaLompat(dari, ke) {
    const dx = ke.x - dari.x, naik = dari.y - ke.y;
    if (Math.abs(dx) > JANGKAU_X || naik > JANGKAU_NAIK)
        return null;
    const jarak = Math.hypot(dx, naik);
    const kecil = jarak <= LOMPAT_KECIL * 1.5;
    return {
        dari: { x: dari.x, y: dari.y }, ke: { x: ke.x, y: ke.y, jendelaId: ke.jendelaId ?? null },
        n: kecil ? 3 : Math.max(4, Math.min(12, Math.round(4 + jarak / 60))),
        h: kecil ? 8 : Math.abs(naik) / 2 + 36,
        i: 0,
    };
}

export function mulaiLompat(badan, ke) {
    const busur = rencanaLompat(badan, ke);
    if (!busur)
        return null;
    return { ...badan, keadaan: 'melompat', busur, pijakan: undefined, vx: 0, vy: 0, tepi: null };
}

// Titik lompatan kecil berikutnya menuju keX di lantai yang sama.
export function langkahJalan(badan, keX) {
    const dx = keX - badan.x;
    return { x: bulat(badan.x + Math.sign(dx) * Math.min(LOMPAT_KECIL, Math.abs(dx))), y: badan.y, jendelaId: badan.pijakan ?? null };
}

// Satu langkah fisika. gerakJendela: Map jendelaId -> {dx, dy} sejak langkah
// lalu (jendela digeser pengguna). Mengembalikan { badan, kejadian } dengan
// kejadian berisi 'mendarat', 'mendaratKeras', 'jatuh', 'pantul'.
export function langkah(badan, peta, { ukuran, gerakJendela = new Map() }) {
    const l = ukuran.lebar, t = ukuran.tinggi, A = peta.areaKerja;
    const fisik = lantaiFisik(peta);
    let b = { ...badan };
    const kejadian = [];
    const jatuh = () => {
        b = mulaiJatuh(b);
        kejadian.push('jatuh');
    };
    const ikut = () => {
        const g = b.pijakan !== undefined && b.pijakan !== null ? gerakJendela.get(b.pijakan) : null;
        if (!g)
            return true;
        if (Math.abs(g.dx) > BATAS_IKUT || Math.abs(g.dy) > BATAS_IKUT) {
            jatuh();
            return false;
        }
        b.x = bulat(b.x + g.dx);
        b.y = bulat(b.y + g.dy);
        return true;
    };

    switch (b.keadaan) {
    case 'diangkat':
        break;
    case 'ngintip':
        if (ikut() && b.tepi?.jenis === 'jendela' && !peta.tepi.some(e => e.jendelaId === b.pijakan))
            jatuh();
        break;
    case 'berdiri':
        if (ikut() && !fisik.some(L => cocok(L, b, l)))
            jatuh();
        break;
    case 'melompat': {
        const u = b.busur;
        const i = u.i + 1, s = i / u.n;
        b.x = bulat(u.dari.x + (u.ke.x - u.dari.x) * s);
        b.y = bulat(u.dari.y + (u.ke.y - u.dari.y) * s - 4 * u.h * s * (1 - s));
        b.busur = { ...u, i };
        if (i >= u.n) {
            if (fisik.some(L => cocok(L, u.ke, l))) {
                b = { ...b, x: u.ke.x, y: u.ke.y, keadaan: 'berdiri', pijakan: u.ke.jendelaId, busur: null };
                kejadian.push('mendarat');
            } else {
                jatuh();
            }
        }
        break;
    }
    case 'jatuh':
    case 'dilempar': {
        const yLama = b.y;
        const dilempar = b.keadaan === 'dilempar';
        b.vy += GRAVITASI;
        b.x = bulat(b.x + b.vx);
        b.y = bulat(b.y + b.vy);
        for (const [batas, arah] of [[A.x + l / 2, 1], [A.x + A.lebar - l / 2, -1]]) {
            if ((b.x - batas) * arah < 0) {
                b.x = bulat(batas);
                b.vx = dilempar ? Math.abs(b.vx) * REDAM_PANTUL * arah : 0;
                if (dilempar)
                    kejadian.push('pantul');
            }
        }
        if (b.y - t < A.y && b.vy < 0) {
            b.y = bulat(A.y + t);
            b.vy = -b.vy * REDAM_PANTUL;
            kejadian.push('pantul');
        }
        if (b.vy > 0) {
            const kena = fisik
                .filter(L => yLama <= L.y && b.y >= L.y && b.x >= L.x1 + l / 2 - 1 && b.x <= L.x2 - l / 2 + 1)
                .sort((p, q) => p.y - q.y)[0];
            if (kena) {
                b = { ...b, y: kena.y, vx: 0, vy: 0, keadaan: 'berdiri', pijakan: kena.jendelaId };
                kejadian.push(dilempar ? 'mendaratKeras' : 'mendarat');
            }
        }
        break;
    }
    }
    return { badan: b, kejadian };
}

// Rute dari titik berdiri `dari` ke titik pijak `tujuan` lewat lantai-lantai
// di peta (pencarian melebar di graf lantai: sisi = lompatan yang mungkin).
// Hasil: [{jenis: 'jalan' | 'lompat', ke: {x, y, jendelaId}}], [] bila sudah
// di sana, null bila tak terjangkau (pemanggil lalu "menyelinap").
export function rute(dari, tujuan, peta, l) {
    const lantai = peta.lantai;
    const akhir = lantai.findIndex(L => cocok(L, tujuan, l));
    if (akhir < 0)
        return null;
    const ke = { x: tujuan.x, y: tujuan.y, jendelaId: lantai[akhir].jendelaId };
    const awal = lantai.findIndex(L => cocok(L, dari, l));
    if (awal < 0)
        return rencanaLompat(dari, ke) ? [{ jenis: 'lompat', ke }] : null;

    const titikLompat = (A, B) => {
        const pA = titikDi(A, (B.x1 + B.x2) / 2, l);
        return [pA, titikDi(B, pA.x, l)];
    };
    const asal = new Map([[awal, null]]);
    const antre = [awal];
    while (antre.length && !asal.has(akhir)) {
        const i = antre.shift();
        lantai.forEach((B, j) => {
            if (asal.has(j))
                return;
            const [pA, pB] = titikLompat(lantai[i], B);
            if (rencanaLompat(pA, pB)) {
                asal.set(j, i);
                antre.push(j);
            }
        });
    }
    if (!asal.has(akhir))
        return null;

    const jalur = [];
    for (let j = akhir; j !== null; j = asal.get(j))
        jalur.unshift(j);
    const hasil = [];
    let posisi = { x: dari.x, y: dari.y };
    for (let k = 1; k < jalur.length; k++) {
        const [pA, pB] = titikLompat(lantai[jalur[k - 1]], lantai[jalur[k]]);
        if (pA.x !== posisi.x)
            hasil.push({ jenis: 'jalan', ke: pA });
        hasil.push({ jenis: 'lompat', ke: pB });
        posisi = pB;
    }
    if (posisi.x !== ke.x || posisi.y !== ke.y)
        hasil.push({ jenis: 'jalan', ke });
    return hasil;
}
