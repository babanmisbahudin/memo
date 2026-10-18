// Sambutan Memo layar penuh: login, logout, restart, shutdown, suspend.
//
//   gjs -m sambutan.js <masuk|keluar|restart|matikan|tidur> [--uji]
//
// Island Memo di tepi atas layar membesar sampai memenuhi layar, lalu jadi
// adegan pixel-art (layar.js): langit menurut jam, kota, bintang, Memo besar
// dengan gerak & ekspresi yang sama dengan di island (face.js + gerakPola.js
// dipakai langsung, bukan disalin). Penutupnya beda per jenis: login kembali
// mengecil jadi island, logout iris menutup ke Memo, restart glitch lalu
// layar CRT padam, shutdown CRT padam, suspend melarut ke gelap.
//
// Esc membatalkan aksi, juga selagi animasi penutup belum selesai; klik /
// tombol lain melanjutkan lebih cepat. Tanpa apa pun, aksi berjalan sendiri
// setelah beberapa detik. --uji: aksi tidak pernah dijalankan (pengujian).
//
// Aksi lewat D-Bus gnome-session, varian tanpa dialog (Logout mode 1,
// RequestShutdown, RequestReboot): aplikasi tetap ditutup rapi oleh sesi,
// dan dialog hitung mundur GNOME tidak muncul lagi sesudah sambutan. Sesudah
// Log Out / Restart / Power Off berhasil diminta, layar dibiarkan hitam
// sampai sesi berakhir (paling lama TAHAN_MS; klik/tombol menutupnya) supaya
// desktop tidak sempat muncul lagi di sela animasi dan padamnya sesi.
// Mencetak "lanjut" atau "batal"; kode keluar 1 bila aksinya gagal, supaya
// pemanggil (extension Memo) bisa kembali ke dialog bawaan GNOME.

import Gtk from 'gi://Gtk?version=4.0';
import Gdk from 'gi://Gdk';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import system from 'system';

import { Layar, MS_LANGKAH, NAMA_JENIS, waktuSekarang } from './layar.js';

const [jenisArg, ...sisaArg] = ARGV;
const UJI = sisaArg.includes('--uji');

// Aksi gnome-session per jenis: [metode, parameter].
const AKSI = {
    masuk: null,
    keluar: ['Logout', new GLib.Variant('(u)', [1])],
    restart: ['RequestReboot', null],
    matikan: ['RequestShutdown', null],
    tidur: ['Suspend', null],
};
// Suspend tidak ditahan: sesudah bangun, layar hitam tidak boleh tersisa.
const TAHAN_MS = { keluar: 8000, restart: 8000, matikan: 8000 };

if (!NAMA_JENIS.includes(jenisArg)) {
    printerr(`pakai: gjs -m sambutan.js <${NAMA_JENIS.join('|')}> [--uji]`);
    system.exit(2);
}

// Jendela transparan: di luar island yang sedang membesar/mengecil, desktop
// tetap terlihat.
const CSS = 'window.sambutan { background: none; }';

const app = new Gtk.Application({ application_id: `com.local.MemoSambutan.${jenisArg}` });
let kodeKeluar = 0;

app.connect('activate', () => {
    const jendela = new Gtk.ApplicationWindow({ application: app, decorated: false, css_classes: ['sambutan'] });
    const css = new Gtk.CssProvider();
    css.load_from_string(CSS);
    Gtk.StyleContext.add_provider_for_display(Gdk.Display.get_default(), css,
        Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);

    const sekarang = () => GLib.get_monotonic_time() / 1000;
    const waktu = waktuSekarang();
    let layar = null;
    let mulai = null;
    // tampil -> tutup (animasi penutup) -> aksi (menunggu gnome-session) -> tahan
    let fase = 'tampil';
    let lanjut = true;
    let langkahTerakhir = -1;

    const kanvas = new Gtk.DrawingArea({ hexpand: true, vexpand: true });
    kanvas.set_draw_func((_a, cr, w, h) => {
        if (!layar || layar.lebar !== w || layar.tinggi !== h)
            layar = new Layar(jenisArg, { lebar: w, tinggi: h, waktu, dari: layar });
        mulai ??= sekarang();
        layar.gambar(cr, sekarang() - mulai);
    });
    jendela.set_child(kanvas);

    const akhiri = (teks, gagal = false) => {
        print(teks);
        if (gagal)
            kodeKeluar = 1;
        app.quit();
    };

    const jalankan = () => {
        const aksi = AKSI[jenisArg];
        if (!lanjut || !aksi || UJI) {
            akhiri(lanjut ? 'lanjut' : 'batal');
            return;
        }
        const [metode, parameter] = aksi;
        Gio.DBus.session.call('org.gnome.SessionManager', '/org/gnome/SessionManager',
            'org.gnome.SessionManager', metode, parameter, null, Gio.DBusCallFlags.NONE, 5000, null,
            (bus, res) => {
                try {
                    bus.call_finish(res);
                } catch (e) {
                    printerr(`sambutan: ${metode} gagal: ${e.message}`);
                    akhiri('lanjut', true);
                    return;
                }
                if (!TAHAN_MS[jenisArg]) {
                    akhiri('lanjut');
                    return;
                }
                print('lanjut');
                fase = 'tahan';
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, TAHAN_MS[jenisArg], () => {
                    app.quit();
                    return GLib.SOURCE_REMOVE;
                });
            });
    };

    const tutup = mau => {
        if (!layar || !(fase === 'tampil' || (fase === 'tutup' && !mau)))
            return;
        if (layar.tutup(sekarang() - mulai, mau)) {
            lanjut = mau;
            fase = 'tutup';
        }
    };

    // Digambar ulang hanya saat langkah piksel (12 per detik) berganti.
    kanvas.add_tick_callback(() => {
        if (mulai === null || !layar)
            return GLib.SOURCE_CONTINUE;
        const t = sekarang() - mulai;
        if (fase === 'tampil' && t >= layar.J.lama)
            tutup(true);
        if (fase === 'tutup' && layar.selesai(t)) {
            fase = 'aksi';
            jalankan();
        }
        const n = Math.floor(t / MS_LANGKAH);
        if (n !== langkahTerakhir) {
            langkahTerakhir = n;
            kanvas.queue_draw();
        }
        return GLib.SOURCE_CONTINUE;
    });

    const klik = new Gtk.GestureClick();
    klik.connect('released', () => {
        if (fase === 'tahan')
            app.quit();
        else
            tutup(true);
    });
    jendela.add_controller(klik);
    const tombol = new Gtk.EventControllerKey();
    tombol.connect('key-pressed', (_c, keyval) => {
        if (fase === 'tahan')
            app.quit();
        else
            tutup(keyval !== Gdk.KEY_Escape);
        return true;
    });
    jendela.add_controller(tombol);

    jendela.fullscreen();
    jendela.present();
});

app.run([]);
system.exit(kodeKeluar);
