// Jendela GTK kosong untuk skenario Memo hidup (tests/gnome/skenario.py):
//   gjs -m jendela-uji.js <judul> [--maksimal]
// NON_UNIQUE supaya dua jendela uji bisa terbuka bersamaan.
import Gtk from 'gi://Gtk?version=4.0';
import Gio from 'gi://Gio';

const [judul = 'Jendela Uji Memo', ...sisa] = ARGV;
const app = new Gtk.Application({ application_id: 'com.local.MemoJendelaUji', flags: Gio.ApplicationFlags.NON_UNIQUE });
app.connect('activate', () => {
    const w = new Gtk.ApplicationWindow({ application: app, title: judul, default_width: 700, default_height: 380 });
    if (sisa.includes('--maksimal'))
        w.maximize();
    w.present();
});
app.run([]);
