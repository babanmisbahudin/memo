// Pikiran Memo tanpa AI: kebutuhan yang naik-turun sendiri, sifat dari
// slider, ritme harian, dan pemilihan kegiatan dengan skor. Murni (tanpa
// St/Clutter/Meta); memoHidup.js memanggil pikir() sekali per detik.
//
// Keluar sebagai niat: { kegiatan, tujuan, ekspresi, emote, ikon }.
//   tujuan undefined  pertahankan tujuan yang sedang dijalani
//   tujuan null       diam di tempat
//   tujuan {jenis: 'titik', x, y, jendelaId}   titik pijak di lantai
//   tujuan {jenis: 'tepi', x, y, jendelaId, tepi}  menempel/ngintip di tepi
// Kegiatan khusus 'sembunyi' (aplikasi layar penuh) tidak punya tujuan.

import { bolehDi } from './dunia.js';
import { titikDi } from './fisika.js';
import { kenali } from './kenalAplikasi.js';

// --- Keadaan, kebutuhan, simpan/muat ------------------------------------

export const SIFAT_BAWAAN = { penasaran: 0.7, aktif: 0.5, iseng: 0.4, manja: 0.6 };
export const KEBUTUHAN_BAWAAN = { energi: 0.8, bosan: 0.2, penasaran: 0.5, rindu: 0.3 };
export const KEGIATAN = ['jelajah', 'ngintip', 'nonton', 'temani', 'joget', 'iseng', 'tidur', 'sambut', 'melamun'];

const BERGERAK = new Set(['jelajah', 'iseng', 'joget', 'ngintip']);

const batas = v => Math.min(1, Math.max(0, v));

function saring(data, bawaan) {
    const hasil = { ...bawaan };
    for (const k of Object.keys(bawaan)) {
        if (typeof data?.[k] === 'number' && Number.isFinite(data[k]))
            hasil[k] = batas(data[k]);
    }
    return hasil;
}

export function keadaanBaru({ sifat = {}, kebutuhan = {} } = {}) {
    return {
        sifat: saring(sifat, SIFAT_BAWAAN), kebutuhan: saring(kebutuhan, KEBUTUHAN_BAWAAN),
        kegiatan: 'melamun', sisaMs: 0,
        kenal: [],     // jendela (id:judul) yang sudah pernah terlihat
        dilihat: [],   // jendela (id:judul) yang sudah diintip/ditonton
        jenuh: {},     // kegiatan -> 0..1, naik selama dilakukan, pulih pelan
    };
}

// Kebutuhan berubah sendiri selama dtMs. Laju per detik.
export function majukan(keadaan, { dtMs, jam, temuanBaru = 0, dekatKursor = false }) {
    const { sifat: s, kegiatan } = keadaan;
    const k = { ...keadaan.kebutuhan };
    const d = dtMs / 1000;
    const malam = jam >= 22 || jam < 5;
    const siang = jam === 13;
    if (kegiatan === 'tidur') {
        k.energi += 0.0015 * d;
    } else {
        const kali = (BERGERAK.has(kegiatan) ? 2 : 1) * (malam ? 2 : siang ? 1.5 : 1);
        k.energi -= 0.0003 * d * (1.5 - s.aktif) * kali;
        k.bosan += (BERGERAK.has(kegiatan) ? -0.01 : kegiatan === 'nonton' ? -0.003 : 0.002) * d;
    }
    k.penasaran += 0.001 * d * (0.5 + s.penasaran) + temuanBaru * 0.3 * (0.5 + s.penasaran);
    if (kegiatan === 'ngintip')
        k.penasaran -= 0.02 * d;
    else if (kegiatan === 'jelajah' || kegiatan === 'nonton')
        k.penasaran -= 0.004 * d;
    // Menemani & menyambut memuaskan rindu, seperti kursor yang lama di dekatnya.
    const ditemani = kegiatan === 'temani' || kegiatan === 'sambut';
    k.rindu += (ditemani ? -0.003 : dekatKursor ? -0.002 : 0.0008 * (0.5 + s.manja)) * d;
    for (const n of Object.keys(k))
        k[n] = batas(k[n]);
    // Jenuh: penuh sesudah ±15 menit melakukan hal yang sama, pulih ±30 menit.
    const jenuh = {};
    for (const n of KEGIATAN) {
        const naik = n === kegiatan && n !== 'tidur' && n !== 'sambut';
        jenuh[n] = batas((keadaan.jenuh?.[n] ?? 0) + (naik ? d / 900 : -d / 1800));
    }
    return { ...keadaan, kebutuhan: k, jenuh };
}

