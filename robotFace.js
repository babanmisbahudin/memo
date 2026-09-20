import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';

import { NEUTRAL, resolveExpression, lerpParams, drawFace } from './face.js';

export const FACE_WIDTH = 44;
export const FACE_HEIGHT = 26;

const TRANSITION_MS = 260;
const BLINK_MIN_MS = 2500;
const BLINK_SPREAD_MS = 3500;
const BLINK_MS = 220;

export class RobotFace {
    constructor() {
        this.actor = new St.DrawingArea({
            width: FACE_WIDTH,
            height: FACE_HEIGHT,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.actor.connect('repaint', () => this._onRepaint());

        this._expression = 'netral';
        this._from = { ...NEUTRAL };
        this._target = { ...NEUTRAL };
        this._progress = 1;
        this._gazeX = 0;
        this._gazeY = 0;
        this._blinkAmount = 0;
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

    setExpression(name) {
        const target = resolveExpression(name);
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
        params.gazeX += this._gazeX;
        params.gazeY += this._gazeY;
        params.open *= 1 - this._blinkAmount;
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
        this.actor.destroy();
    }
}
