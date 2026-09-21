// Jendela preferensi: menyunting pemetaan isyarat tangan ke aksi.
//
// Berkas yang disunting sama persis dengan yang dibaca pendeteksi Python,
// ~/.config/memo/isyarat.json. Pendeteksi memantau waktu ubah berkas dan
// memuat ulang sendiri, jadi perubahan di sini langsung berlaku tanpa restart.
//
// Pembersihan dan penjepitan nilai dikerjakan sisi Python (konfigurasi.py)
// sebagai satu-satunya pemegang aturan. Di sini hanya ada pembatasan
// secukupnya untuk kenyamanan; menyalin seluruh aturan validasi ke sini
// justru mengundang dua versi aturan yang lama-lama berbeda.

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const ISYARAT = [
    ['telapak_terbuka', 'Telapak terbuka'],
    ['jempol', 'Jempol'],
    ['telunjuk', 'Telunjuk'],
    ['damai', 'Dua jari'],
    ['tiga', 'Tiga jari'],
    ['kepalan', 'Kepalan'],
];

const JENIS = [
    ['nonaktif', 'Tidak melakukan apa-apa'],
    ['aktifkan', 'Aktifkan kendali'],
    ['volume', 'Volume'],
    ['tombol', 'Tombol pintas'],
    ['aplikasi', 'Buka aplikasi'],
    ['perintah', 'Jalankan perintah'],
    ['ekspresi', 'Ekspresi Memo'],
];

const PETUNJUK_TARGET = {
    tombol: 'ctrl+Page_Down',
    aplikasi: 'google-chrome.desktop',
    perintah: 'google-chrome --new-window',
    ekspresi: 'senang',
};

const BUTUH_TARGET = ['tombol', 'aplikasi', 'perintah', 'ekspresi'];

function jalurKonfigurasi() {
    const dasar = GLib.get_user_config_dir();
    return GLib.build_filenamev([dasar, 'memo', 'isyarat.json']);
}

function muat() {
    try {
        const [ok, isi] = GLib.file_get_contents(jalurKonfigurasi());
        if (!ok)
            return { isyarat: {} };
        const data = JSON.parse(new TextDecoder().decode(isi));
        return data?.isyarat ? data : { isyarat: {} };
    } catch (e) {
        return { isyarat: {} };
    }
}

function simpan(data) {
    const jalur = jalurKonfigurasi();
    const induk = Gio.File.new_for_path(jalur).get_parent();
    try {
        induk.make_directory_with_parents(null);
    } catch (e) {
        // sudah ada
    }
    const teks = `${JSON.stringify(data, null, 2)}\n`;
    GLib.file_set_contents(jalur, teks);
}

function daftarAplikasi() {
    return Gio.AppInfo.get_all()
        .filter(a => a.should_show())
        .map(a => [a.get_id(), a.get_display_name()])
        .sort((a, b) => a[1].localeCompare(b[1]));
}

