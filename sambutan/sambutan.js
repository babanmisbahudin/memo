// Sambutan Memo: login, logout, restart, shutdown, suspend.
//
//   gjs -m sambutan.js <masuk|keluar|restart|matikan|tidur> [--uji]
//
// Seperti island Memo yang membesar: kartu hitam turun dari tepi atas layar,
// berisi Memo piksel besar dengan gerak & partikel yang sama persis dengan di
// island (face.js + gerakPola.js dipakai langsung, bukan disalin).
//
// Esc membatalkan aksi; klik / tombol lain melanjutkan lebih cepat. Tanpa
// apa pun, aksi berjalan sendiri setelah beberapa detik. --uji: aksi tidak
// pernah dijalankan (untuk pengujian).
//
// Aksi lewat D-Bus gnome-session, varian tanpa dialog (Logout mode 1,
// RequestShutdown, RequestReboot): aplikasi tetap ditutup rapi oleh sesi,
// dan dialog hitung mundur GNOME tidak muncul lagi sesudah sambutan.
// Mencetak "lanjut" atau "batal"; kode keluar 1 bila aksinya gagal, supaya
// pemanggil (extension Memo) bisa kembali ke dialog bawaan GNOME.

import Gtk from 'gi://Gtk?version=4.0';
import Gdk from 'gi://Gdk';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Cairo from 'cairo';
import system from 'system';

import { drawFace, lerpParams, resolveExpression } from '../extension/face.js';
import { DASAR, FPS_PIKSEL, POSE_TIDUR, SPRITE, durasi, langkahPartikel, poseEmote }
    from '../extension/gerakPola.js';

const [jenisArg, ...sisaArg] = ARGV;
const UJI = sisaArg.includes('--uji');

function salam() {
    const jam = GLib.DateTime.new_now_local().get_hour();
    if (jam >= 4 && jam < 11)
        return 'Selamat pagi';
    if (jam >= 11 && jam < 15)
        return 'Selamat siang';
    if (jam >= 15 && jam < 18)
        return 'Selamat sore';
    return 'Selamat malam';
}

// Tiap jenis: teks, ekspresi wajah, rangkaian gerak, partikel, warna cahaya,
// aksi gnome-session [metode, parameter], dan lama tampil.
const JENIS = {
    masuk: {
        judul: 'Hallo Baban 👋', sub: `${salam()}, semoga harimu menyenangkan.`,
        ekspresi: 'senang', gerak: [['sapa', 300], ['lompat', 1400]], partikel: [['bintang', 3, 400], ['bintang', 2, 1500]],
        warna: '63, 185, 80', aksi: null, lama: 3600, petunjuk: 'klik untuk mulai',
    },
    keluar: {
        judul: 'Sampai nanti, Baban', sub: 'Memo jaga laptopnya. Login lagi ya.',
        ekspresi: 'senang', gerak: [['sapa', 300], ['angguk', 1500]], partikel: [['bintang', 2, 400]],
        warna: '88, 166, 255', aksi: ['Logout', new GLib.Variant('(u)', [1])], lama: 2800,
    },
    restart: {
        judul: 'Restart sebentar', sub: 'Memo segera kembali, Baban.',
        ekspresi: 'berpikir', gerak: [['putar', 300], ['lompat', 1500]], partikel: [['bintang', 3, 1300]],
        warna: '240, 180, 41', aksi: ['RequestReboot', null], lama: 2800,
    },
    matikan: {
        judul: 'Selamat istirahat, Baban', sub: 'Memo matikan laptopnya dulu.',
        ekspresi: 'tidur', gerak: [['angguk', 300]], partikel: [['z', 1, 700], ['z', 1, 1500], ['z', 1, 2300]],
        warna: '160, 120, 255', aksi: ['RequestShutdown', null], lama: 2900, tidur: true,
    },
    tidur: {
        judul: 'Tidur sebentar', sub: 'Memo ikut tidur. Bangunkan kapan saja.',
        ekspresi: 'tidur', gerak: [['angguk', 300]], partikel: [['z', 1, 600], ['z', 1, 1300]],
        warna: '100, 130, 255', aksi: ['Suspend', null], lama: 2000, tidur: true,
    },
};

const J = JENIS[jenisArg];
if (!J) {
    printerr(`pakai: gjs -m sambutan.js <${Object.keys(JENIS).join('|')}> [--uji]`);
    system.exit(2);
}

