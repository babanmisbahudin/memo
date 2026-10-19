import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';

import { NEUTRAL, resolveExpression, lerpParams, drawFace } from './face.js';

export const FACE_WIDTH = 44;
export const FACE_HEIGHT = 26;

const TRANSITION_MS = 260;
// Denyut mendengar: mata membesar dan menyala mengikuti kekerasan suara yang
// benar-benar masuk mikrofon. Angkanya datang dari layanan suara, yang memang
// sudah menghitung RMS tiap 100 ms untuk mendeteksi hening — jadi denyutnya
// menunjukkan Memo sungguh mendengarmu, bukan animasi yang berputar sendiri.
const LEVEL_KE_GLOW = 0.55;
const LEVEL_KE_BUKA = 0.30;
const LEVEL_REDAM = 0.35;      // perataan, supaya tidak menyentak tiap sampel
const BLINK_MIN_MS = 2500;
const BLINK_SPREAD_MS = 3500;
const BLINK_MS = 220;

export class RobotFace {
    constructor() {
        this.actor = new St.DrawingArea({
            width: FACE_WIDTH,
            height: FACE_HEIGHT,
            y_align: Clutter.ActorAlign.CENTER,
            reactive: true,
        });
        this.actor.connect('repaint', () => this._onRepaint());
        // Shell dimatikan tanpa destroy() dari kita: timer & animasi wajah
        // berhenti sebelum menyentuh aktor yang sudah hilang.
        this.actor.connect('destroy', () => {
            this._blinkEnabled = false;
            if (this._blinkId) {
                GLib.source_remove(this._blinkId);
                this._blinkId = null;
            }
            for (const t of [this._timeline, this._blinkTimeline, this._hoverTimeline, this._pulseTimeline])
                t?.stop();
        });

        // Ekspresi reaktif: kursor hover membuat mata melebar, klik kiri
        // memicu senyum spontan, klik kanan memicu miring bingung.
        this._hover = 0;
        this._happyPulse = 0;
        this._tiltPulse = 0;

        this._hoverTimeline = new Clutter.Timeline({ actor: this.actor, duration: 160 });
        this._hoverTimeline.connect('new-frame', () => {
            const t = this._hoverTimeline.get_progress();
            this._hover = this._hoverTimeline._arah > 0 ? t : 1 - t;
            this.actor.queue_repaint();
        });
        this._hoverTimeline.connect('completed', () => {
            this._hover = this._hoverTimeline._arah > 0 ? 1 : 0;
            this.actor.queue_repaint();
        });
        this._hoverTimeline._arah = 0;

        this._pulseTimeline = new Clutter.Timeline({ actor: this.actor, duration: 520 });
        this._pulseTimeline.connect('new-frame', () => {
            const t = this._pulseTimeline.get_progress();
            const wave = Math.sin(t * Math.PI);
            if (this._pulseTimeline._mode === 'senang') {
                this._happyPulse = wave;
                this._tiltPulse = 0;
            } else {
                this._tiltPulse = wave * 0.8;
                this._happyPulse = 0;
            }
            this.actor.queue_repaint();
        });
        this._pulseTimeline.connect('completed', () => {
            this._happyPulse = 0;
            this._tiltPulse = 0;
            this.actor.queue_repaint();
        });

        this.actor.connect('enter-event', () => this._setHover(true));
        this.actor.connect('leave-event', () => this._setHover(false));
        this.actor.connect('button-press-event', (_a, ev) => {
            const button = ev.get_button?.() ?? ev.button;
            this._pulseTimeline.stop();
            this._pulseTimeline._mode = button === 3 ? 'bingung' : 'senang';
            this._pulseTimeline.start();
            
            // Saat diklik kiri, panggil onClick untuk membuka menu
            if (button === 1 && this.onClick) {
                this.onClick();
            }
            
            return Clutter.EVENT_STOP;
        });

        this._expression = 'netral';
        this._from = { ...NEUTRAL };
        this._target = { ...NEUTRAL };
        // Wardrobe ala Coucou: rona + cahaya yang ditumpuk di atas ekspresi
        // aktif. Logika animasi tidak berubah — hanya dua angka tambahan.
        this._tintHue = null;
        this._tintGlow = 0;
        this._progress = 1;
        this._gazeX = 0;
        this._gazeY = 0;
        this._blinkAmount = 0;
        this._level = 0;
        this._levelHalus = 0;
        this._repaintCount = 0;

        this._blinkEnabled = false;
        this._blinkId = null;

        this._timeline = new Clutter.Timeline({
            actor: this.actor,
            duration: TRANSITION_MS,
        });
        this._timeline.connect('new-frame', () => {
            this._progress = this._timeline.get_progress();
            this.actor.queue_repaint();
        });
        this._timeline.connect('completed', () => {
            this._progress = 1;
            this.actor.queue_repaint();
        });

        this._blinkTimeline = new Clutter.Timeline({
            actor: this.actor,
            duration: BLINK_MS,
        });
        this._blinkTimeline.connect('new-frame', () => {
            const t = this._blinkTimeline.get_progress();
            this._blinkAmount = 1 - Math.abs(t * 2 - 1);
            this.actor.queue_repaint();
        });
        this._blinkTimeline.connect('completed', () => {
            this._blinkAmount = 0;
            this.actor.queue_repaint();
        });
    }

