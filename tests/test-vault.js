// Menguji tulis-baca ke vault memakai SALINAN, diarahkan lewat MEMO_VAULT.
// Catatan sungguhan tidak pernah disentuh oleh pengujian ini.
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import system from 'system';

import * as Vault from '../vault.js';

let gagal = 0, lolos = 0;
const cek = (label, syarat) => {
    if (syarat) lolos++;
    else { gagal++; printerr(`GAGAL: ${label}`); }
};

const akar = GLib.getenv('MEMO_VAULT');
print(`vault uji: ${akar}`);
cek('vault terdeteksi ada', Vault.vaultAda());

const loop = new GLib.MainLoop(null, false);

(async () => {
    try {
        const awal = await Vault.muatTugas();
        cek('catatan hari ini kosong dari tugas di awal', awal.length === 0);

        const dua = await Vault.tambah('Beli kopi');
        cek('tugas pertama tersimpan', dua.length === 1 && dua[0].teks === 'Beli kopi');
        cek('tugas baru belum dicentang', dua[0].selesai === false);

        await Vault.tambah('Bayar listrik');
        const tiga = await Vault.muatTugas();
        cek('dua tugas terbaca setelah dibaca ulang', tiga.length === 2);

        const dicentang = await Vault.centang(tiga[0].baris, true);
        cek('tugas pertama tercentang', dicentang[0].selesai === true);
        cek('tugas kedua tidak ikut berubah', dicentang[1].selesai === false);

        const dibuka = await Vault.centang(tiga[0].baris, false);
        cek('centang bisa dibatalkan', dibuka[0].selesai === false);

        // Isi berkas diperiksa langsung: yang penting bukan cuma apa yang
        // dilaporkan API, tapi apa yang benar-benar tertulis di catatan.
        const hari = new Date();
        const dua_ = n => String(n).padStart(2, '0');
        const nama = `${hari.getFullYear()}-${dua_(hari.getMonth() + 1)}-${dua_(hari.getDate())}.md`;
        const jalur = GLib.build_filenamev([akar, '06-Harian', nama]);
        const [ok, isi] = GLib.file_get_contents(jalur);
        const teks = new TextDecoder().decode(isi);

        cek('berkas catatan harian benar-benar dibuat', ok);
        cek('tidak ada placeholder template tersisa', !teks.includes('{{'));
        cek('judul harian terisi', /^# \w+, \d+ \w+ \d{4}$/m.test(teks));
        cek('kedua tugas ada di berkas',
            teks.includes('- [ ] Beli kopi') && teks.includes('- [ ] Bayar listrik'));
        cek('bagian lain template tetap utuh',
            teks.includes('## Yang dipelajari') && teks.includes('## Masuk kotak'));
        cek('tautan catatan kemarin terisi', /\[\[\d{4}-\d{2}-\d{2}\]\]/.test(teks));

        print(`\n${lolos} lolos, ${gagal} gagal`);
    } catch (e) {
        printerr(`ERROR: ${e}\n${e.stack}`);
        gagal++;
    }
    loop.quit();
})();

loop.run();
system.exit(gagal > 0 ? 1 : 0);
