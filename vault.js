// Jembatan ke vault Obsidian. Semua I/O di sini ASINKRON tanpa kecuali:
// pembacaan berkas yang memblokir di dalam proses gnome-shell membekukan
// seluruh desktop, termasuk mouse dan animasi.
//
// Batas yang dipegang: hanya menambah baris tugas dan mengubah [ ] menjadi
// [x]. Penyuntingan sebenarnya dikerjakan tugas.js yang murni teks; berkas ini
// hanya mengurus membaca, menulis, dan membuat catatan hari ini dari template.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { bacaTugas, isiTemplate, setCentang, tambahTugas } from './tugas.js';

Gio._promisify(Gio.File.prototype, 'load_contents_async');
Gio._promisify(Gio.File.prototype, 'replace_contents_async');

const NAMA_VAULT = 'himisbah';
const MAP_HARIAN = '06-Harian';
const JALUR_TEMPLATE = ['99-Meta', 'templates', 'harian.md'];

// MEMO_VAULT memungkinkan pengujian diarahkan ke salinan vault, supaya
// catatan sungguhan tidak pernah jadi bahan percobaan.
function akarVault() {
    return GLib.getenv('MEMO_VAULT')
        ?? GLib.build_filenamev([GLib.get_home_dir(), 'Documents', NAMA_VAULT]);
}

function namaHariIni(tanggal) {
    const dua = n => String(n).padStart(2, '0');
    return `${tanggal.getFullYear()}-${dua(tanggal.getMonth() + 1)}-${dua(tanggal.getDate())}.md`;
}

function berkasHarian(tanggal) {
    return Gio.File.new_for_path(
        GLib.build_filenamev([akarVault(), MAP_HARIAN, namaHariIni(tanggal)]));
}

export function vaultAda() {
    return GLib.file_test(akarVault(), GLib.FileTest.IS_DIR);
}

async function bacaTeks(berkas) {
    const [isi] = await berkas.load_contents_async(null);
    return new TextDecoder().decode(isi);
}

async function tulisTeks(berkas, teks) {
    await berkas.replace_contents_async(
        new TextEncoder().encode(teks), null, false,
        Gio.FileCreateFlags.NONE, null);
}

// Mengembalikan isi catatan hari ini, membuatnya dari template kalau belum
// ada. Kalau templatenya juga tidak ada, dibuatkan kerangka seadanya supaya
// Memo tetap bisa mencatat — lebih baik daripada menolak menyimpan tugas.
async function bacaAtauBuat(tanggal = new Date()) {
    const berkas = berkasHarian(tanggal);

    try {
        return { berkas, teks: await bacaTeks(berkas) };
    } catch (e) {
        if (!e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
            throw e;
    }

    let teks;
    try {
        const template = Gio.File.new_for_path(
            GLib.build_filenamev([akarVault(), ...JALUR_TEMPLATE]));
        teks = isiTemplate(await bacaTeks(template), tanggal);
    } catch (e) {
        console.log(`[dynamic-island] template harian tidak terbaca: ${e}`);
        teks = `# ${namaHariIni(tanggal).replace('.md', '')}\n\n## Fokus hari ini\n\n`;
    }

    const induk = berkas.get_parent();
    try {
        induk.make_directory_with_parents(null);
    } catch (e) {
        if (!e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS))
            throw e;
    }

    await tulisTeks(berkas, teks);
    console.log(`[dynamic-island] catatan harian dibuat: ${berkas.get_path()}`);
    return { berkas, teks };
}

export async function muatTugas() {
    if (!vaultAda())
        return null;
    const { teks } = await bacaAtauBuat();
    return bacaTugas(teks);
}

export async function tambah(tugasBaru) {
    if (!vaultAda())
        return null;
    const { berkas, teks } = await bacaAtauBuat();
    const baru = tambahTugas(teks, tugasBaru);
    if (baru === teks)
        return bacaTugas(teks);
    await tulisTeks(berkas, baru);
    return bacaTugas(baru);
}

export async function centang(nomorBaris, selesai) {
    if (!vaultAda())
        return null;
    const { berkas, teks } = await bacaAtauBuat();
    const baru = setCentang(teks, nomorBaris, selesai);
    if (baru === teks)
        return bacaTugas(teks);
    await tulisTeks(berkas, baru);
    return bacaTugas(baru);
}
