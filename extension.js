import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import Gvc from 'gi://Gvc';

import { RobotFace } from './robotFace.js';
import { RobotService } from './robotService.js';

const ANIM_MS = 300;
const MPRIS_PREFIX = 'org.mpris.MediaPlayer2.';

const RECHECK_MS = 250;
const POLL_NEAR_MS = 100;
const POLL_FAR_MS = 400;
const POINTER_NEAR_Y = 220;
const HOVER_PAD = 8;

// Ekspresi yang menandakan asisten sedang bekerja: wajahnya harus terlihat,
// jadi island dipaksa ke mode titik selama ekspresi ini aktif.
const BUSY_EXPRESSIONS = ['mendengar', 'berpikir', 'bicara'];

class Island {
    constructor() {
        this._queue = [];
        this._eventActive = false;
        this._pinned = false;
        this._covered = false;
        this._pointerNear = false;
        this._current = null;
        this._adopted = [];
        this._signals = [];
        this._holdId = null;
        this._recheckId = null;
        this._pollId = null;
        this._pollActive = false;
        this._expressionHoldId = null;
        this._service = null;
        this._faceBusy = false;

        this._pill = new St.BoxLayout({
            style_class: 'dynamic-island-pill',
            y_align: Clutter.ActorAlign.CENTER,
            x_align: Clutter.ActorAlign.CENTER,
            reactive: true,
        });
        this._pill.set_pivot_point(0.5, 0.5);
        this._pill.add_effect(new Shell.BlurEffect({
            brightness: 0.75,
            radius: 20,
            mode: Shell.BlurMode.BACKGROUND,
        }));
        this._pill.connect('button-press-event', () => {
            this._pinned = !this._pinned;
            this._update();
            return Clutter.EVENT_STOP;
        });

        // Mata robot adalah anak tetap pill: selalu terlihat, tidak pernah
        // ditukar. Yang bergantian di sebelahnya hanya isinya.
        this._face = new RobotFace();

        // Mode "ringkas": kotak kosong, jadi yang tersisa di pill hanya mata.
        this._dot = new St.BoxLayout({
            style_class: 'dynamic-island-dot',
            y_align: Clutter.ActorAlign.CENTER,
            visible: false,
        });

        this._normal = new St.BoxLayout({
            style_class: 'dynamic-island-normal',
            y_align: Clutter.ActorAlign.CENTER,
            visible: false,
        });
        this._event = new St.BoxLayout({
            style_class: 'dynamic-island-event',
            y_align: Clutter.ActorAlign.CENTER,
            visible: false,
        });

        this._icon = new St.Icon({
            style_class: 'dynamic-island-icon',
            icon_size: 16,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._label = new St.Label({
            style_class: 'dynamic-island-label',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._event.add_child(this._icon);
        this._event.add_child(this._label);

        this._pill.add_child(this._face.actor);
        this._pill.add_child(this._dot);
        this._pill.add_child(this._normal);
        this._pill.add_child(this._event);

        this._face.setBlinkingEnabled(true);

        this._adopt(Main.panel.statusArea.dateMenu);
        this._adopt(Main.panel.statusArea.quickSettings);

        Main.panel._centerBox.add_child(this._pill);
        Main.panel.add_style_class_name('dynamic-island-panel');

        this._connectWindowSignals();
        this._covered = this._computeCovered();
        this._update();
    }

    _adopt(indicator) {
        const container = indicator?.container;
        if (!container)
            return;
        const parent = container.get_parent();
        if (!parent)
            return;
        const index = parent.get_children().indexOf(container);
        this._adopted.push({ container, parent, index });
        parent.remove_child(container);
        this._normal.add_child(container);
    }

    _restoreAdopted() {
        for (const { container, parent, index } of this._adopted.reverse()) {
            container.get_parent()?.remove_child(container);
            parent.insert_child_at_index(container, index);
        }
        this._adopted = [];
    }

    _connectWindowSignals() {
        const add = (obj, signal) => this._signals.push([obj, obj.connect(signal, () => this._scheduleRecheck())]);
        add(global.display, 'notify::focus-window');
        add(global.window_manager, 'size-change');
        add(global.window_manager, 'map');
        add(global.window_manager, 'destroy');
        add(global.window_manager, 'minimize');
        add(global.window_manager, 'unminimize');
        add(global.workspace_manager, 'active-workspace-changed');
        add(Main.overview, 'showing');
        add(Main.overview, 'hidden');
    }

    // "Sedang dipakai" = ada jendela yang fokus, bukan sekadar yang maximize.
    // Pemicu maximize saja terlalu sempit: jendela biasa dan jendela setengah
    // layar tidak pernah memicunya, jadi pill-nya nyaris tidak pernah mengecil.
    _isWindowInUse(w) {
        return w && !w.minimized && !w.skip_taskbar && w.is_on_primary_monitor();
    }

    _computeCovered() {
        if (Main.overview.visible)
            return false;

        if (this._isWindowInUse(global.display.focus_window))
            return true;

        const workspace = global.workspace_manager.get_active_workspace();
        return workspace.list_windows().some(w =>
            this._isWindowInUse(w) && (w.fullscreen || w.is_maximized()));
    }

    _scheduleRecheck() {
        if (this._recheckId)
            GLib.source_remove(this._recheckId);
        this._recheckId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, RECHECK_MS, () => {
            this._recheckId = null;
            this._covered = this._computeCovered();
            this._update();
            return GLib.SOURCE_REMOVE;
        });
    }

    trigger(iconName, text, holdMs = 3500) {
        this._queue.push({ iconName, text, holdMs });
        if (!this._eventActive)
            this._nextEvent();
    }

    _nextEvent() {
        if (this._queue.length === 0) {
            this._eventActive = false;
            this._update();
            return;
        }

        const { iconName, text, holdMs } = this._queue.shift();
        this._eventActive = true;
        this._icon.icon_name = iconName ?? 'dialog-information-symbolic';
        this._label.text = text;
        this._update();

        if (this._holdId)
            GLib.source_remove(this._holdId);
        this._holdId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, holdMs, () => {
            this._holdId = null;
            this._nextEvent();
            return GLib.SOURCE_REMOVE;
        });
    }

    setService(service) {
        this._service = service;
    }

    setExpression(name, durationMs = 0) {
        if (!this._face.setExpression(name))
            return;

        if (this._expressionHoldId) {
            GLib.source_remove(this._expressionHoldId);
            this._expressionHoldId = null;
        }

        this._faceBusy = BUSY_EXPRESSIONS.includes(name);
        this._update();
        this._service?.notifyExpressionChanged(name);

        if (durationMs > 0) {
            this._expressionHoldId = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT, durationMs, () => {
                    this._expressionHoldId = null;
                    this.setExpression('netral');
                    return GLib.SOURCE_REMOVE;
                });
        }
    }

    resetExpression() {
        this.setExpression('netral');
    }

    get expression() {
        return this._face.expression;
    }

    // Urutan menentukan prioritas: notifikasi dan media menang atas ekspresi
    // maskot, karena informasinya lebih mendesak daripada wajahnya.
    _resolveTarget() {
        if (this._eventActive)
            return this._event;
        if (this._faceBusy)
            return this._dot;
        if (this._pinned || !this._covered || this._pointerNear)
            return this._normal;
        return this._dot;
    }

    _update() {
        this._show(this._resolveTarget());
        this._syncPolling();
    }

    // Clutter does not tween size changes caused by swapping children, so both
    // ends are measured first and the pill is tweened between them by hand.
    _show(box) {
        if (this._current === box)
            return;

        const first = this._current === null;
        const fromWidth = this._pill.width;
        const fromHeight = this._pill.height;

        if (this._current)
            this._current.visible = false;
        this._current = box;
        box.visible = true;

        this._pill.set_width(-1);
        this._pill.set_height(-1);
        if (first)
            return;

        const [, toWidth] = this._pill.get_preferred_width(-1);
        const [, toHeight] = this._pill.get_preferred_height(-1);

        box.opacity = 0;
        box.ease({
            opacity: 255,
            duration: ANIM_MS,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });

        this._pill.set_width(fromWidth);
        this._pill.set_height(fromHeight);
        this._pill.ease({
            width: toWidth,
            height: toHeight,
            duration: ANIM_MS,
            mode: Clutter.AnimationMode.EASE_OUT_EXPO,
            onComplete: () => {
                this._pill.set_width(-1);
                this._pill.set_height(-1);
            },
        });

        this._pill.set_scale(0.94, 0.94);
        this._pill.ease({
            scale_x: 1,
            scale_y: 1,
            duration: ANIM_MS,
            mode: Clutter.AnimationMode.EASE_OUT_BACK,
        });
    }

    // Mata selalu terlihat sekarang, jadi pelacakan kursor juga selalu jalan.
    // Ongkosnya ditekan lewat laju adaptif di _pollTick: 100ms saat kursor di
    // dekat atas layar, 400ms saat jauh.
    _syncPolling() {
        const want = true;
        if (want === this._pollActive)
            return;
        this._pollActive = want;
        if (want) {
            this._pollTick();
        } else {
            if (this._pollId) {
                GLib.source_remove(this._pollId);
                this._pollId = null;
            }
            this._pointerNear = false;
        }
    }

    _pollTick() {
        const [pointerX, pointerY] = global.get_pointer();
        const [pillX, pillY] = this._pill.get_transformed_position();
        const near =
            pointerX >= pillX - HOVER_PAD &&
            pointerX <= pillX + this._pill.width + HOVER_PAD &&
            pointerY >= pillY - HOVER_PAD &&
            pointerY <= pillY + this._pill.height + HOVER_PAD;

        if (near !== this._pointerNear) {
            this._pointerNear = near;
            this._update();
        }

        this._aimEyes(pointerX, pointerY);

        if (!this._pollActive)
            return;

        const delay = pointerY < POINTER_NEAR_Y ? POLL_NEAR_MS : POLL_FAR_MS;
        this._pollId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
            this._pollId = null;
            this._pollTick();
            return GLib.SOURCE_REMOVE;
        });
    }

    _aimEyes(pointerX, pointerY) {
        const [faceX, faceY] = this._face.actor.get_transformed_position();
        const centerX = faceX + this._face.actor.width / 2;
        const centerY = faceY + this._face.actor.height / 2;
        this._face.setGaze((pointerX - centerX) / 500, (pointerY - centerY) / 350);
    }

    destroy() {
        this._pollActive = false;
        for (const id of [this._holdId, this._recheckId, this._pollId,
                          this._expressionHoldId]) {
            if (id)
                GLib.source_remove(id);
        }
        this._holdId = this._recheckId = this._pollId = null;
        this._expressionHoldId = null;

        for (const [obj, id] of this._signals)
            obj.disconnect(id);
        this._signals = [];

        Main.panel.remove_style_class_name('dynamic-island-panel');
        this._restoreAdopted();
        this._face.destroy();
        this._pill.destroy();
    }
}

