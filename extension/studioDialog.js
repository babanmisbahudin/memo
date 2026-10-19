// Studio Memo: popup layar karakter ala game untuk Memo yang baru lahir
// (docs/superpowers/specs/2026-10-20-studio-memo-design.md). Hanya dibuka
// lewat wizard (telur baru / Memo lama yang belum berkenalan); rupa terkunci
// sesudah disimpan.
//
// Kiri: pratinjau Memo besar (berkedip, melompat kecil tiap ada yang
// berubah). Kanan: nama, jenis kelamin, tab kategori, pilihan ◀ ▶ dan kotak
// warna. Item istimewa yang belum dibuka tampil dengan gembok & harga koin
// dan tidak bisa disimpan.

import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';

import { KATALOG, KATEGORI, WARNA, WARNA_MATA, acakRupa, bolehDipilih, geser, harga, rapikanRupa } from './hidup/studio.js';
import { KELAMIN } from './hidup/hayat.js';
import { gambarMemo } from './hidup/gambarMemo.js';

const TAB = [
    ['badan', [['bentuk', 'bentuk'], ['warna', null], ['pola', 'pola']]],
    ['mata', [['mata', 'mata'], ['warnaMata', null]]],
    ['mulut', [['mulut', 'mulut'], ['pipi', 'pipi']]],
    ['kepala', [['kepala', 'kepala']]],
    ['ekstra', [['ekstra', 'ekstra']]],
];
const NAMA_ID = { bandoKucing: 'bando kucing', warnaMata: 'warna mata', bawaan: 'bawaan (topi/pita)' };
const LOMPAT = [0, 8, 13, 15, 13, 8, 3, 0];

