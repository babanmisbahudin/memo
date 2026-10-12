import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
export default class MemoUji extends Extension {
    enable() {
        global.context.unsafe_mode = true;
        globalThis.memoUji = {
            Main,
            island: () => Main.extensionManager.lookup('dynamic-island@local')?.stateObj?._island,
            status: () => Main.extensionManager.lookup('dynamic-island@local')?.state,
            galat: () => String(Main.extensionManager.lookup('dynamic-island@local')?.error ?? ''),
        };
    }
    disable() { delete globalThis.memoUji; }
}
