// Layar kunci ala Memo. Tampilannya di stylesheet.css (dimuat GNOME Shell
// selama extension ini aktif; session-modes memuat unlock-dialog supaya
// gayanya tetap berlaku saat layar terkunci).
//
// Dua hal tidak bisa lewat CSS saja, jadi ditambahkan sebagai aktor:
// - peredup hitam di atas latar blur (latar blur adalah aktor anak yang
//   menutupi warna latar dialog);
// - wajah Memo tidur di atas jam (St tidak bisa memusatkan gambar latar).
// Keduanya hanya hiasan: tidak reaktif, tanpa tombol atau aksi, karena yang
// tampil di layar kunci bisa dilihat dan disentuh siapa saja.

import Clutter from 'gi://Clutter';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

export default class MemoKunci extends Extension {
    enable() {
        // Dialog kunci dibuat sebelum mode unlock-dialog didorong, jadi saat
        // 'updated' datang dialognya sudah ada.
        Main.sessionMode.connectObject('updated', () => this._hiasi(), this);
        this._hiasi();
    }

    _hiasi() {
        const dialog = Main.screenShield?._dialog;
        if (!dialog?._clock || !dialog._backgroundGroup || dialog._memoKunci)
            return;
        const redup = new St.Widget({
            style_class: 'memo-kunci-redup',
            reactive: false,
            constraints: new Clutter.BindConstraint({ source: dialog, coordinate: Clutter.BindCoordinate.SIZE }),
        });
        dialog.insert_child_above(redup, dialog._backgroundGroup);
        const wajah = new St.Widget({ style_class: 'memo-kunci-wajah', reactive: false, x_align: Clutter.ActorAlign.CENTER });
        dialog._clock.insert_child_at_index(wajah, 0);
        dialog._memoKunci = [redup, wajah];
    }

    disable() {
        Main.sessionMode.disconnectObject(this);
        const dialog = Main.screenShield?._dialog;
        for (const aktor of dialog?._memoKunci ?? [])
            aktor.destroy();
        if (dialog)
            delete dialog._memoKunci;
    }
}