class NotificationSource {
    constructor(island) {
        this._island = island;
        this._sourceIds = new Map();
        this._addedId = Main.messageTray.connect(
            'source-added', (tray, source) => this._watchSource(source));
        Main.messageTray.getSources().forEach(s => this._watchSource(s));
    }

    _watchSource(source) {
        if (this._sourceIds.has(source))
            return;
        const notifId = source.connect(
            'notification-added', (src, notification) => this._onNotification(src, notification));
        const destroyId = source.connect('destroy', () => this._sourceIds.delete(source));
        this._sourceIds.set(source, [notifId, destroyId]);
    }

    _onNotification(source, notification) {
        try {
            if (notification.urgency !== MessageTray.Urgency.CRITICAL)
                notification.acknowledged = true;
            const title = notification.title || source.title || 'Notifikasi';
            this._island.trigger('preferences-system-notifications-symbolic', title, 3500);
        } catch (e) {
            console.error(`[dynamic-island] notification handler error: ${e}`);
        }
    }

    destroy() {
        Main.messageTray.disconnect(this._addedId);
        for (const [source, [notifId, destroyId]] of this._sourceIds) {
            source.disconnect(notifId);
            source.disconnect(destroyId);
        }
        this._sourceIds.clear();
    }
}

class MediaSource {
    constructor(island) {
        this._island = island;
        this._players = new Map();
        this._bus = Gio.DBus.session;

        this._watcherId = this._bus.signal_subscribe(
            'org.freedesktop.DBus', 'org.freedesktop.DBus', 'NameOwnerChanged',
            '/org/freedesktop/DBus', null, Gio.DBusSignalFlags.NONE,
            (conn, sender, path, iface, signal, params) => {
                const [name, oldOwner, newOwner] = params.deep_unpack();
                if (!name.startsWith(MPRIS_PREFIX))
                    return;
                if (newOwner && !oldOwner)
                    this._addPlayer(name);
                else if (!newOwner)
                    this._players.delete(name);
            });

        this._bus.call(
            'org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus', 'ListNames',
            null, null, Gio.DBusCallFlags.NONE, -1, null,
            (conn, res) => {
                try {
                    const [names] = conn.call_finish(res).deep_unpack();
                    names.filter(n => n.startsWith(MPRIS_PREFIX)).forEach(n => this._addPlayer(n));
                } catch (e) {
                    console.error(`[dynamic-island] mpris list failed: ${e}`);
                }
            });
    }