// Simpan / muat (~/.config/memo/hidup.json). Saat dimuat, kebutuhan
// dimajukan sesuai waktu yang lewat seolah Memo tidur selama laptop mati.
export function keJson(keadaan, sekarangMs) {
    return { sifat: { ...keadaan.sifat }, kebutuhan: { ...keadaan.kebutuhan }, disimpan: new Date(sekarangMs).toISOString() };
}

export function dariJson(data, sekarangMs) {
    const k = keadaanBaru({ sifat: data?.sifat, kebutuhan: data?.kebutuhan });
    const lalu = Date.parse(data?.disimpan ?? '');
    if (Number.isFinite(lalu) && sekarangMs > lalu) {
        const d = Math.min((sekarangMs - lalu) / 1000, 7 * 86400);
        k.kebutuhan = {
            energi: batas(k.kebutuhan.energi + 0.0015 * d),
            bosan: Math.min(k.kebutuhan.bosan, 0.2),
            penasaran: Math.max(k.kebutuhan.penasaran, 0.5),
            rindu: batas(k.kebutuhan.rindu + 0.0008 * d * (0.5 + k.sifat.manja)),
        };
    }
    return k;
}

// --- Memilih kegiatan ---------------------------------------------------

// Lama tiap kegiatan [min, maks] detik sebelum dipilih ulang.
const LAMA = {
    jelajah: [20, 40], ngintip: [6, 12], nonton: [30, 90], temani: [30, 60], joget: [15, 30],
    iseng: [5, 10], tidur: [60, 60], sambut: [3, 3], melamun: [10, 25],
};
const EKSPRESI = {
    jelajah: 'netral', ngintip: 'mendengar', nonton: 'mendengar', temani: 'netral', joget: 'senang',
    iseng: 'senang', tidur: 'tidur', sambut: 'senang', melamun: 'netral',
};
const EMOTE = { sambut: 'lompat', joget: 'dansa', iseng: 'putar', ngintip: 'kaget' };
const IKON = { ngintip: 'tanya', sambut: 'hati', joget: 'musik' };

const kunci = w => `${w.id}:${w.judul ?? ''}`;

function skor(c) {
    const { k, s } = c;
    return {
        jelajah: (0.7 * k.bosan + 0.3 * k.penasaran) * (0.6 + s.aktif) * (k.energi > 0.3 ? 1 : 0.2),
        // Jendela baru paling menarik; yang sudah dikenal sesekali diintip lagi.
        ngintip: c.baru.length ? (0.3 + k.penasaran) * (0.6 + s.penasaran) : k.penasaran * (0.6 + s.penasaran) * 0.35,
        nonton: c.video.length ? 0.45 + 0.3 * s.penasaran : 0,
        temani: c.kerja ? 0.25 + k.rindu * (0.4 + s.manja) : 0,
        joget: c.musik ? 0.4 + 0.4 * s.iseng : 0,
        iseng: k.energi > 0.5 ? s.iseng * 0.6 * (0.5 + k.bosan) : 0,
        tidur: c.pergi ? 3 : Math.max(0, 0.35 - k.energi) * 4 * (1.5 - s.aktif) + (c.malam ? 0.15 : 0) +
            (c.kegiatan === 'tidur' && k.energi < 0.9 ? 0.8 : 0),
        sambut: c.kembali ? 4 : 0,
        melamun: 0.3,
    };
}

// Titik di lantai L yang boleh ditempati, dicoba beberapa kali secara acak.
function titikBoleh(L, c, { x = null } = {}) {
    const l = c.ukuran.lebar;
    for (let n = 0; n < 6; n++) {
        const tx = x !== null && n === 0 ? x : L.x1 + l / 2 + c.acak() * Math.max(0, L.x2 - L.x1 - l);
        const p = titikDi(L, tx, l);
        if (bolehDi(c.peta, p, c.ukuran))
            return { jenis: 'titik', ...p };
    }
    return null;
}

function tepiBoleh(daftar, c) {
    const boleh = daftar.filter(e => bolehDi(c.peta, e, c.ukuran));
    // Pilih yang jauh dari kursor.
    boleh.sort((p, q) => Math.hypot(q.x - c.kursor.x, q.y - c.kursor.y) - Math.hypot(p.x - c.kursor.x, p.y - c.kursor.y));
    const e = boleh[Math.floor(c.acak() * Math.min(2, boleh.length))];
    return e ? { jenis: 'tepi', x: e.x, y: e.y, jendelaId: e.jendelaId, tepi: e } : null;
}

