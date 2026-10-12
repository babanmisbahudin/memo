import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Clutter from 'gi://Clutter';
export default class MemoUji extends Extension {
    enable() {
        global.context.unsafe_mode = true;
        globalThis.memoUji = {
            Main,
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
    disable() { delete globalThis.memoUji; }
}
