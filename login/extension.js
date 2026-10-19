// Layar kunci ala Memo. Tampilannya di stylesheet.css (dimuat GNOME Shell
// selama extension ini aktif; session-modes memuat unlock-dialog supaya
// gayanya tetap berlaku saat layar terkunci).
//
// Yang tidak bisa lewat CSS saja ditambahkan sebagai aktor:
// - pemandangan piksel menurut jam (latar-<bagian>.png, sama dengan layar
//   login GDM) menutupi latar blur bawaan;
// - bintang berkelip, bintang jatuh, dan burung lewat di atasnya (kunciPola.js);
// - jam & tanggal huruf piksel menggantikan label jam bawaan, berwarna
//   cahaya langitnya; kelas memo-<bagian> pada dialog mewarnai kartu sandi.
// Semuanya hanya hiasan: tidak reaktif, tanpa tombol atau aksi, karena yang
// tampil di layar kunci bisa dilihat dan disentuh siapa saja.
//
// Huruf piksel dan bagian hari diambil dari extension Memo di repo yang sama.
// Folder ini dipasang sebagai symlink ke repo/login dan GNOME memuatnya lewat
// jalur symlink, jadi impor relatif '../extension/...' tidak bisa: jalur
// aslinya dibaca dulu, lalu modulnya diimpor dinamis.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import { AnimasiKunci, BARIS, KOLOM, WARNA_BAGIAN, tanggalKunci } from './kunciPola.js';

const MS_LANGKAH = Math.round(1000 / 12);
const BAGIAN = Object.keys(WARNA_BAGIAN);
// Tiga tingkat terang titik animasi (kuat 1..3).
const TERANG = [0, 90, 170, 255];
const WARNA_TITIK = {
    bintang: () => '#eef2ff',
    meteor: () => '#ffffff',
    burung: bagian => (bagian === 'pagi' ? '#2a2034' : '#14223a'),
};

export default class MemoKunci extends Extension {
    enable() {
        this._aktif = true;
        this._muat().then(() => {
            if (!this._aktif)
                return;
            // Dialog kunci dibuat sebelum mode unlock-dialog didorong, jadi
            // saat 'updated' datang dialognya sudah ada.
            Main.sessionMode.connectObject('updated', () => this._hiasi(), this);
            this._hiasi();
        }).catch(e => logError(e, 'memo-kunci: modul Memo tidak termuat'));
    }

    async _muat() {
        if (this._modul)
            return;
        const sini = Gio.File.new_for_path(this.path);
        const info = sini.query_info('standard::symlink-target', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
        const target = info.get_symlink_target();
        const asli = target ? sini.get_parent().resolve_relative_path(target) : sini;
        const modul = nama => import(asli.get_parent().get_child('extension').get_child(nama).get_uri());
        const [waktu, widget] = await Promise.all([modul('waktuPola.js'), modul('widgetCrt.js')]);
        this._modul = { bagianHari: waktu.bagianHari, LabelPiksel: widget.LabelPiksel };
    }

    _hiasi() {
        const dialog = Main.screenShield?._dialog;
        const jam = dialog?._clock;
        if (!jam?._time || !dialog._backgroundGroup || dialog._memoKunci)
            return;
        const { LabelPiksel } = this._modul;
        const ikat = () => new Clutter.BindConstraint({ source: dialog, coordinate: Clutter.BindCoordinate.SIZE });
        const k = {
            dialog, jam, bagian: null, f: 0, kotak: {},
            langit: new St.Widget({ style_class: 'memo-kunci-langit', reactive: false, constraints: ikat() }),
            titik: new St.Widget({ reactive: false, constraints: ikat() }),
            waktu: new LabelPiksel({ u: 8, cahaya: 0.5 }),
            tanggal: new LabelPiksel({ u: 3, cahaya: 0.25, kelasBiasa: 'unlock-dialog-clock-date' }),
        };
        dialog.insert_child_above(k.langit, dialog._backgroundGroup);
        dialog.insert_child_above(k.titik, k.langit);
        for (const [i, label] of [k.waktu, k.tanggal].entries()) {
            label.actor.set({ x_align: Clutter.ActorAlign.CENTER, reactive: false });
            jam.insert_child_at_index(label.actor, i);
        }
        k.waktu.actor.add_style_class_name('memo-kunci-waktu');
        jam._time.visible = false;
        jam._date.visible = false;
        jam._time.connectObject('notify::text', () => this._segarkanJam(), this);
        k.langit.connect('destroy', () => this._henti());
        dialog._memoKunci = k;
        this._k = k;
        this._segarkanJam();
        this._id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, MS_LANGKAH, () => {
            this._langkah();
            return GLib.SOURCE_CONTINUE;
        });
    }