function pilihTujuan(kegiatan, c) {
    const { peta, ukuran, posisi } = c;
    const tepiLayar = peta.tepi.filter(e => e.jenis === 'layar');
    if (peta.hanyaTepi)
        return c.diTepi && c.posisiBoleh ? null : tepiBoleh(tepiLayar, c);
    const terdekat = () => {
        const urut = [...peta.lantai].sort((p, q) =>
            Math.hypot(titikDi(p, posisi.x, ukuran.lebar).x - posisi.x, p.y - posisi.y) -
            Math.hypot(titikDi(q, posisi.x, ukuran.lebar).x - posisi.x, q.y - posisi.y));
        for (const L of urut) {
            const t = titikBoleh(L, c, { x: posisi.x });
            if (t)
                return t;
        }
        return tepiBoleh(tepiLayar, c);
    };
    const dariLantai = (daftar, opsi) => {
        for (const L of daftar) {
            const t = titikBoleh(L, c, opsi?.(L));
            if (t)
                return t;
        }
        return null;
    };
    let t = null;
    switch (kegiatan) {
    case 'jelajah': {
        const jauh = [...peta.lantai].sort((p, q) =>
            Math.abs(q.y - posisi.y) + Math.abs((q.x1 + q.x2) / 2 - posisi.x) -
            Math.abs(p.y - posisi.y) - Math.abs((p.x1 + p.x2) / 2 - posisi.x));
        t = dariLantai(jauh.slice(0, Math.max(1, Math.ceil(jauh.length / 2))).sort(() => c.acak() - 0.5));
        break;
    }
    case 'iseng': {
        const lain = peta.lantai.filter(L => L.jendelaId !== null && L.jendelaId !== c.aktifId);
        t = dariLantai(lain.sort(() => c.acak() - 0.5));
        break;
    }
    case 'ngintip': {
        const baru = new Set(c.baru.map(w => w.id));
        const tepi = peta.tepi.filter(e => e.jenis === 'jendela');
        t = tepiBoleh(tepi.filter(e => baru.has(e.jendelaId)), c) ?? tepiBoleh(tepi, c) ?? tepiBoleh(tepiLayar, c);
        break;
    }
    case 'nonton': {
        const ids = new Set(c.video.map(w => w.id));
        t = dariLantai(peta.lantai.filter(L => ids.has(L.jendelaId)), L => ({ x: (L.x1 + L.x2) / 2 }));
        break;
    }
    case 'temani': {
        const atasAktif = peta.lantai.filter(L => L.jendelaId === c.aktifId);
        // Sejauh mungkin dari kursor, tapi tetap di dekat jendela yang kamu pakai.
        t = dariLantai(atasAktif, L => ({ x: Math.abs(L.x1 - c.kursor.x) > Math.abs(L.x2 - c.kursor.x) ? L.x1 : L.x2 })) ??
            dariLantai(peta.lantai.filter(L => L.jendelaId === null));
        break;
    }
    case 'tidur': {
        const A = peta.areaKerja;
        const dasar = peta.lantai.filter(L => L.jendelaId === null);
        t = dariLantai(dasar, () => ({ x: A.x })) ?? dariLantai(dasar, () => ({ x: A.x + A.lebar })) ??
            tepiBoleh(tepiLayar.filter(e => e.sisi !== 'bawah'), c);
        break;
    }
    default:   // joget, sambut, melamun: di tempat
        t = null;
    }
    // Tidak ada tempat yang cocok: diam bila tempat sekarang boleh, kalau
    // tidak ke tempat boleh yang terdekat.
    if (t)
        return t;
    return c.posisiBoleh ? null : terdekat();
}

