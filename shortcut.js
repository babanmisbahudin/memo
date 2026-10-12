// Pintasan keyboard ala Coucou untuk Memo. Semua kombinasi bisa diubah
// lewat dconf (/org/gnome/shell/extensions/dynamic-island/).
// TIDAK menyentuh face.js / robotFace.js.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const SCHEMA = 'org.gnome.shell.extensions.dynamic-island';
const SHM = GLib.getenv('MEMO_SHM') || '/dev/shm';

export class MemoShortcuts {
    constructor(island, settings = null) {
        this._island = island;
        this._settings = settings;
        if (!this._settings) {
            try {
                this._settings = new Gio.Settings({ schema_id: SCHEMA });
            } catch (e) {
                console.error(`[dynamic-island] skema shortcut belum dikompilasi: ${e}`);
            }
        }
        this._terpasang = [];
    }

    enable() {
        if (!this._settings)
            return;
        const pasang = (nama, fn) => {
            try {
                Main.wm.addKeybinding(nama, this._settings, Meta.KeyBindingFlags.NONE,
                    Shell.ActionMode.NORMAL, fn);
                this._terpasang.push(nama);
            } catch (e) {
                console.error(`[dynamic-island] pasang ${nama} gagal: ${e}`);
            }
        };
        pasang('toggle-menu', () => this._island.menu.toggle());
        pasang('voice', () => {
            try {
                GLib.file_set_contents(`${SHM}/memo-ngobrol.minta`, '');
            } catch (e) {
                console.error(`[dynamic-island] picu suara: ${e}`);
            }
            this._island.trigger('audio-input-microphone-symbolic', 'Mendengarkan...', 2000);
        });
        pasang('allow', () => this._island.jawabIzin('allow'));
        pasang('deny', () => this._island.jawabIzin('deny'));
    }

    disable() {
        for (const nama of this._terpasang) {
            try {
                Main.wm.removeKeybinding(nama);
            } catch (e) {
                console.error(`[dynamic-island] lepas ${nama} gagal: ${e}`);
            }
        }
        this._terpasang = [];
        this._settings = null;
    }
}
