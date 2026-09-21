// Membaca dan menyunting daftar tugas di dalam catatan harian Obsidian.
//
// Murni teks: tidak mengimpor Gio, St, atau apa pun dari GNOME, jadi bisa
// diuji dengan gjs polos tanpa menyentuh vault sungguhan.
//
// Batas yang dipegang seluruh berkas ini: hanya MENAMBAH baris tugas baru dan
// MENGUBAH [ ] menjadi [x] atau sebaliknya. Tidak pernah menghapus baris, dan
// tidak pernah menyentuh baris di luar bagian yang dituju. Catatan harian itu
// tulisan tangan pemiliknya; program tidak berhak merapikannya.

export const BAGIAN_TUGAS = 'Fokus hari ini';

const POLA_TUGAS = /^(\s*)-\s+\[([ xX])\]\s*(.*)$/;
const POLA_JUDUL = /^(#{1,6})\s+(.*?)\s*$/;

function judulDari(baris) {
    const cocok = baris.match(POLA_JUDUL);
    return cocok ? { tingkat: cocok[1].length, teks: cocok[2] } : null;
}

// Mengembalikan { mulai, selesai } sebagai indeks baris ISI bagian itu,
// atau null kalau judulnya tidak ada. `selesai` bersifat eksklusif.
export function batasBagian(teks, judul = BAGIAN_TUGAS) {
    const baris = teks.split('\n');
    let mulai = -1;
    let tingkat = 0;

    for (let i = 0; i < baris.length; i++) {
        const h = judulDari(baris[i]);
        if (h && h.teks === judul) {
            mulai = i + 1;
            tingkat = h.tingkat;
            break;
        }
    }
    if (mulai === -1)
        return null;

    // Bagian berakhir di judul berikutnya yang setingkat atau lebih tinggi.
    for (let i = mulai; i < baris.length; i++) {
        const h = judulDari(baris[i]);
        if (h && h.tingkat <= tingkat)
            return { mulai, selesai: i };
    }
    return { mulai, selesai: baris.length };
}

export function bacaTugas(teks, judul = BAGIAN_TUGAS) {
    const batas = batasBagian(teks, judul);
    if (!batas)
        return [];

    const baris = teks.split('\n');
    const hasil = [];
    for (let i = batas.mulai; i < batas.selesai; i++) {
        const cocok = baris[i].match(POLA_TUGAS);
        if (cocok) {
            hasil.push({
                baris: i,
                selesai: cocok[2].toLowerCase() === 'x',
                teks: cocok[3].trim(),
            });
        }
    }
    return hasil;
}

export function tambahTugas(teks, tugasBaru, judul = BAGIAN_TUGAS) {
    const bersih = tugasBaru.trim();
    if (!bersih)
        return teks;

    const batas = batasBagian(teks, judul);
    if (!batas)
        return teks;

    const baris = teks.split('\n');

    // Disisipkan setelah baris berisi terakhir di bagian itu, bukan di ujung
    // bagian — supaya tidak menumpuk di bawah baris-baris kosong.
    let sisip = batas.mulai;
    for (let i = batas.mulai; i < batas.selesai; i++) {
        if (baris[i].trim() !== '')
            sisip = i + 1;
    }

    baris.splice(sisip, 0, `- [ ] ${bersih}`);
    return baris.join('\n');
}

export function setCentang(teks, nomorBaris, selesai) {
    const baris = teks.split('\n');
    if (nomorBaris < 0 || nomorBaris >= baris.length)
        return teks;

    const cocok = baris[nomorBaris].match(POLA_TUGAS);
    if (!cocok)
        return teks;

    baris[nomorBaris] = `${cocok[1]}- [${selesai ? 'x' : ' '}] ${cocok[3]}`;
    return baris.join('\n');
}

// Mengisi placeholder template Obsidian. Obsidian sendiri yang biasanya
// melakukan ini; kalau Memo yang membuat catatannya, dia harus mengisinya
// sendiri supaya berkasnya tidak berisi `{{date}}` mentah.
export function isiTemplate(template, tanggal) {
    const dua = n => String(n).padStart(2, '0');
    const iso = t => `${t.getFullYear()}-${dua(t.getMonth() + 1)}-${dua(t.getDate())}`;

    const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli',
        'Agustus', 'September', 'Oktober', 'November', 'Desember'];

    const kemarin = new Date(tanggal.getTime() - 86400000);
    const panjang = `${HARI[tanggal.getDay()]}, ${tanggal.getDate()} `
        + `${BULAN[tanggal.getMonth()]} ${tanggal.getFullYear()}`;

    return template
        .replace(/\{\{date-1d:YYYY-MM-DD\}\}/g, iso(kemarin))
        .replace(/\{\{date:YYYY-MM-DD\}\}/g, iso(tanggal))
        .replace(/\{\{date:dddd, D MMMM YYYY\}\}/g, panjang);
}
