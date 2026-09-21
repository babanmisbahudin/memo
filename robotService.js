import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';

const BUS_NAME = 'org.himisbah.Robot';
const OBJECT_PATH = '/org/himisbah/Robot';

const CTRL = Clutter.KEY_Control_L;

// Daftar tetap kombinasi yang boleh dikirim lewat D-Bus. Sengaja sesempit
// kebutuhan: tab berikutnya, tab sebelumnya, tutup tab.
const DIIZINKAN = {
    'ctrl+Page_Down': { pengubah: [CTRL], keyval: Clutter.KEY_Page_Down },
    'ctrl+Page_Up': { pengubah: [CTRL], keyval: Clutter.KEY_Page_Up },
    'ctrl+w': { pengubah: [CTRL], keyval: Clutter.KEY_w },
};

const INTERFACE = `
<node>
  <interface name="org.himisbah.Robot">
    <method name="SetExpression">
      <arg type="s" direction="in" name="name"/>
      <arg type="i" direction="in" name="durationMs"/>
    </method>
    <method name="Reset"/>
    <method name="SendKey">
      <arg type="s" direction="in" name="accel"/>
    </method>
    <method name="BukaMenu"/>
    <property name="Expression" type="s" access="read"/>
    <signal name="ExpressionChanged">
      <arg type="s" name="name"/>
    </signal>
  </interface>
</node>`;

export class RobotService {
    constructor(controller) {
        this._controller = controller;
        this._exported = Gio.DBusExportedObject.wrapJSObject(INTERFACE, this);
        this._ownerId = Gio.bus_own_name(
            Gio.BusType.SESSION,
            BUS_NAME,
            Gio.BusNameOwnerFlags.REPLACE,
            connection => {
                try {
                    this._exported.export(connection, OBJECT_PATH);
                } catch (e) {
                    console.error(`[dynamic-island] gagal mengekspor D-Bus: ${e}`);
                }
            },
            null,
            () => console.log('[dynamic-island] nama D-Bus hilang'));
    }

    // Dipanggil lewat D-Bus. Tidak boleh melempar apa pun ke pemanggil —
    // exception yang lolos dari sini bisa merusak sesi shell.
    SetExpression(name, durationMs) {
        try {
            this._controller.setExpression(name, durationMs);
        } catch (e) {
            console.error(`[dynamic-island] SetExpression gagal: ${e}`);
        }
    }

    Reset() {
        try {
            this._controller.resetExpression();
        } catch (e) {
            console.error(`[dynamic-island] Reset gagal: ${e}`);
        }
    }

    get Expression() {
        return this._controller.expression;
    }

    // Menyuntik tombol ke aplikasi yang sedang fokus. Di Wayland hanya
    // compositor yang boleh melakukan ini, dan extension berjalan di dalamnya —
    // itulah sebabnya bagian ini ada di sini, bukan di pendeteksi isyarat.
    //
    // Hanya kombinasi dari daftar tetap yang dilayani. Membiarkan pemanggil
    // mengirim tombol sembarang berarti membuka penekan tombol apa pun lewat
    // D-Bus sesi, dan itu terlalu luas untuk kebutuhan mengganti tab.
    SendKey(accel) {
        try {
            const izin = DIIZINKAN[accel];
            if (!izin) {
                console.log(`[dynamic-island] kombinasi tombol ditolak: ${accel}`);
                return;
            }
            this._tekan(izin.pengubah, izin.keyval);
        } catch (e) {
            console.error(`[dynamic-island] SendKey gagal: ${e}`);
        }
    }

    // Dipanggil pendeteksi isyarat saat telapak terbuka: popup yang muncul
    // sekaligus jadi tanda kasat mata bahwa gerbang kendali sedang terbuka.
    BukaMenu() {
        try {
            this._controller.bukaMenu();
        } catch (e) {
            console.error(`[dynamic-island] BukaMenu gagal: ${e}`);
        }
    }

    _tekan(pengubah, keyval) {
        if (!this._papanMaya) {
            const seat = Clutter.get_default_backend().get_default_seat();
            this._papanMaya = seat.create_virtual_device(
                Clutter.InputDeviceType.KEYBOARD_DEVICE);
        }

        const waktu = global.get_current_time() * 1000;
        for (const p of pengubah)
            this._papanMaya.notify_keyval(waktu, p, Clutter.KeyState.PRESSED);
        this._papanMaya.notify_keyval(waktu, keyval, Clutter.KeyState.PRESSED);
        this._papanMaya.notify_keyval(waktu, keyval, Clutter.KeyState.RELEASED);
        for (const p of [...pengubah].reverse())
            this._papanMaya.notify_keyval(waktu, p, Clutter.KeyState.RELEASED);
    }

    notifyExpressionChanged(name) {
        try {
            this._exported.emit_signal('ExpressionChanged',
                new GLib.Variant('(s)', [name]));
            this._exported.emit_property_changed('Expression',
                new GLib.Variant('s', name));
        } catch (e) {
            console.error(`[dynamic-island] gagal mengirim sinyal: ${e}`);
        }
    }

    destroy() {
        try {
            this._exported.unexport();
        } catch (e) {
            console.error(`[dynamic-island] gagal unexport: ${e}`);
        }
        if (this._ownerId) {
            Gio.bus_unown_name(this._ownerId);
            this._ownerId = 0;
        }
    }
}