export default class MemoPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const data = muat();
        data.isyarat ??= {};

        const halaman = new Adw.PreferencesPage({
            title: 'Isyarat',
            icon_name: 'input-touchpad-symbolic',
        });
        window.add(halaman);

        const catatan = new Adw.PreferencesGroup({
            title: 'Cara kerja',
            description: 'Tunjukkan telapak terbuka dulu untuk membuka kendali, '
                + 'lalu beri isyarat dalam 5 detik berikutnya. Tanpa itu, gerakan '
                + 'tangan biasa tidak akan mengubah apa pun.\n\n'
                + 'Perintah dijalankan langsung tanpa shell: tanda kutip dan spasi '
                + 'ditangani benar, tapi pipa dan pengalihan tidak. Untuk itu tulis '
                + 'secara terang-terangan: bash -c "..."',
        });
        halaman.add(catatan);

        const grup = new Adw.PreferencesGroup({ title: 'Pemetaan' });
        halaman.add(grup);

        const aplikasi = daftarAplikasi();

        for (const [kunci, judul] of ISYARAT)
            grup.add(this._barisIsyarat(data, kunci, judul, aplikasi));
    }

    _barisIsyarat(data, kunci, judul, aplikasi) {
        const entri = data.isyarat[kunci] ?? { jenis: 'nonaktif' };

        const baris = new Adw.ExpanderRow({ title: judul });

        const tulis = () => {
            data.isyarat[kunci] = entri;
            simpan(data);
        };

        // --- jenis aksi ---
        const modelJenis = new Gtk.StringList();
        for (const [, label] of JENIS)
            modelJenis.append(label);

        const pilihJenis = new Adw.ComboRow({
            title: 'Aksi',
            model: modelJenis,
            selected: Math.max(0, JENIS.findIndex(j => j[0] === entri.jenis)),
        });
        baris.add_row(pilihJenis);

        // --- arah volume ---
        const modelArah = new Gtk.StringList();
        modelArah.append('Naik');
        modelArah.append('Turun');
        const pilihArah = new Adw.ComboRow({
            title: 'Arah',
            model: modelArah,
            selected: entri.arah === 'turun' ? 1 : 0,
        });
        baris.add_row(pilihArah);

        // --- target ---
        const isianTarget = new Adw.EntryRow({
            title: 'Target',
            text: entri.target ?? '',
        });
        baris.add_row(isianTarget);

        // Pemilih aplikasi: mengetik id .desktop dari ingatan itu menyiksa,
        // jadi daftarnya disediakan langsung.
        const modelApl = new Gtk.StringList();
        for (const [, nama] of aplikasi)
            modelApl.append(nama);
        const pilihApl = new Adw.ComboRow({
            title: 'Aplikasi',
            model: modelApl,
            selected: Math.max(0, aplikasi.findIndex(a => a[0] === entri.target)),
        });
        baris.add_row(pilihApl);

        // --- pengulangan & waktu ---
        const sakelarUlang = new Adw.SwitchRow({
            title: 'Ulangi selagi ditahan',
            subtitle: 'Cocok untuk volume',
            active: !!entri.berulang,
        });
        baris.add_row(sakelarUlang);

        const jeda = new Adw.SpinRow({
            title: 'Jeda antar aksi (detik)',
            adjustment: new Gtk.Adjustment({
                lower: 0.2, upper: 5, step_increment: 0.05,
                value: entri.jeda ?? 0.7,
            }),
            digits: 2,
        });
        baris.add_row(jeda);

        const tahan = new Adw.SpinRow({
            title: 'Harus ditahan (detik)',
            subtitle: 'Naikkan untuk aksi yang sulit dibatalkan',
            adjustment: new Gtk.Adjustment({
                lower: 0, upper: 5, step_increment: 0.1,
                value: entri.tahan ?? 0,
            }),
            digits: 1,
        });
        baris.add_row(tahan);

        const segarkan = () => {
            const jenis = JENIS[pilihJenis.selected][0];
            pilihArah.visible = jenis === 'volume';
            isianTarget.visible = BUTUH_TARGET.includes(jenis) && jenis !== 'aplikasi';
            pilihApl.visible = jenis === 'aplikasi';
            sakelarUlang.visible = jenis !== 'nonaktif' && jenis !== 'aktifkan';
            jeda.visible = sakelarUlang.visible;
            tahan.visible = sakelarUlang.visible;

            isianTarget.set_tooltip_text(PETUNJUK_TARGET[jenis] ?? '');
            baris.subtitle = this._ringkasan(jenis, entri);
        };

        const kumpulkan = () => {
            const jenis = JENIS[pilihJenis.selected][0];
            entri.jenis = jenis;
            entri.berulang = sakelarUlang.active;
            entri.jeda = jeda.value;
            entri.tahan = tahan.value;

            if (jenis === 'volume')
                entri.arah = pilihArah.selected === 1 ? 'turun' : 'naik';
            else if (jenis === 'aplikasi')
                entri.target = aplikasi[pilihApl.selected]?.[0] ?? '';
            else if (BUTUH_TARGET.includes(jenis))
                entri.target = isianTarget.text;

            tulis();
            segarkan();
        };

        pilihJenis.connect('notify::selected', kumpulkan);
        pilihArah.connect('notify::selected', kumpulkan);
        pilihApl.connect('notify::selected', kumpulkan);
        isianTarget.connect('changed', kumpulkan);
        sakelarUlang.connect('notify::active', kumpulkan);
        jeda.connect('notify::value', kumpulkan);
        tahan.connect('notify::value', kumpulkan);

        segarkan();
        return baris;
    }

    _ringkasan(jenis, entri) {
        const label = JENIS.find(j => j[0] === jenis)?.[1] ?? jenis;
        if (jenis === 'volume')
            return `${label} ${entri.arah ?? 'naik'}`;
        if (BUTUH_TARGET.includes(jenis) && entri.target)
            return `${label}: ${entri.target}`;
        return label;
    }
}