    _addPlayer(busName) {
        if (this._players.has(busName))
            return;
        Gio.DBusProxy.new(
            Gio.DBus.session, Gio.DBusProxyFlags.NONE, null,
            busName, '/org/mpris/MediaPlayer2', 'org.mpris.MediaPlayer2.Player', null,
            (source, res) => {
                try {
                    const proxy = Gio.DBusProxy.new_finish(res);
                    this._players.set(busName, proxy);
                    proxy.connect('g-properties-changed', (p, changed) => {
                        const dict = changed.deep_unpack();
                        if ('Metadata' in dict || 'PlaybackStatus' in dict)
                            this._notify(proxy);
                    });
                } catch (e) {
                    console.error(`[dynamic-island] mpris proxy failed: ${e}`);
                }
            });
    }

    _notify(proxy) {
        try {
            const status = proxy.get_cached_property('PlaybackStatus')?.deep_unpack();
            if (status !== 'Playing')
                return;
            const metadata = proxy.get_cached_property('Metadata')?.deep_unpack();
            if (!metadata)
                return;
            const title = metadata['xesam:title'] || 'Playing';
            const artist = metadata['xesam:artist'];
            const artistStr = Array.isArray(artist) ? artist.join(', ') : '';
            const text = artistStr ? `${title} — ${artistStr}` : title;
            this._island.trigger('audio-x-generic-symbolic', text, 4000);
        } catch (e) {
            console.error(`[dynamic-island] mpris notify failed: ${e}`);
        }
    }

