// Hayat Memo: siklus hidup ala Tamagotchi (docs/superpowers/specs/
// 2026-10-19-siklus-hidup-design.md). Murni, tanpa St/Clutter/Meta.
//
// Telur → bayi → balita → anak → remaja → dewasa → tua → meninggal.
// Umur berjalan menurut KALENDER (laptop mati pun bertambah), tetapi
// kebutuhan tubuh (lapar, pup, kotor) dan sakit hanya berjalan selama kamu
// login: majukanHayat() menerima dtMs = waktu login yang lewat, sekarangMs =
// jam dinding. Laptop yang mati atau tidur tidak pernah membuat Memo sakit.
//
// Kejadian yang dikembalikan majukanHayat(), untuk badan & island:
//   { jenis: 'tumbuh', tahap }   pindah tahap
//   { jenis: 'pup', jumlah }     1-3 gumpal kotoran berserakan; Memo perlu dicebok
//   { jenis: 'sakit' }           lapar/kotor penuh 3 jam login
//   { jenis: 'peringatan', sisaJam }   12 dan 2 jam sebelum meninggal
//   { jenis: 'mati', sebab }     'ditelantarkan' | 'tua'

import { KATALOG, WARNA, rapikanRupa } from './studio.js';

export const JAM_MS = 3600 * 1000;
export const HARI_MS = 24 * JAM_MS;

// [tahap, lama dalam hari kalender]
export const TAHAP = [['bayi', 2], ['balita', 6], ['anak', 20], ['remaja', 25], ['dewasa', 60], ['tua', 40]];
export const LAMA_HIDUP_HARI = TAHAP.reduce((n, [, h]) => n + h, 0);
const UKURAN = { telur: 0.5, bayi: 0.6, balita: 0.7, anak: 0.85 };
const KECIL = new Set(['bayi', 'balita']);

export const KELAMIN = ['laki-laki', 'perempuan'];

// Avatar = rupa Studio (studio.js): bentuk, warna, pola, mata, warna mata,
// mulut, pipi, kepala, ekstra. Simpanan lama {warna, mata} ikut terbaca.
export const WARNA_BADAN = WARNA;
export const BENTUK_MATA = KATALOG.mata.map(([id]) => id);

export function rapikanAvatar(a) {
    return rapikanRupa(a);
}
export const MAKANAN = { nasi: 0.5, kue: 0.4, buah: 0.3 };

const LAPAR_PENUH_MS = 6 * JAM_MS;
const KOTOR_DASAR_MS = 48 * JAM_MS;
const KOTOR_KOTORAN_MS = 4 * JAM_MS;
const PENUH_SAKIT_MS = 3 * JAM_MS;
const SAKIT_MATI_MS = 24 * JAM_MS;
const PERINGATAN_JAM = [12, 2];

const batas = v => Math.min(1, Math.max(0, v));
const angka = (v, bawaan) => (typeof v === 'number' && Number.isFinite(v) ? v : bawaan);

function rapikanNama(nama) {
    const n = typeof nama === 'string' ? nama.trim().slice(0, 16) : '';
    return n || 'Memo';
}

export function hayatBaru({ nama, kelamin, avatar } = {}, sekarangMs) {
    return {
        nama: rapikanNama(nama),
        // null = belum dipilih (Memo lama dari sebelum ada hayat).
        kelamin: KELAMIN.includes(kelamin) ? kelamin : null,
        avatar: rapikanAvatar(avatar),
        dibuatMs: sekarangMs,
        lahirMs: null,       // null = masih telur
        tahap: 'telur',
        lapar: 0, kotor: 0, kotoran: 0, pupDalamMs: 0, perluCebok: false,
        penuhMs: 0, sakit: false, sakitMs: 0, peringatan: [],
        mati: false, sebab: null,
        album: [],
        terbuka: [],         // item istimewa Studio yang sudah dibuka ("kategori:id"), diwariskan
    };
}

export function tetaskan(h, sekarangMs) {
    if (h.lahirMs !== null || h.mati)
        return h;
    return { ...h, lahirMs: sekarangMs, tahap: 'bayi' };
}

