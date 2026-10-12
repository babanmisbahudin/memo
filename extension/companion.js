// Memo di desktop ala Coucou: "seret Mochi keluar island, dia melayang
// sebagai companion 120pt, mengikuti kursor, dan terbang pulang saat ada
// peringatan". Di GNOME ini aktor mengambang di Main.uiGroup — memakai
// RobotFace yang SAMA (instansi kedua, logika animasi tidak diubah), jadi
// wajahnya selalu sinkron dengan island lewat sync().
//
// Posisi + status tersimpan di ~/.config/memo/companion.json.

import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { RobotFace } from './robotFace.js';

const SKALA = 2.6;
const CONFIG = '/.config/memo/companion.json';

function rumah() {
    return GLib.get_home_dir();
}

function muatKonfig() {
    try {
        const [ok, contents] = GLib.file_get_contents(rumah() + CONFIG);
        if (!ok)
            return {};
        const d = JSON.parse(new TextDecoder().decode(contents));
        return typeof d === 'object' && d !== null ? d : {};
    } catch (e) {
        return {};
    }
}

function simpanKonfig(d) {
    try {
        const dir = rumah() + '/.config/memo';
        GLib.mkdir_with_parents(dir, 0o700);
        GLib.file_set_contents(dir + '/companion.json', JSON.stringify(d));
    } catch (e) {
        console.error(`[dynamic-island] gagal menyimpan companion: ${e}`);
    }
}

export class MemoCompanion {
    constructor(island) {
        this._island = island;
        const cfg = muatKonfig();

        this._face = new RobotFace();
        this._face.actor.set_pivot_point(0.5, 0.5);
        this._face.actor.set_scale(SKALA, SKALA);
        this._face.setBlinkingEnabled(true);

        this.actor = new St.BoxLayout({
            style_class: 'dynamic-island-pill memo-companion',
            y_align: Clutter.ActorAlign.CENTER,
            x_align: Clutter.ActorAlign.CENTER,
            reactive: true,
        });
        this.actor.add_effect(new Shell.BlurEffect({
            brightness: 0.75,
            radius: 20,
            mode: Shell.BlurMode.BACKGROUND,
        }));
        this.actor.add_child(this._face.actor);

        const monitor = Main.layoutManager.primaryMonitor;
        this.actor.set_position(
            cfg.x ?? (monitor.x + monitor.width - 180),
            cfg.y ?? (monitor.y + monitor.height / 2));
        Main.uiGroup.add_child(this.actor);
        this.actor.visible = !!cfg.terbuka;

        this._drag = null;
        this.actor.connect('button-press-event', (_a, ev) => {
            const [x, y] = ev.get_coords();
            const [ax, ay] = this.actor.get_position();
            this._drag = { dx: x - ax, dy: y - ay, gerak: false };
            return Clutter.EVENT_STOP;
        });
        this.actor.connect('motion-event', (_a, ev) => {
            if (!this._drag)
                return Clutter.EVENT_PROPAGATE;
            const [x, y] = ev.get_coords();
            this.actor.set_position(x - this._drag.dx, y - this._drag.dy);
            this._drag.gerak = true;
            return Clutter.EVENT_STOP;
        });
        this.actor.connect('button-release-event', () => {
            const diklik = this._drag && !this._drag.gerak;
            this._drag = null;
            if (diklik) {
                this._island.menu.toggle();
            } else {
                const [x, y] = this.actor.get_position();
                simpanKonfig({ x, y, terbuka: true });
            }
            return Clutter.EVENT_STOP;
        });

        // Mata mengikuti kursor seperti di island, dengan laju tetap yang
        // murah (satu repaint per 150ms hanya saat kursor bergerak).
        this._gazeTerakhir = '';
        this._gazeId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 150, () => {
            try {
                const [px, py] = global.get_pointer();
                const kunci = `${Math.round(px / 20)}:${Math.round(py / 20)}`;
                if (kunci !== this._gazeTerakhir) {
                    this._gazeTerakhir = kunci;
                    const [fx, fy] = this._face.actor.get_transformed_position();
                    const w = this._face.actor.width * SKALA;
                    const h = this._face.actor.height * SKALA;
                    this._face.setGaze((px - (fx + w / 2)) / 500,
                        (py - (fy + h / 2)) / 350);
                }
            } catch (e) {
                console.error(`[dynamic-island] companion gaze: ${e}`);
            }
            return GLib.SOURCE_CONTINUE;
        });
    }

    get visible() {
        return this.actor.visible;
    }

    sync(namaEkspresi) {
        // sinkron satu arah island -> companion; gagal tidak boleh
        // mengganggu island.
        try {
            this._face.setExpression(namaEkspresi);
        } catch (e) {
            console.error(`[dynamic-island] companion sync: ${e}`);
        }
    }

    setTint(hue, glowBoost) {
        try {
            this._face.setTint(hue, glowBoost);
        } catch (e) {
            console.error(`[dynamic-island] companion tint: ${e}`);
        }
    }

    tampilkan() {
        this.actor.visible = true;
        const [x, y] = this.actor.get_position();
        simpanKonfig({ x, y, terbuka: true });
    }

    sembunyikan() {
        const [x, y] = this.actor.get_position();
        simpanKonfig({ x, y, terbuka: false });
        this.actor.visible = false;
    }

    destroy() {
        if (this._gazeId) {
            GLib.source_remove(this._gazeId);
            this._gazeId = null;
        }
        this._face.destroy();
        this.actor.destroy();
    }
}