    // Tiap menit (label jam bawaan berganti): salin jam, tulis tanggal, dan
    // ganti langit bila bagian hari berganti.
    _segarkanJam() {
        const k = this._k;
        k.waktu.text = k.jam._time.text;
        k.tanggal.text = tanggalKunci(new Date());
        const bagian = this._modul.bagianHari(new Date().getHours());
        if (bagian !== k.bagian)
            this._aturBagian(bagian);
    }

    _aturBagian(bagian) {
        const k = this._k;
        k.bagian = bagian;
        const gambar = Gio.File.new_for_path(`${this.path}/latar-${bagian}.png`).get_uri();
        k.langit.style = `background-image: url("${gambar}");`;
        for (const b of BAGIAN)
            k.dialog.remove_style_class_name(`memo-${b}`);
        k.dialog.add_style_class_name(`memo-${bagian}`);
        const { teks } = WARNA_BAGIAN[bagian];
        k.waktu.setWarna(teks);
        k.tanggal.setWarna(teks);
        k.animasi = new AnimasiKunci(bagian);
        k.titik.destroy_all_children();
        k.kotak = {};
        this._langkah();
    }

    // Satu bingkai animasi: titik-titik kunciPola dipasang di kisi latar.
    // Latar memakai background-size: cover, jadi petaknya sc x sc dan
    // kelebihan gambar terpotong rata di kedua sisi.
    _langkah() {
        const k = this._k;
        if (!k?.titik.mapped)
            return;
        const [l, t] = k.titik.get_size();
        const sc = Math.max(l / KOLOM, t / BARIS);
        const ox = (l - KOLOM * sc) / 2, oy = (t - BARIS * sc) / 2;
        const sisi = Math.ceil(sc);
        const per = { bintang: [], meteor: [], burung: [] };
        for (const titik of k.animasi.titik(k.f++))
            per[titik[2]].push(titik);
        for (const [jenis, daftar] of Object.entries(per)) {
            const kolam = k.kotak[jenis] ??= [];
            while (kolam.length < daftar.length) {
                const a = new St.Widget({ reactive: false, style: `background-color: ${WARNA_TITIK[jenis](k.bagian)};` });
                k.titik.add_child(a);
                kolam.push(a);
            }
            kolam.forEach((a, i) => {
                const titik = daftar[i];
                a.visible = Boolean(titik);
                if (!titik)
                    return;
                a.set_position(Math.round(ox + titik[0] * sc), Math.round(oy + titik[1] * sc));
                a.set_size(sisi, sisi);
                a.opacity = TERANG[titik[3]];
            });
        }
    }

    _henti() {
        if (this._id) {
            GLib.source_remove(this._id);
            this._id = 0;
        }
        this._k = null;
    }

    disable() {
        this._aktif = false;
        Main.sessionMode.disconnectObject(this);
        const k = this._k;
        this._henti();
        if (!k)
            return;
        k.jam._time.disconnectObject(this);
        k.jam._time.visible = true;
        k.jam._date.visible = true;
        for (const b of BAGIAN)
            k.dialog.remove_style_class_name(`memo-${b}`);
        for (const a of [k.langit, k.titik, k.waktu.actor, k.tanggal.actor])
            a.destroy();
        delete k.dialog._memoKunci;
    }
}
