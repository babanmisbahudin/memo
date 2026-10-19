// Pintasan cepat di Beranda panel Memo: tombol sekali klik untuk membuka
// situs, aplikasi, folder, atau terminal. Disimpan pengguna di
// ~/.config/memo/pintasan.json; dibuka lewat bukaLaptop.buka(), yang
// memvalidasi ulang. Murni: tanpa St/Clutter/Meta.

export const MAKS_PINTASAN = 5;
const JENIS = ['url', 'aplikasi', 'folder', 'terminal'];

export const PINTASAN_BAWAAN = [
    { nama: 'YouTube', jenis: 'url', target: 'https://www.youtube.com' },
    { nama: 'Obsidian', jenis: 'aplikasi', target: 'obsidian.desktop\n?obsidian' },
    { nama: 'Proyek Memo', jenis: 'folder', target: '~/Projects/memo' },
    { nama: 'Terminal', jenis: 'terminal', target: '~' },
    { nama: 'Unduhan', jenis: 'folder', target: '~/Downloads' },
];

function sah(p) {
    if (!p || typeof p !== 'object' || !JENIS.includes(p.jenis) || typeof p.target !== 'string' ||
        typeof p.nama !== 'string' || !p.nama.trim() || !p.target.trim())
        return null;
    if (p.jenis === 'url' && !/^https?:\/\//.test(p.target))
        return null;
    return { nama: p.nama.trim().slice(0, 12), jenis: p.jenis, target: p.target.trim() };
}

// Isi berkas pintasan.json -> daftar pintasan sah. Berkas tidak ada atau
// rusak -> bawaan; larik kosong tetap kosong (pengguna sengaja menghapus).
export function bacaPintasan(teks) {
    let data;
    try {
        data = JSON.parse(teks);
    } catch (e) {
        return PINTASAN_BAWAAN.map(p => ({ ...p }));
    }
    if (!Array.isArray(data))
        return PINTASAN_BAWAAN.map(p => ({ ...p }));
    return data.map(sah).filter(Boolean).slice(0, MAKS_PINTASAN);
}

// '~' / '~/x' -> jalur di home; selebihnya apa adanya.
export function jalurPenuh(target, home) {
    return target === '~' ? home : target.startsWith('~/') ? `${home}${target.slice(1)}` : target;
}
