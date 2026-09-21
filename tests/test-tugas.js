import system from 'system';

import { bacaTugas, batasBagian, isiTemplate, setCentang, tambahTugas } from '../tugas.js';

let failed = 0;
let passed = 0;

function check(label, condition) {
    if (condition) {
        passed++;
    } else {
        failed++;
        printerr(`GAGAL: ${label}`);
    }
}

function sama(label, dapat, harap) {
    check(`${label}\n  dapat: ${JSON.stringify(dapat)}\n  harap: ${JSON.stringify(harap)}`,
        dapat === harap);
}

// Catatan harian meniru bentuk vault sungguhan, lengkap dengan poin biasa
// tanpa kotak centang yang tidak boleh disentuh.
const CATATAN = [
    '---',
    'tipe: harian',
    'tanggal: 2026-09-20',
    '---',
    '',
    '# Minggu, 20 September 2026',
    '',
    '## Fokus hari ini',
    '- Pasang Obsidian',
    '- [ ] Beli kopi',
    '- [x] Bayar listrik',
    '',
    '## Yang dikerjakan',
    '- [ ] ini bukan tugas fokus, jangan ikut terbaca',
    '',
    '## Masuk kotak',
    '- ide mentah',
].join('\n');

// --- membaca ---
const tugas = bacaTugas(CATATAN);
sama('hanya baris berkotak-centang di Fokus hari ini yang terbaca', tugas.length, 2);
sama('tugas pertama', tugas[0].teks, 'Beli kopi');
sama('tugas pertama belum selesai', tugas[0].selesai, false);
sama('tugas kedua sudah selesai', tugas[1].selesai, true);
check('poin biasa tidak ikut terbaca', !tugas.some(t => t.teks === 'Pasang Obsidian'));
check('tugas di bagian lain tidak ikut terbaca',
    !tugas.some(t => t.teks.includes('bukan tugas fokus')));

// --- batas bagian ---
const batas = batasBagian(CATATAN);
check('batas bagian ketemu', batas !== null);
sama('bagian berhenti sebelum judul berikutnya', batas.selesai, 12);
sama('judul yang tidak ada mengembalikan null', batasBagian(CATATAN, 'Tidak Ada'), null);

// --- menambah ---
const ditambah = tambahTugas(CATATAN, 'Telepon bank');
check('tugas baru muncul', ditambah.includes('- [ ] Telepon bank'));
sama('bertambah tepat satu baris',
    ditambah.split('\n').length, CATATAN.split('\n').length + 1);
const setelah = bacaTugas(ditambah);
sama('terbaca sebagai tugas ketiga', setelah.length, 3);
sama('disisipkan setelah tugas terakhir, bukan di ujung bagian',
    ditambah.split('\n')[11], '- [ ] Telepon bank');
check('bagian lain tidak berubah', ditambah.includes('## Masuk kotak\n- ide mentah'));
sama('teks kosong tidak mengubah apa pun', tambahTugas(CATATAN, '   '), CATATAN);
sama('catatan tanpa bagian Fokus tidak berubah',
    tambahTugas('# Kosong\n', 'apa pun'), '# Kosong\n');

// --- mencentang ---
const dicentang = setCentang(CATATAN, 9, true);
check('kotak berubah jadi terisi', dicentang.includes('- [x] Beli kopi'));
sama('jumlah baris tidak berubah',
    dicentang.split('\n').length, CATATAN.split('\n').length);
const dibuka = setCentang(CATATAN, 10, false);
check('kotak bisa dibuka lagi', dibuka.includes('- [ ] Bayar listrik'));
sama('baris bukan tugas tidak tersentuh', setCentang(CATATAN, 8, true), CATATAN);
sama('nomor baris di luar jangkauan aman', setCentang(CATATAN, 999, true), CATATAN);

// Perlindungan terpenting: tidak ada baris yang boleh hilang
for (const [label, hasil] of [['tambah', ditambah], ['centang', dicentang]]) {
    const asli = CATATAN.split('\n').filter(b => b.trim() && !b.match(/^\s*-\s+\[/));
    const ada = hasil.split('\n');
    check(`${label}: semua baris non-tugas masih utuh`,
        asli.every(b => ada.includes(b)));
}

// --- template ---
const TEMPLATE = [
    'tanggal: {{date:YYYY-MM-DD}}',
    '# {{date:dddd, D MMMM YYYY}}',
    '[[{{date-1d:YYYY-MM-DD}}]]',
].join('\n');
const diisi = isiTemplate(TEMPLATE, new Date(2026, 8, 20));
check('tanggal ISO terisi', diisi.includes('tanggal: 2026-09-20'));
check('tanggal panjang bahasa Indonesia terisi',
    diisi.includes('# Minggu, 20 September 2026'));
check('tautan catatan kemarin terisi', diisi.includes('[[2026-09-19]]'));
check('tidak ada placeholder tersisa', !diisi.includes('{{'));

print(`${passed} lolos, ${failed} gagal`);
if (failed > 0)
    system.exit(1);
