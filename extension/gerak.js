// Penggerak tubuh Memo bergaya piksel: menerapkan pose dari gerakPola.js ke
// aktor wajah, 12 langkah per detik seperti sprite, plus partikel pixel-art.
// Timer hanya hidup selama ada emote atau partikel; saat diam bebannya nol.
// TIDAK menyentuh face.js / robotFace.js.

import St from 'gi://St';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {
    DASAR, FPS_PIKSEL, POSE_TIDUR, SPRITE,
    durasi, keAktor, langkahPartikel, poseEmote,
} from './gerakPola.js';

const FRAME_MS = Math.round(1000 / FPS_PIKSEL);

function warnaRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}

export class Gerak {
    // skalaDasar: ukuran satu piksel seni di layar (Memo desktop 2,6).
    // amplitudo: besar lompatan relatif tinggi wajah; island memakai lebih
    // kecil supaya tidak melompat keluar top bar. arahPartikel: -1 naik
    // (desktop), +1 turun (island menempel di tepi atas layar).
    constructor(actor, { skalaDasar = 1, amplitudo = 1, pivotY = 0.75, arahPartikel = -1, blokPartikel = 2 } = {}) {
        this._actor = actor;
        this._skala = skalaDasar;
        this._amp = amplitudo;
        this._arah = arahPartikel;
        this._blok = blokPartikel;
        this._id = 0;
        this._antre = [];
        this._tidur = false;
        this._emote = null;
        this._mulai = 0;
        this._partikel = [];
        this.emoteAktif = null;
        // Pivot di bawah tengah: gepeng-melar bertumpu di "kaki".
        actor.set_pivot_point(0.5, pivotY);
        this._terapkan(DASAR);
    }

    get tidur() {
        return this._tidur;
    }

    _poseDiam() {
        return this._tidur ? POSE_TIDUR : DASAR;
    }

    _terapkan(p) {
        const a = this._actor;
        const v = keAktor(p, { lebar: a.width || 44, tinggi: a.height || 26, skala: this._skala, amplitudo: this._amp });
        a.translation_x = v.translation_x;
        a.translation_y = v.translation_y;
        a.scale_x = v.scale_x;
        a.scale_y = v.scale_y;
        a.rotation_angle_z = v.rotation_angle_z;
    }

    _pastikanTimer() {
        if (this._id)
            return;
        this._id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, FRAME_MS, () => {
            try {
                this._langkah();
            } catch (e) {
                console.error(`[dynamic-island] gerak: ${e}`);
                this._emote = null;
                this.emoteAktif = null;
                this._partikel.forEach(p => p.aktor.destroy());
                this._partikel = [];
            }
            if (this._emote || this._partikel.length)
                return GLib.SOURCE_CONTINUE;
            this._id = 0;
            return GLib.SOURCE_REMOVE;
        });
    }

    _langkah() {
        if (this._emote) {
            const t = (GLib.get_monotonic_time() - this._mulai) / 1000;
            const total = durasi(this._emote);
            this._terapkan(poseEmote(this._emote, Math.min(t, total), this._poseDiam()));
            if (t >= total) {
                const berikut = this._antre.shift();
                if (berikut) {
                    this._emote = berikut;
                    this.emoteAktif = berikut;
                    this._mulai = GLib.get_monotonic_time();
                } else {
                    this._emote = null;
                    this.emoteAktif = null;
                    this._terapkan(this._poseDiam());
                }
            }
        }
        this._partikel = this._partikel.filter(p => {
            p.i++;
            if (p.i < 0)
                return true;
            const posisi = langkahPartikel(p.i, { arah: this._arah, simpang: p.simpang });
            if (!posisi) {
                p.aktor.destroy();
                return false;
            }
            p.aktor.visible = posisi.tampak;
            p.aktor.set_position(p.x + posisi.dx * this._blok, p.y + posisi.dy * this._blok);
            return true;
        });
    }

    // Mainkan emote `kali` kali; `antre: true` menunggu emote yang sedang jalan.
    main(nama, { kali = 1, antre = false } = {}) {
        if (!durasi(nama))
            return false;
        const ulang = Array(Math.max(0, kali - 1)).fill(nama);
        if (antre && this._emote) {
            this._antre.push(nama, ...ulang);
        } else {
            this._antre = ulang;
            this._emote = nama;
            this.emoteAktif = nama;
            this._mulai = GLib.get_monotonic_time();
            if (nama !== 'bangun')
                this._tidur = false;
        }
        this._pastikanTimer();
        return true;
    }

    // Partikel pixel-art yang melayang dari wajah, muncul bergiliran.
    partikel(jenis, jumlah = 1) {
        const sprite = SPRITE[jenis];
        if (!sprite || !this._actor.mapped)
            return;
        const [x, y] = this._actor.get_transformed_position();
        const [w, h] = this._actor.get_transformed_size();
        const b = this._blok;
        const lebar = sprite.baris[0].length * b;
        const tinggi = sprite.baris.length * b;
        const [r, g, bl] = warnaRgb(sprite.warna);
        for (let n = 0; n < jumlah; n++) {
            const aktor = new St.DrawingArea({ width: lebar, height: tinggi, visible: false, reactive: false });
            aktor.connect('repaint', () => {
                const cr = aktor.get_context();
                try {
                    cr.setSourceRGBA(r, g, bl, 1);
                    sprite.baris.forEach((baris, j) => {
                        [...baris].forEach((c, i) => {
                            if (c === '#')
                                cr.rectangle(i * b, j * b, b, b);
                        });
                    });
                    cr.fill();
                } finally {
                    cr.$dispose();
                }
            });
            Main.uiGroup.add_child(aktor);
            const sebar = jumlah > 1 ? (n / (jumlah - 1) - 0.5) * w * 0.9 : 0;
            const px = Math.round(x + w / 2 + sebar - lebar / 2);
            const py = Math.round(this._arah > 0 ? y + h * 0.55 : y + h * 0.1 - tinggi);
            aktor.set_position(px, py);
            this._partikel.push({ aktor, x: px, y: py, i: -1 - n * 2, simpang: n % 2 ? 1 : -1 });
        }
        this._pastikanTimer();
    }

    tidurkan() {
        if (this._tidur)
            return;
        this._emote = null;
        this.emoteAktif = null;
        this._antre = [];
        this._tidur = true;
        this._terapkan(POSE_TIDUR);
    }

    bangunkan() {
        if (!this._tidur)
            return;
        this._tidur = false;
        this.main('bangun');
    }

    get jumlahPartikel() {
        return this._partikel.length;
    }

    destroy() {
        if (this._id) {
            GLib.source_remove(this._id);
            this._id = 0;
        }
        this._partikel.forEach(p => p.aktor.destroy());
        this._partikel = [];
        this._antre = [];
        this._emote = null;
    }
}
