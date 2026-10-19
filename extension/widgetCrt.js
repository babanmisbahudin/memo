// Widget St bergaya CRT untuk island & panel Memo: latar layar retro
// (LatarCrt), teks huruf piksel bercahaya (LabelPiksel), dan batang
// kebutuhan piksel (BatangPiksel). Semua gambar diserahkan ke crt.js; di sini
// hanya aktor, ukuran, dan timer animasi.

import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';

import { WARNA_KEADAAN, gambarCrt, muatkan, normalkan, tulisBercahaya } from './crt.js';
import { FPS_PIKSEL } from './gerakPola.js';
import { lebarTeks } from './hurufPiksel.js';

const MS_LANGKAH = Math.round(1000 / FPS_PIKSEL);
const sama = (a, b) => a && b && a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
const css = ([r, g, b]) => `rgb(${r},${g},${b})`;

// Latar layar CRT yang mengisi induknya (taruh paling bawah di BinLayout).
// gerak: null (diam, tanpa timer) | 'sapuan' (garis terang menyapu turun) |
// 'denyut' (pendar berdenyut 2x/dtk).
export class LatarCrt {
    constructor({ atas = 0, bawah = 4, s = 2, pendar = 0.22 } = {}) {
        this._opsi = { atas, bawah, s, pendar };
        this._warna = WARNA_KEADAAN.diam;
        this._gerak = null;
        this._langkah = 0;
        this._id = 0;
        this.actor = new St.DrawingArea({ x_expand: true, y_expand: true, reactive: false });
        this.actor.connect('repaint', () => this._gambar());
        this.actor.connect('destroy', () => this._henti());
    }

    get warna() {
        return this._warna;
    }

    setWarna(warna) {
        if (sama(warna, this._warna))
            return;
        this._warna = warna;
        this.actor.queue_repaint();
    }

    setGerak(gerak) {
        if (gerak === this._gerak)
            return;
        this._gerak = gerak;
        this._henti();
        if (gerak) {
            this._id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, MS_LANGKAH, () => {
                this._langkah++;
                this.actor.queue_repaint();
                return GLib.SOURCE_CONTINUE;
            });
        }
        this.actor.queue_repaint();
    }

    _gambar() {
        const cr = this.actor.get_context();
        try {
            const [l, t] = this.actor.get_surface_size();
            const f = this._langkah;
            gambarCrt(cr, l, t, {
                ...this._opsi, warna: this._warna,
                sapuan: this._gerak === 'sapuan' ? (f % 24) / 24 : null,
                denyut: this._gerak === 'denyut' && f % 6 < 3 ? 1 : 0,
            });
        } finally {
            cr.$dispose();
        }
    }

    _henti() {
        if (this._id) {
            GLib.source_remove(this._id);
            this._id = 0;
        }
    }
}

// Teks huruf piksel bercahaya. Teks yang memuat huruf di luar huruf piksel
// (emoji, aksara lain) ditampilkan dengan St.Label biasa (`kelasBiasa`),
// bukan tanda tanya. `lebarMaks` (px) memotong teks dengan '...'.
export class LabelPiksel {
    constructor({ u = 2, warna = [255, 255, 255], cahaya = 0.35, lebarMaks = 0, kelasBiasa = null } = {}) {
        this._u = u;
        this._warna = warna;
        this._cahaya = cahaya;
        this._lebarMaks = lebarMaks;
        this._teks = '';
        this._piksel = '';
        this.actor = new St.Widget({ layout_manager: new Clutter.BinLayout(), y_align: Clutter.ActorAlign.CENTER });
        this._area = new St.DrawingArea({ y_align: Clutter.ActorAlign.CENTER });
        this._area.connect('repaint', () => this._gambar());
        this._biasa = new St.Label({ visible: false, y_align: Clutter.ActorAlign.CENTER, style_class: kelasBiasa });
        this._biasa.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        if (lebarMaks)
            this._biasa.style = `max-width: ${lebarMaks}px;`;
        this.actor.add_child(this._area);
        this.actor.add_child(this._biasa);
        this.text = '';
    }

    get text() {
        return this._teks;
    }

    set text(teks) {
        this._teks = teks ?? '';
        const n = normalkan(this._teks);
        this._piksel = n === null ? null : this._lebarMaks ? muatkan(n, this._u, this._lebarMaks) : n;
        const u = this._u;
        if (this._piksel === null) {
            this._biasa.text = this._teks;
            this._biasa.visible = true;
            this._area.visible = false;
        } else {
            this._biasa.visible = false;
            this._area.visible = true;
            // Satu satuan sisa di tiap sisi untuk pendar; 7 baris huruf + 2 ekor.
            this._area.set_size(lebarTeks(this._piksel, u) + 2 * u, 11 * u);
            this._area.queue_repaint();
        }
    }

    setWarna(warna) {
        if (sama(warna, this._warna))
            return;
        this._warna = warna;
        this._biasa.style = `color: ${css(warna)};${this._lebarMaks ? ` max-width: ${this._lebarMaks}px;` : ''}`;
        this._area.queue_repaint();
    }

    _gambar() {
        if (!this._piksel)
            return;
        const cr = this._area.get_context();
        try {
            tulisBercahaya(cr, this._piksel, this._u, this._u, this._u, this._warna, { cahaya: this._cahaya });
        } finally {
            cr.$dispose();
        }
    }
}

// Batang kebutuhan piksel: deretan kotak, yang menyala sebanyak nilai (0..1).
export class BatangPiksel {
    constructor({ warna = [126, 231, 135], kotak = 18, s = 6, celah = 2, tinggi = 8 } = {}) {
        this._warna = warna;
        this._kotak = kotak;
        this._s = s;
        this._celah = celah;
        this._nilai = 0;
        this.actor = new St.DrawingArea({ width: kotak * (s + celah), height: tinggi, y_align: Clutter.ActorAlign.CENTER });
        this.actor.connect('repaint', () => this._gambar());
    }

    get nilai() {
        return this._nilai;
    }

    set nilai(v) {
        const n = Math.max(0, Math.min(1, Number(v) || 0));
        if (n === this._nilai)
            return;
        this._nilai = n;
        this.actor.queue_repaint();
    }

    _gambar() {
        const cr = this.actor.get_context();
        try {
            const [, t] = this.actor.get_surface_size();
            const [r, g, b] = this._warna.map(v => v / 255);
            const nyala = Math.round(this._nilai * this._kotak);
            for (let i = 0; i < this._kotak; i++) {
                cr.setSourceRGBA(r, g, b, i < nyala ? 1 : 0.16);
                cr.rectangle(i * (this._s + this._celah), 0, this._s, t);
                cr.fill();
            }
        } finally {
            cr.$dispose();
        }
    }
}
