import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { getDefault as getSystemActions } from 'resource:///org/gnome/shell/misc/systemActions.js';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
export default class MemoUji extends Extension {
    enable() {
        global.context.unsafe_mode = true;
        this._papan = Clutter.get_default_backend().get_default_seat()
            .create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
        globalThis.memoUji = {
            Main,
            aksiSistem: getSystemActions,
            // Keyboard virtual dibuat sejak enable(): tombol pertama dari
            // perangkat yang baru dibuat hilang bila sebuah jendela Wayland
            // sedang fokus (sampai ke stage, tidak diteruskan ke klien).
            tekanTombol: keyval => {
                const w = GLib.get_monotonic_time();
                this._papan.notify_keyval(w, keyval, Clutter.KeyState.PRESSED);
                this._papan.notify_keyval(w + 20000, keyval, Clutter.KeyState.RELEASED);
            },
            geserKursor: (x, y) => {
                const seat = Clutter.get_default_backend().get_default_seat();
                const d = seat.create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
                d.notify_absolute_motion(global.get_current_time() * 1000, x, y);
            },
            island: () => Main.extensionManager.lookup('dynamic-island@local')?.stateObj?._island,
            status: () => Main.extensionManager.lookup('dynamic-island@local')?.state,
            galat: () => String(Main.extensionManager.lookup('dynamic-island@local')?.error ?? ''),
        };
    }
    disable() { this._papan = null; delete globalThis.memoUji; }
}