const SENI_L = 44;
const SENI_T = 26;
const SKALA = 6;
const KANVAS_L = 320;
const KANVAS_T = 200;
const BLOK = 4;
const FRAME_MS = Math.round(1000 / FPS_PIKSEL);

const CSS = `
window.sambutan { background-color: rgba(0, 0, 0, 0.88); }
.kartu {
    background-color: #000000;
    background-image: radial-gradient(ellipse at 60% 130%, rgba(${J.warna}, 0.38), transparent 62%);
    border-radius: 0 0 40px 40px;
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-top-width: 0;
    box-shadow: 0 30px 90px rgba(0, 0, 0, 0.7);
    padding: 26px 48px 30px 24px;
}
.judul { font-size: 34px; font-weight: 800; color: #ffffff; }
.sub { font-size: 17px; color: rgba(255, 255, 255, 0.58); }
.tunggu { font-family: monospace; font-size: 15px; font-weight: 800; color: rgb(${J.warna}); }
.petunjuk { font-size: 12px; color: rgba(255, 255, 255, 0.34); }
`;

function gambarSprite(cr, nama, x, y) {
    const s = SPRITE[nama];
    const n = parseInt(s.warna.slice(1), 16);
    cr.setSourceRGBA((n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255, 1);
    s.baris.forEach((baris, j) => [...baris].forEach((c, i) => {
        if (c === '#')
            cr.rectangle(Math.round(x + i * BLOK), Math.round(y + j * BLOK), BLOK, BLOK);
    }));
    cr.fill();
}

const app = new Gtk.Application({ application_id: `com.local.MemoSambutan.${jenisArg}` });

app.connect('activate', () => {
    const jendela = new Gtk.ApplicationWindow({ application: app, decorated: false, css_classes: ['sambutan'] });
    const css = new Gtk.CssProvider();
    css.load_from_string(CSS);
    Gtk.StyleContext.add_provider_for_display(Gdk.Display.get_default(), css,
        Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);

    // --- Wajah piksel + partikel -------------------------------------------
    const mulai = GLib.get_monotonic_time();
    const awal = resolveExpression('netral');
    const akhir = resolveExpression(J.ekspresi) ?? awal;
    const partikel = [];
    let emote = null;
    let emoteMulai = 0;

    const kanvas = new Gtk.DrawingArea({ content_width: KANVAS_L, content_height: KANVAS_T,
        valign: Gtk.Align.CENTER });
    kanvas.set_draw_func((_a, cr, w, h) => {
        const t = (GLib.get_monotonic_time() - mulai) / 1000;
        const kecil = new Cairo.ImageSurface(Cairo.Format.ARGB32, SENI_L, SENI_T);
        const c = new Cairo.Context(kecil);
        drawFace(c, SENI_L, SENI_T, lerpParams(awal, akhir, Math.min(1, t / 700)));
        c.$dispose();

        const diam = J.tidur && t > 700 ? POSE_TIDUR : DASAR;
        const p = emote ? poseEmote(emote, Math.min((GLib.get_monotonic_time() - emoteMulai) / 1000, durasi(emote)), diam) : diam;
        const piksel = v => Math.round(v / SKALA) * SKALA;
        cr.save();
        cr.translate(Math.round(w / 2 + piksel(p.ox * SENI_L * SKALA)), Math.round(h * 0.58 + piksel(p.oy * SENI_T * SKALA)));
        cr.rotate(Math.round(p.rz / 10) * 10 * Math.PI / 180);
        cr.scale(Math.round(p.sx * SENI_L) / SENI_L * SKALA, Math.round(p.sy * SENI_T) / SENI_T * SKALA);
        cr.translate(-SENI_L / 2, -SENI_T / 2);
        cr.setSourceSurface(kecil, 0, 0);
        cr.getSource().setFilter(Cairo.Filter.NEAREST);
        cr.paint();
        cr.restore();

        for (const q of partikel) {
            const pos = langkahPartikel(q.i, { arah: -1, simpang: q.simpang });
            if (pos?.tampak)
                gambarSprite(cr, q.nama, q.x + pos.dx * BLOK, q.y + pos.dy * BLOK);
        }
    });

    const semburkan = (nama, jumlah) => {
        for (let n = 0; n < jumlah; n++) {
            const sebar = jumlah > 1 ? (n / (jumlah - 1) - 0.5) * 180 : 40;
            partikel.push({ nama, x: KANVAS_L / 2 + sebar, y: KANVAS_T * 0.28, i: -n * 2, simpang: n % 2 ? 1 : -1 });
        }
    };
    for (const [nama, ms] of J.gerak) {
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            emote = nama;
            emoteMulai = GLib.get_monotonic_time();
            return GLib.SOURCE_REMOVE;
        });
    }
    for (const [nama, jumlah, ms] of J.partikel) {
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            semburkan(nama, jumlah);
            return GLib.SOURCE_REMOVE;
        });
    }

    // --- Teks ---------------------------------------------------------------
    const judul = new Gtk.Label({ label: J.judul, xalign: 0, css_classes: ['judul'] });
    const sub = new Gtk.Label({ label: J.sub, xalign: 0, css_classes: ['sub'] });
    const tunggu = new Gtk.Label({ label: '', xalign: 0, css_classes: ['tunggu'] });
    const petunjuk = new Gtk.Label({
        label: J.petunjuk ?? 'Esc batal · klik untuk lanjut', xalign: 0, css_classes: ['petunjuk'] });
    const teks = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 8, valign: Gtk.Align.CENTER });
    for (const w of [judul, sub, tunggu, petunjuk])
        teks.append(w);

    const kartu = new Gtk.Box({ spacing: 18, css_classes: ['kartu'] });
    kartu.append(kanvas);
    kartu.append(teks);
    const turun = new Gtk.Revealer({ transition_type: Gtk.RevealerTransitionType.SLIDE_DOWN,
        transition_duration: 380, halign: Gtk.Align.CENTER, valign: Gtk.Align.START, child: kartu });
    jendela.set_child(turun);

    // Langkah piksel 12 fps: gerak, partikel, dan tanda tunggu.
    let langkah = 0;
    const detak = GLib.timeout_add(GLib.PRIORITY_DEFAULT, FRAME_MS, () => {
        langkah++;
        for (const q of partikel)
            q.i++;
        while (partikel.length && langkahPartikel(partikel[0].i) === null && partikel[0].i > 0)
            partikel.shift();
        const titik = Math.floor(langkah / 4) % 4;
        tunggu.label = J.aksi ? ['■ □ □', '■ ■ □', '■ ■ ■', '□ ■ ■'][titik] : '';
        kanvas.queue_draw();
        return GLib.SOURCE_CONTINUE;
    });

    let selesai = false;
    const akhiri = (teks, gagal = false) => {
        print(teks);
        if (gagal)
            kodeKeluar = 1;
        app.quit();
    };
    const tutup = jalankan => {
        if (selesai)
            return;
        selesai = true;
        turun.reveal_child = false;
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 420, () => {
            GLib.source_remove(detak);
            if (!jalankan || !J.aksi || UJI) {
                akhiri(jalankan ? 'lanjut' : 'batal');
                return GLib.SOURCE_REMOVE;
            }
            const [metode, parameter] = J.aksi;
            Gio.DBus.session.call('org.gnome.SessionManager', '/org/gnome/SessionManager',
                'org.gnome.SessionManager', metode, parameter, null, Gio.DBusCallFlags.NONE, 5000, null,
                (bus, res) => {
                    try {
                        bus.call_finish(res);
                        akhiri('lanjut');
                    } catch (e) {
                        printerr(`sambutan: ${metode} gagal: ${e.message}`);
                        akhiri('lanjut', true);
                    }
                });
            return GLib.SOURCE_REMOVE;
        });
    };

    const klik = new Gtk.GestureClick();
    klik.connect('released', () => tutup(true));
    jendela.add_controller(klik);
    const tombol = new Gtk.EventControllerKey();
    tombol.connect('key-pressed', (_c, keyval) => {
        tutup(keyval !== Gdk.KEY_Escape);
        return true;
    });
    jendela.add_controller(tombol);

    jendela.fullscreen();
    jendela.present();
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 80, () => {
        turun.reveal_child = true;
        return GLib.SOURCE_REMOVE;
    });
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, J.lama, () => {
        tutup(true);
        return GLib.SOURCE_REMOVE;
    });
});

let kodeKeluar = 0;
app.run([]);
system.exit(kodeKeluar);