    destroy() {
        this._bus.signal_unsubscribe(this._watcherId);
        this._players.clear();
    }
}

class BatterySource {
    constructor(island) {
        this._island = island;
        this._lastCharging = null;
        this._lastLow = false;

        Gio.DBusProxy.new(
            Gio.DBus.system, Gio.DBusProxyFlags.NONE, null,
            'org.freedesktop.UPower', '/org/freedesktop/UPower/devices/DisplayDevice',
            'org.freedesktop.UPower.Device', null,
            (source, res) => {
                try {
                    this._proxy = Gio.DBusProxy.new_finish(res);
                    this._proxy.connect('g-properties-changed', () => this._check());
                    this._check(true);
                } catch (e) {
                    console.error(`[dynamic-island] upower proxy failed: ${e}`);
                }
            });
    }

    _check(silent = false) {
        try {
            const percentage = this._proxy.get_cached_property('Percentage')?.deep_unpack();
            const state = this._proxy.get_cached_property('State')?.deep_unpack();
            if (percentage === undefined || state === undefined)
                return;

            const charging = state === 1;
            if (!silent && this._lastCharging !== null && charging !== this._lastCharging) {
                this._island.trigger(
                    charging ? 'battery-charging-symbolic' : 'battery-good-symbolic',
                    charging
                        ? `Mengisi daya · ${Math.round(percentage)}%`
                        : `Charger dicabut · ${Math.round(percentage)}%`,
                    3500);
            }

            const low = percentage <= 20 && !charging;
            if (!silent && low && !this._lastLow)
                this._island.trigger('battery-low-symbolic', `Baterai lemah · ${Math.round(percentage)}%`, 4000);

            this._lastLow = low;
            this._lastCharging = charging;
        } catch (e) {
            console.error(`[dynamic-island] battery check failed: ${e}`);
        }
    }

    destroy() {}
}

