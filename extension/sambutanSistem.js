// Log Out, Restart, Power Off, dan Suspend dari menu sistem membuka layar
// sambutan Memo (sambutan/sambutan.js) lebih dulu; skrip itulah yang
// menjalankan aksinya lewat gnome-session, atau membatalkannya dengan Esc.
//
// Bila sambutan tidak bisa dijalankan atau keluar dengan galat, aksi bawaan
// GNOME (dengan dialog konfirmasinya) dipanggil, jadi tombol daya tidak
// pernah diam saja. Penanda ~/.config/memo/tanpa-sambutan (ditulis
// `memo-pasang.py sambutan --lepas`) mengembalikan perilaku bawaan; dicek
// tiap klik, jadi berlaku tanpa login ulang.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { getDefault as getSystemActions } from 'resource:///org/gnome/shell/misc/systemActions.js';

import { jalurRepo } from './jalur.js';

const AKSI = {
    activateLogout: 'keluar',
    activateRestart: 'restart',
    activatePowerOff: 'matikan',
    activateSuspend: 'tidur',
};

export class SambutanSistem {
    enable() {
        this._asli = new Map();
        const skrip = jalurRepo('sambutan', 'sambutan.js');
        if (!skrip) {
            console.warn('[dynamic-island] sambutan/sambutan.js tidak ditemukan; menu daya tetap bawaan');
            return;
        }
        const aksi = getSystemActions();
        for (const [nama, jenis] of Object.entries(AKSI)) {
            if (typeof aksi[nama] !== 'function')
                continue;
            const milikSendiri = Object.prototype.hasOwnProperty.call(aksi, nama);
            const asli = aksi[nama];
            this._asli.set(nama, { asli, milikSendiri });
            aksi[nama] = () => {
                if (GLib.file_test(`${GLib.get_user_config_dir()}/memo/tanpa-sambutan`, GLib.FileTest.EXISTS))
                    asli.call(aksi);
                else
                    this._tampilkan(skrip, jenis, () => asli.call(aksi));
            };
        }
    }

    _tampilkan(skrip, jenis, cadangan) {
        const argv = ['gjs', '-m', skrip, jenis];
        // Shell uji (tests/gnome) tidak boleh benar-benar keluar/mematikan.
        if (GLib.getenv('MEMO_SAMBUTAN_UJI'))
            argv.push('--uji');
        let proses;
        try {
            proses = Gio.Subprocess.new(argv, Gio.SubprocessFlags.NONE);
        } catch (e) {
            console.error(`[dynamic-island] sambutan ${jenis}: ${e}`);
            cadangan();
            return;
        }
        proses.wait_async(null, (p, res) => {
            try {
                p.wait_finish(res);
            } catch (e) {
                console.error(`[dynamic-island] sambutan ${jenis}: ${e}`);
            }
            if (!p.get_successful()) {
                console.error(`[dynamic-island] sambutan ${jenis} gagal, pakai dialog bawaan`);
                cadangan();
            }
        });
    }

    disable() {
        const aksi = getSystemActions();
        for (const [nama, { asli, milikSendiri }] of this._asli ?? []) {
            if (milikSendiri)
                aksi[nama] = asli;
            else
                delete aksi[nama];
        }
        this._asli = null;
    }
}
