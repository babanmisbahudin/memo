// Studio Memo: katalog rupa yang bisa dipilih saat Memo lahir
// (docs/superpowers/specs/2026-10-20-studio-memo-design.md). Murni.
//
// Rupa = { bentuk, warna, pola, mata, warnaMata, mulut, pipi, kepala, ekstra }.
// Item ber-`koin` adalah item istimewa: tampil terkunci di Studio sampai
// dibuka dengan koin; yang sudah terbuka (`terbuka`, daftar "kategori:id")
// diwariskan ke Memo berikutnya.

export const WARNA = {
    hitam: { badan: '#000000', mata: [0.95, 0.97, 1] },
    putih: { badan: '#e9edf2', mata: [0.12, 0.13, 0.17] },
    abu: { badan: '#6b7280', mata: [0.95, 0.97, 1] },
    merah: { badan: '#d9434b', mata: [0.98, 0.95, 0.95] },
    oranye: { badan: '#f08a3c', mata: [0.2, 0.1, 0.05] },
    kuning: { badan: '#f2c94c', mata: [0.18, 0.14, 0.05] },
    hijau: { badan: '#3fae6a', mata: [0.95, 0.97, 1] },
    toska: { badan: '#2bb3a8', mata: [0.95, 0.97, 1] },
    biru: { badan: '#3d7bd9', mata: [0.95, 0.97, 1] },
    ungu: { badan: '#8b5cf6', mata: [0.97, 0.95, 1] },
    pink: { badan: '#ff8fb8', mata: [0.2, 0.08, 0.14] },
    coklat: { badan: '#8b5a3c', mata: [0.98, 0.95, 0.9] },
};

export const WARNA_MATA = {
    otomatis: null,
    putih: [0.95, 0.97, 1],
    biru: [0.55, 0.82, 1],
    hijau: [0.5, 0.92, 0.55],
    kuning: [1, 0.85, 0.3],
    pink: [1, 0.55, 0.75],
};

// [id, koin (0 = dasar)] per kategori; urutan = urutan di Studio.
export const KATALOG = {
    bentuk: [['pil', 0], ['bulat', 0], ['kotak', 0], ['tetes', 30], ['awan', 40], ['kucing', 50]],
    warna: Object.keys(WARNA).map(id => [id, 0]),
    pola: [['polos', 0], ['belang', 0], ['totol', 0], ['gradasi', 20], ['bintang', 30]],
    mata: [['kotak', 0], ['bulat', 0], ['sipit', 0], ['besar', 25], ['kucing', 30], ['hati', 40]],
    warnaMata: Object.keys(WARNA_MATA).map(id => [id, 0]),
    mulut: [['tanpa', 0], ['senyum', 0], ['w', 0], ['taring', 15], ['o', 15]],
    pipi: [['tanpa', 0], ['merona', 0], ['bintik', 10]],
    kepala: [['bawaan', 0], ['tanpa', 0], ['antena', 0], ['mahkota', 60], ['tanduk', 30], ['daun', 20], ['bandoKucing', 30]],
    ekstra: [['tanpa', 0], ['syal', 0], ['dasi', 20], ['kalung', 20], ['sayap', 60], ['ekor', 30]],
};

export const KATEGORI = Object.keys(KATALOG);

export const RUPA_BAWAAN = {
    bentuk: 'pil', warna: 'hitam', pola: 'polos', mata: 'kotak', warnaMata: 'otomatis', mulut: 'tanpa', pipi: 'tanpa',
    kepala: 'bawaan', ekstra: 'tanpa',
};

const ada = (kategori, id) => KATALOG[kategori]?.some(([x]) => x === id);

export function harga(kategori, id) {
    return KATALOG[kategori]?.find(([x]) => x === id)?.[1] ?? 0;
}

// Boleh dipilih di Studio: item dasar, atau item istimewa yang sudah dibuka.
export function bolehDipilih(kategori, id, terbuka = []) {
    return ada(kategori, id) && (harga(kategori, id) === 0 || terbuka.includes(`${kategori}:${id}`));
}

// Rupa sah dari data apa pun (simpanan lama {warna, mata} ikut terbaca).
export function rapikanRupa(r) {
    const hasil = {};
    for (const k of KATEGORI)
        hasil[k] = ada(k, r?.[k]) ? r[k] : RUPA_BAWAAN[k];
    return hasil;
}

// Rupa acak dari item yang boleh dipilih.
export function acakRupa(acak = Math.random, terbuka = []) {
    const hasil = {};
    for (const k of KATEGORI) {
        const boleh = KATALOG[k].filter(([id]) => bolehDipilih(k, id, terbuka));
        hasil[k] = boleh[Math.floor(acak() * boleh.length)][0];
    }
    // Mulut & ekstra sering kosong supaya Memo acak tetap rapi.
    if (acak() < 0.5)
        hasil.mulut = 'tanpa';
    if (acak() < 0.5)
        hasil.ekstra = 'tanpa';
    return hasil;
}

// Warna mata yang dipakai: pilihan, atau otomatis menurut warna badan.
export function warnaMataDipakai(r) {
    return WARNA_MATA[r.warnaMata] ?? WARNA[r.warna]?.mata ?? WARNA.hitam.mata;
}

// Opsi berikut/sebelum untuk tombol ◀ ▶ (berputar).
export function geser(kategori, id, arah) {
    const daftar = KATALOG[kategori].map(([x]) => x);
    const i = Math.max(0, daftar.indexOf(id));
    return daftar[(i + arah + daftar.length) % daftar.length];
}