// Satu detik pikiran. ctx:
//   persepsi, peta, ukuran, posisi {x, y}, tepi (tepi tempat Memo menempel
//   atau null), dtMs, acak (fungsi -> [0,1))
//   pergi (bolehTidur island), kembali (baru saja pergi -> ada lagi)
//   dielus, sampai (tiba di tujuan)
// Mengembalikan { keadaan, niat } (niat null bila tidak ada yang berubah).
export function pikir(keadaan, ctx) {
    const { persepsi, peta, posisi, ukuran, acak } = ctx;
    const jendela = persepsi.jendela;
    const kunciKini = new Set(jendela.map(kunci));
    // Jendela baru dihitung penuh; judul yang berganti (pindah halaman,
    // pindah folder di terminal) hanya sedikit menambah penasaran.
    const idKenal = new Set(keadaan.kenal.map(x => x.split(':')[0]));
    const jendelaBaru = jendela.filter(w => !idKenal.has(String(w.id))).length;
    const temuanBaru = jendelaBaru + 0.3 * jendela.filter(w => idKenal.has(String(w.id)) && !keadaan.kenal.includes(kunci(w))).length;
    const kursor = persepsi.kursor;
    let k = majukan(keadaan, {
        dtMs: ctx.dtMs, jam: persepsi.jam ?? 12, temuanBaru,
        dekatKursor: Math.hypot(posisi.x - kursor.x, posisi.y - kursor.y) < 300,
    });
    k = {
        ...k,
        kenal: [...kunciKini],
        dilihat: k.dilihat.filter(x => kunciKini.has(x)),
        sisaMs: k.sisaMs - ctx.dtMs,
    };

    if (peta.sembunyi) {
        if (k.kegiatan === 'sembunyi')
            return { keadaan: k, niat: null };
        return { keadaan: { ...k, kegiatan: 'sembunyi', sisaMs: 0 }, niat: { kegiatan: 'sembunyi', tujuan: null } };
    }

    const aktif = jendela.find(w => w.aktif) ?? null;
    const kategori = w => kenali(w.aplikasi, w.judul);
    const c = {
        k: k.kebutuhan, s: k.sifat, peta, ukuran, posisi, kursor, acak, kegiatan: k.kegiatan,
        aktifId: aktif?.id ?? null,
        baru: jendela.filter(w => !w.aktif && !k.dilihat.includes(kunci(w))),
        video: jendela.filter(w => kategori(w) === 'video'),
        musik: jendela.some(w => kategori(w) === 'musik'),
        kerja: !!aktif && ['kode', 'dokumen', 'terminal'].includes(kategori(aktif)),
        malam: (persepsi.jam ?? 12) >= 22 || (persepsi.jam ?? 12) < 5,
        pergi: !!ctx.pergi, kembali: !!ctx.kembali, diTepi: !!ctx.tepi,
        posisiBoleh: bolehDi(peta, { ...posisi, jenis: ctx.tepi?.jenis ?? null }, ukuran),
    };

    if (ctx.dielus) {
        k.kebutuhan = { ...k.kebutuhan, rindu: batas(k.kebutuhan.rindu - 0.5) };
        if (k.kegiatan === 'tidur' && !c.pergi)
            k.sisaMs = 0;
        return { keadaan: k, niat: { kegiatan: k.kegiatan, tujuan: undefined, ekspresi: 'senang', emote: 'tepuk', ikon: 'hati' } };
    }

    // Jendela yang benar-benar baru (bukan sekadar ganti judul) membuat Memo
    // menoleh: kegiatan dipilih ulang, kecuali sedang tidur.
    const menoleh = jendelaBaru > 0 && keadaan.kenal.length > 0 && k.kegiatan !== 'tidur';
    const harusPilih = k.sisaMs <= 0 || menoleh || k.kegiatan === 'sembunyi' || c.kembali ||
        (c.pergi && k.kegiatan !== 'tidur') || (k.kegiatan === 'tidur' && !c.pergi && k.kebutuhan.energi >= 0.95);
    if (harusPilih) {
        const nilai = skor(c);
        let pilihan = 'melamun', terbaik = -1;
        for (const n of KEGIATAN) {
            // Makin jenuh makin kurang menarik, supaya Memo tidak menonton
            // seharian hanya karena YouTube terbuka.
            const v = nilai[n] * (1 - 0.8 * (k.jenuh[n] ?? 0)) * (0.85 + 0.3 * acak());
            if (v > terbaik) {
                terbaik = v;
                pilihan = n;
            }
        }
        const [a, b] = LAMA[pilihan];
        const tujuan = pilihTujuan(pilihan, c);
        if (tujuan?.jendelaId !== undefined && pilihan !== 'temani') {
            const w = jendela.find(x => x.id === tujuan.jendelaId);
            if (w && !k.dilihat.includes(kunci(w)))
                k.dilihat = [...k.dilihat, kunci(w)];
        }
        k = { ...k, kegiatan: pilihan, sisaMs: (a + acak() * (b - a)) * 1000 };
        return {
            keadaan: k,
            niat: { kegiatan: pilihan, tujuan, ekspresi: EKSPRESI[pilihan], emote: EMOTE[pilihan] ?? null, ikon: IKON[pilihan] ?? null },
        };
    }

    // Penyela: kursor/jendela aktif mendesak -> menyingkir. Tiba di tujuan
    // saat jelajah/iseng -> lanjut ke tempat berikutnya.
    if (!c.posisiBoleh || (ctx.sampai && (k.kegiatan === 'jelajah' || k.kegiatan === 'iseng'))) {
        const tujuan = pilihTujuan(c.posisiBoleh ? k.kegiatan : 'melamun', { ...c, posisiBoleh: c.posisiBoleh });
        const pemalu = k.sifat.manja < 0.4;
        return {
            keadaan: k,
            niat: { kegiatan: k.kegiatan, tujuan, ekspresi: EKSPRESI[k.kegiatan], emote: !c.posisiBoleh && pemalu ? 'kaget' : null, ikon: null },
        };
    }
    return { keadaan: k, niat: null };
}