export class StudioMemo {
    // hayat: hayat Memo sekarang; onSimpan({ nama, kelamin, avatar }).
    constructor({ hayat, onSimpan }) {
        this._terbuka = hayat.terbuka ?? [];
        this._rupa = rapikanRupa(hayat.avatar);
        this._kelamin = hayat.kelamin ?? null;
        this._telur = hayat.tahap === 'telur';
        this._onSimpan = onSimpan;
        this._f = 0;
        this._lompat = LOMPAT.length;

        this.dialog = new ModalDialog.ModalDialog({ styleClass: 'memo-studio-dialog', destroyOnClose: true });
        const akar = new St.BoxLayout({ vertical: true, style_class: 'memo-studio' });
        akar.add_child(new St.Label({ text: 'STUDIO MEMO', style_class: 'memo-studio-judul' }));
        const isi = new St.BoxLayout({ style_class: 'memo-studio-isi' });
        akar.add_child(isi);

        this._pratinjau = new St.DrawingArea({ width: 260, height: 230, style_class: 'memo-studio-pratinjau' });
        this._pratinjau.connect('repaint', () => this._gambar());
        isi.add_child(this._pratinjau);

        const kanan = new St.BoxLayout({ vertical: true, style_class: 'memo-studio-kanan', x_expand: true });
        isi.add_child(kanan);
        this.entri = new St.Entry({ style_class: 'memo-chat-entri memo-entri-nama', can_focus: true, hint_text: 'Memo',
            text: hayat.nama ?? 'Memo' });
        this.entri.clutter_text.max_length = 16;
        kanan.add_child(this.entri);
        const barisKelamin = new St.BoxLayout({ style_class: 'memo-segmen' });
        this._tombolKelamin = KELAMIN.map(k => {
            const b = this._tombol(k, () => {
                this._kelamin = k;
                this._segarkan(true);
            });
            b._memoId = k;
            barisKelamin.add_child(b);
            return b;
        });
        kanan.add_child(barisKelamin);

        const barisTab = new St.BoxLayout({ style_class: 'memo-segmen' });
        this._tombolTab = {};
        for (const [id] of TAB) {
            const b = this._tombol(id, () => this.pilihTab(id));
            this._tombolTab[id] = b;
            barisTab.add_child(b);
        }
        kanan.add_child(barisTab);
        this._isiTab = new St.BoxLayout({ vertical: true, style_class: 'memo-studio-tab' });
        kanan.add_child(this._isiTab);
        this._info = new St.Label({ style_class: 'memo-langkah', text: '' });
        kanan.add_child(this._info);

        this.dialog.contentLayout.add_child(akar);
        this.dialog.setButtons([
            { label: 'acak', action: () => this.acak() },
            { label: 'batal', action: () => this.dialog.close(), key: Clutter.KEY_Escape },
            { label: this._telur ? 'tetaskan' : 'simpan', action: () => this.simpan(), default: true },
        ]);
        this._tombolSimpan = this.dialog.dialogLayout.buttonLayout?.get_children().at(-1) ?? null;
        this.pilihTab('badan');

        this._id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, Math.round(1000 / 12), () => {
            this._f++;
            if (this._lompat < LOMPAT.length)
                this._lompat++;
            this._pratinjau.queue_repaint();
            return GLib.SOURCE_CONTINUE;
        });
        this.dialog.connect('destroy', () => {
            if (this._id)
                GLib.source_remove(this._id);
            this._id = 0;
        });
    }

    open() {
        this.dialog.open();
    }

    get rupa() {
        return { ...this._rupa };
    }

    _tombol(teks, aksi) {
        const b = new St.Button({ label: teks, style_class: 'memo-btn memo-btn-gelap memo-pilihan', can_focus: true });
        b.connect('clicked', aksi);
        return b;
    }

    pilihTab(id) {
        this._tab = id;
        for (const [k, b] of Object.entries(this._tombolTab)) {
            if (k === id)
                b.add_style_pseudo_class('checked');
            else
                b.remove_style_pseudo_class('checked');
        }
        this._isiTab.destroy_all_children();
        this._nilai = {};
        for (const [kategori, jenis] of TAB.find(([t]) => t === id)[1]) {
            if (jenis === null) {
                // Kotak warna.
                const baris = new St.BoxLayout({ style_class: 'memo-segmen memo-studio-warna' });
                const daftar = kategori === 'warna' ? Object.entries(WARNA).map(([w, v]) => [w, v.badan])
                    : Object.entries(WARNA_MATA).map(([w, v]) => [w, v ? `rgb(${v.map(c => Math.round(c * 255)).join(',')})` : null]);
                this._swatch = daftar.map(([w, css]) => {
                    const b = new St.Button({ style_class: 'memo-baju', can_focus: true, accessible_name: w,
                        style: css ? `background-color: ${css};` : '',
                        child: css ? null : new St.Label({ text: 'A', style_class: 'memo-langkah' }) });
                    b._memoId = w;
                    b._kategori = kategori;
                    b.connect('clicked', () => this.pilih(kategori, w));
                    baris.add_child(b);
                    return b;
                });
                this._isiTab.add_child(baris);
                continue;
            }
            const baris = new St.BoxLayout({ style_class: 'memo-segmen memo-studio-baris' });
            baris.add_child(new St.Label({ text: NAMA_ID[kategori] ?? kategori, style_class: 'memo-bagian-judul memo-studio-label',
                y_align: Clutter.ActorAlign.CENTER }));
            baris.add_child(this._tombol('◀', () => this.geser(kategori, -1)));
            const nilai = new St.Label({ style_class: 'memo-studio-nilai', y_align: Clutter.ActorAlign.CENTER });
            this._nilai[kategori] = nilai;
            baris.add_child(nilai);
            baris.add_child(this._tombol('▶', () => this.geser(kategori, 1)));
            this._isiTab.add_child(baris);
        }
        this._segarkan(false);
    }

    geser(kategori, arah) {
        this.pilih(kategori, geser(kategori, this._rupa[kategori], arah));
    }

    pilih(kategori, id) {
        if (!KATALOG[kategori]?.some(([x]) => x === id))
            return;
        this._rupa = { ...this._rupa, [kategori]: id };
        this._segarkan(true);
    }

    acak() {
        this._rupa = acakRupa(Math.random, this._terbuka);
        this._segarkan(true);
    }

    // Item terkunci yang sedang dipilih (tidak boleh disimpan).
    get terkunci() {
        return KATEGORI.filter(k => !bolehDipilih(k, this._rupa[k], this._terbuka));
    }

    simpan() {
        if (this.terkunci.length || !this._kelamin) {
            this._segarkan(false);
            return false;
        }
        this._onSimpan({ nama: this.entri.get_text() || 'Memo', kelamin: this._kelamin, avatar: { ...this._rupa } });
        this.dialog.close();
        return true;
    }

    _segarkan(lompat) {
        if (lompat)
            this._lompat = 0;
        for (const b of this._tombolKelamin) {
            if (b._memoId === this._kelamin)
                b.add_style_pseudo_class('checked');
            else
                b.remove_style_pseudo_class('checked');
        }
        for (const [k, l] of Object.entries(this._nilai ?? {})) {
            const id = this._rupa[k];
            const kunci = !bolehDipilih(k, id, this._terbuka);
            l.text = `${NAMA_ID[id] ?? id}${kunci ? `  [kunci · ${harga(k, id)} koin]` : ''}`;
        }
        for (const b of this._swatch ?? []) {
            if (b._memoId === this._rupa[b._kategori])
                b.add_style_pseudo_class('checked');
            else
                b.remove_style_pseudo_class('checked');
        }
        const kunci = this.terkunci;
        this._info.text = !this._kelamin ? 'pilih jenis kelamin dulu'
            : kunci.length ? `terkunci: ${kunci.map(k => NAMA_ID[this._rupa[k]] ?? this._rupa[k]).join(', ')} — butuh koin`
            : this._telur ? 'siap menetas!' : 'siap disimpan';
        if (this._tombolSimpan)
            this._tombolSimpan.reactive = !kunci.length && !!this._kelamin;
        this._pratinjau.queue_repaint();
    }

    _gambar() {
        const cr = this._pratinjau.get_context();
        try {
            const l = this._pratinjau.width, t = this._pratinjau.height;
            cr.setSourceRGB(0.02, 0.025, 0.03);
            cr.paint();
            // Lantai & bayangan.
            const lantai = t - 26;
            cr.setSourceRGB(0.16, 0.2, 0.18);
            cr.rectangle(0, lantai, l, 2);
            cr.fill();
            cr.setSourceRGBA(0, 0, 0, 0.5);
            cr.rectangle(l / 2 - 60, lantai - 3, 120, 6);
            cr.fill();
            const naik = LOMPAT[Math.min(this._lompat, LOMPAT.length - 1)];
            const kedip = this._f % 40 >= 38;
            gambarMemo(cr, l / 2, lantai - naik, {
                ...this._rupa, kelamin: this._kelamin, tahap: 'dewasa', ukuran: 1.35,
                ekspresi: this._lompat < LOMPAT.length ? 'senang' : kedip ? 'tidur' : 'netral',
            });
        } finally {
            cr.$dispose();
        }
    }
}