    get expression() {
        return this._expression;
    }

    get repaintCount() {
        return this._repaintCount;
    }

    _setHover(on) {
        this._hoverTimeline.stop();
        this._hoverTimeline._arah = on ? 1 : -1;
        this._hoverTimeline.start();
    }

    setExpression(name) {        const target = resolveExpression(name);
        if (!target) {
            console.log(`[dynamic-island] ekspresi tidak dikenal: ${name}`);
            return false;
        }

        this._from = this._currentParams();
        this._target = target;
        this._expression = name;
        this._progress = 0;

        this._timeline.stop();
        this._timeline.start();
        return true;
    }

    // Tingkat suara 0..1 dari layanan suara. Diratakan di sini, bukan di
    // pengirimnya, supaya sumbernya tetap melaporkan angka apa adanya.
    setLevel(nilai) {
        const bersih = Math.max(0, Math.min(1, nilai));
        if (bersih === this._level && this._levelHalus === bersih)
            return;
        this._level = bersih;
        this._levelHalus += (bersih - this._levelHalus) * LEVEL_REDAM;
        this.actor.queue_repaint();
    }

    // Wardrobe: hue 0-360 atau null (ikut ekspresi), glowBoost 0-1.
    setTint(hue, glowBoost = 0) {
        this._tintHue = hue === null || hue === undefined ? null
            : Math.max(0, Math.min(360, hue));
        this._tintGlow = Math.max(0, Math.min(1, glowBoost || 0));
        this.actor.queue_repaint();
    }

    setGaze(x, y) {
        const clampedX = Math.max(-1, Math.min(1, x));
        const clampedY = Math.max(-1, Math.min(1, y));
        if (clampedX === this._gazeX && clampedY === this._gazeY)
            return;
        this._gazeX = clampedX;
        this._gazeY = clampedY;
        this.actor.queue_repaint();
    }

    setBlinkingEnabled(enabled) {
        if (enabled === this._blinkEnabled)
            return;
        this._blinkEnabled = enabled;

        if (enabled) {
            this._scheduleBlink();
            return;
        }

        if (this._blinkId) {
            GLib.source_remove(this._blinkId);
            this._blinkId = null;
        }
        this._blinkTimeline.stop();
        this._blinkAmount = 0;
        this.actor.queue_repaint();
    }

    _scheduleBlink() {
        const delay = BLINK_MIN_MS + Math.floor(Math.random() * BLINK_SPREAD_MS);
        this._blinkId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
            this._blinkId = null;
            this._blinkTimeline.stop();
            this._blinkTimeline.start();
            if (this._blinkEnabled)
                this._scheduleBlink();
            return GLib.SOURCE_REMOVE;
        });
    }

    _currentParams() {
        const params = lerpParams(this._from, this._target, this._progress);
        // Wardrobe ditumpuk paling akhir supaya menang atas ekspresi,
        // tapi tidak menyentuh kurva/animasi apa pun.
        if (this._tintHue !== null && this._tintHue !== undefined)
            params.hue = this._tintHue;
        if (this._tintGlow > 0)
            params.glow = Math.min(1, params.glow + this._tintGlow);
        params.gazeX += this._gazeX;
        params.gazeY += this._gazeY;
        params.open *= 1 - this._blinkAmount;

        // Respons interaktif: hover melebarkan mata, klik memicu senyum/miring.
        params.open *= 1 + this._hover * 0.2;
        params.curve += this._happyPulse;
        params.tilt += this._tiltPulse;

        if (this._levelHalus > 0.01) {
            params.glow = Math.min(1, params.glow + this._levelHalus * LEVEL_KE_GLOW);
            params.open *= 1 + this._levelHalus * LEVEL_KE_BUKA;
        }

        return params;
    }

    _onRepaint() {
        this._repaintCount++;
        const cr = this.actor.get_context();
        try {
            const [width, height] = this.actor.get_surface_size();
            drawFace(cr, width, height, this._currentParams());
        } catch (e) {
            console.error(`[dynamic-island] gagal menggambar wajah: ${e}`);
        } finally {
            cr.$dispose();
        }
    }

    destroy() {
        if (this._blinkId) {
            GLib.source_remove(this._blinkId);
            this._blinkId = null;
        }
        this._blinkEnabled = false;
        this._timeline.stop();
        this._blinkTimeline.stop();
        this._hoverTimeline.stop();
        this._pulseTimeline.stop();
        this.actor.destroy();
    }
}