// Tahap pada jam dinding `sekarangMs`: { tahap, hari (umur), ukuran (0..1) }.
export function tahapPada(h, sekarangMs) {
    if (h.lahirMs === null)
        return { tahap: 'telur', hari: 0, ukuran: UKURAN.telur };
    const hari = Math.max(0, (sekarangMs - h.lahirMs) / HARI_MS);
    let awal = 0;
    for (const [tahap, lama] of TAHAP) {
        if (hari < awal + lama)
            return { tahap, hari, ukuran: UKURAN[tahap] ?? 1 };
        awal += lama;
    }
    return { tahap: 'tua', hari, ukuran: 1 };
}

function wafat(h, sebab, sekarangMs) {
    const kenangan = {
        nama: h.nama, kelamin: h.kelamin, avatar: { ...h.avatar }, lahirMs: h.lahirMs, wafatMs: sekarangMs,
        umurHari: Math.floor(tahapPada(h, sekarangMs).hari), sebab,
    };
    return { ...h, mati: true, sebab, sakit: false, album: [...h.album, kenangan] };
}

// Waktu login dtMs berlalu; jam dinding sekarang sekarangMs.
export function majukanHayat(h, { dtMs, sekarangMs, acak = Math.random }) {
    if (h.mati || h.lahirMs === null)
        return { hayat: h, kejadian: [] };
    const kejadian = [];
    const { tahap, hari } = tahapPada(h, sekarangMs);
    let k = { ...h };
    if (hari >= LAMA_HIDUP_HARI) {
        k = wafat(k, 'tua', sekarangMs);
        return { hayat: k, kejadian: [{ jenis: 'mati', sebab: 'tua' }] };
    }
    if (tahap !== k.tahap) {
        k.tahap = tahap;
        kejadian.push({ jenis: 'tumbuh', tahap });
    }
    const kali = KECIL.has(tahap) ? 1.5 : 1;
    k.lapar = batas(k.lapar + dtMs / LAPAR_PENUH_MS * kali);
    if (k.pupDalamMs > 0) {
        k.pupDalamMs -= dtMs;
        if (k.pupDalamMs <= 0) {
            const jumlah = 1 + Math.floor(acak() * 3);
            k.pupDalamMs = 0;
            k.kotoran += jumlah;
            k.perluCebok = true;
            kejadian.push({ jenis: 'pup', jumlah });
        }
    }
    // Kotoran di lantai dan Memo yang belum dicebok sama-sama membuat cepat bau.
    k.kotor = batas(k.kotor + dtMs / KOTOR_DASAR_MS + (k.kotoran + (k.perluCebok ? 2 : 0)) * dtMs / KOTOR_KOTORAN_MS);

    if (!k.sakit) {
        k.penuhMs = k.lapar >= 1 || k.kotor >= 1 ? k.penuhMs + dtMs : 0;
        if (k.penuhMs >= PENUH_SAKIT_MS) {
            k = { ...k, sakit: true, sakitMs: 0, peringatan: [] };
            kejadian.push({ jenis: 'sakit' });
        }
    } else {
        k.sakitMs += dtMs;
        for (const jam of PERINGATAN_JAM) {
            if (!k.peringatan.includes(jam) && SAKIT_MATI_MS - k.sakitMs <= jam * JAM_MS) {
                k.peringatan = [...k.peringatan, jam];
                kejadian.push({ jenis: 'peringatan', sisaJam: jam });
            }
        }
        if (k.sakitMs >= SAKIT_MATI_MS) {
            k = wafat(k, 'ditelantarkan', sekarangMs);
            kejadian.push({ jenis: 'mati', sebab: 'ditelantarkan' });
        }
    }
    return { hayat: k, kejadian };
}

// --- Perawatan ------------------------------------------------------------

export function beriMakan(h, jenis, sekarangMs, acak = Math.random) {
    if (h.mati || h.lahirMs === null || !(jenis in MAKANAN))
        return h;
    // Pup 40-90 menit (waktu login) sesudah makan, kecuali sudah terjadwal.
    const pupDalamMs = h.pupDalamMs > 0 ? h.pupDalamMs : (40 + acak() * 50) * 60000;
    return { ...h, lapar: batas(h.lapar - MAKANAN[jenis]), pupDalamMs, penuhMs: 0 };
}