class VolumeSource {
    constructor(island) {
        this._island = island;
        this._lastVolume = null;
        this._stream = null;
        this._streamVolumeId = null;
        this._streamMutedId = null;

        this._control = new Gvc.MixerControl({ name: 'Dynamic Island' });
        this._control.connect('default-sink-changed', (c, id) => this._onSinkChanged(id));
        this._control.connect('state-changed', () => {
            if (this._control.get_state() === Gvc.MixerControlState.READY) {
                const sink = this._control.get_default_sink();
                if (sink)
                    this._onSinkChanged(sink.get_id());
            }
        });
        this._control.open();
    }

    _onSinkChanged(id) {
        try {
            const stream = this._control.lookup_stream_id(id);
            if (!stream)
                return;
            if (this._stream) {
                this._stream.disconnect(this._streamVolumeId);
                this._stream.disconnect(this._streamMutedId);
            }
            this._stream = stream;
            this._streamVolumeId = stream.connect('notify::volume', () => this._check());
            this._streamMutedId = stream.connect('notify::is-muted', () => this._check());
            this._check(true);
        } catch (e) {
            console.error(`[dynamic-island] volume sink change failed: ${e}`);
        }
    }

    _check(silent = false) {
        if (!this._stream)
            return;
        const max = this._control.get_vol_max_norm();
        const pct = Math.round((this._stream.volume / max) * 100);
        if (!silent && this._lastVolume !== null && pct !== this._lastVolume) {
            const muted = this._stream.is_muted;
            this._island.trigger(
                muted ? 'audio-volume-muted-symbolic' : 'audio-volume-high-symbolic',
                muted ? 'Suara dimatikan' : `Volume ${pct}%`,
                2000);
        }
        this._lastVolume = pct;
    }

    destroy() {
        if (this._stream) {
            this._stream.disconnect(this._streamVolumeId);
            this._stream.disconnect(this._streamMutedId);
            this._stream = null;
        }
        this._control.close();
    }
}

class WifiSource {
    constructor(island) {
        this._island = island;
        this._lastState = null;

        Gio.DBusProxy.new(
            Gio.DBus.system, Gio.DBusProxyFlags.NONE, null,
            'org.freedesktop.NetworkManager', '/org/freedesktop/NetworkManager',
            'org.freedesktop.NetworkManager', null,
            (source, res) => {
                try {
                    this._proxy = Gio.DBusProxy.new_finish(res);
                    this._proxy.connect('g-properties-changed', (p, changed) => {
                        const dict = changed.deep_unpack();
                        if ('State' in dict)
                            this._check(dict['State']);
                    });
                    const state = this._proxy.get_cached_property('State')?.deep_unpack();
                    if (state !== undefined)
                        this._lastState = state;
                } catch (e) {
                    console.error(`[dynamic-island] networkmanager proxy failed: ${e}`);
                }
            });
    }

    _check(state) {
        if (this._lastState === state)
            return;
        const wasConnected = this._lastState !== null && this._lastState >= 60;
        const isConnected = state >= 60;
        if (this._lastState !== null && wasConnected !== isConnected) {
            this._island.trigger(
                isConnected ? 'network-wireless-symbolic' : 'network-wireless-offline-symbolic',
                isConnected ? 'Terhubung ke jaringan' : 'Koneksi terputus',
                3000);
        }
        this._lastState = state;
    }

    destroy() {}
}

export default class DynamicIslandExtension extends Extension {
    enable() {
        this._island = new Island();
        this._service = new RobotService(this._island);
        this._island.setService(this._service);
        this._sources = [];

        const trySource = (Cls) => {
            try {
                this._sources.push(new Cls(this._island));
            } catch (e) {
                console.error(`[dynamic-island] failed to start ${Cls.name}: ${e}`);
            }
        };

        trySource(NotificationSource);
        trySource(MediaSource);
        trySource(BatterySource);
        trySource(VolumeSource);
        trySource(WifiSource);

        console.log(`[dynamic-island] enabled, ${this._sources.length}/5 sources, adopted ${this._island._adopted.length} panel items`);
    }

    disable() {
        this._sources?.forEach(s => s.destroy());
        this._sources = null;
        this._service?.destroy();
        this._service = null;
        this._island?.destroy();
        this._island = null;
    }
}