// Bersihkan `n` kotoran (bawaan semua).
export function bersihkan(h, n = Infinity) {
    return h.kotoran ? { ...h, kotoran: Math.max(0, h.kotoran - n) } : h;
}

// Ganti nama / jenis kelamin / avatar (wizard lahir & pengaturan).
export function ubahIdentitas(h, { nama, kelamin, avatar } = {}) {
    return {
        ...h,
        nama: nama === undefined ? h.nama : rapikanNama(nama),
        kelamin: KELAMIN.includes(kelamin) ? kelamin : h.kelamin,
        avatar: avatar === undefined ? h.avatar : rapikanAvatar(avatar),
    };
}

// Sesudah meninggal: telur baru, album kenangan tetap.
export function telurBaru(h, sekarangMs) {
    return { ...hayatBaru({}, sekarangMs), album: [...h.album], terbuka: [...(h.terbuka ?? [])] };
}

// Cebok sesudah pup.
export function cebok(h) {
    return h.perluCebok ? { ...h, perluCebok: false } : h;
}

export function mandikan(h) {
    return h.mati ? h : { ...h, kotor: 0, penuhMs: 0 };
}

export function obati(h) {
    return h.mati ? h : { ...h, sakit: false, sakitMs: 0, penuhMs: 0, peringatan: [] };
}

// --- Simpan / muat (bagian `hayat` di ~/.config/memo/hidup.json) -----------

const DISIMPAN = ['nama', 'kelamin', 'avatar', 'dibuatMs', 'lahirMs', 'tahap', 'lapar', 'kotor', 'kotoran', 'perluCebok',
    'pupDalamMs', 'penuhMs', 'sakit', 'sakitMs', 'peringatan', 'mati', 'sebab', 'album', 'terbuka'];

export function keJson(h) {
    const hayat = {};
    for (const k of DISIMPAN)
        hayat[k] = h[k];
    return { hayat: JSON.parse(JSON.stringify(hayat)) };
}

// Data lama (sebelum ada hayat) = Memo yang baru menjadi dewasa hari ini,
// supaya Memo yang sudah ada tidak mendadak jadi bayi.
export function dariJson(data, sekarangMs) {
    const d = data?.hayat && typeof data.hayat === 'object' ? data.hayat : null;
    const sampaiDewasa = TAHAP.slice(0, TAHAP.findIndex(([n]) => n === 'dewasa')).reduce((n, [, x]) => n + x, 0);
    const h = hayatBaru({ nama: d?.nama, kelamin: d?.kelamin, avatar: d?.avatar }, sekarangMs);
    const lahirMs = d?.lahirMs === null ? null : angka(d?.lahirMs, sekarangMs - sampaiDewasa * HARI_MS);
    const k = {
        ...h,
        dibuatMs: angka(d?.dibuatMs, sekarangMs),
        lahirMs,
        lapar: batas(angka(d?.lapar, 0)),
        kotor: batas(angka(d?.kotor, 0)),
        kotoran: Math.max(0, Math.floor(angka(d?.kotoran, 0))),
        pupDalamMs: Math.max(0, angka(d?.pupDalamMs, 0)),
        perluCebok: d?.perluCebok === true,
        penuhMs: Math.max(0, angka(d?.penuhMs, 0)),
        sakit: d?.sakit === true,
        sakitMs: Math.max(0, angka(d?.sakitMs, 0)),
        peringatan: Array.isArray(d?.peringatan) ? d.peringatan.filter(x => PERINGATAN_JAM.includes(x)) : [],
        mati: d?.mati === true,
        sebab: ['tua', 'ditelantarkan'].includes(d?.sebab) ? d.sebab : null,
        album: Array.isArray(d?.album) ? d.album.filter(x => x && typeof x === 'object') : [],
        terbuka: Array.isArray(d?.terbuka) ? d.terbuka.filter(x => typeof x === 'string' && /^\w+:\w+$/.test(x)) : [],
    };
    k.tahap = tahapPada(k, sekarangMs).tahap;
    return k;
}
