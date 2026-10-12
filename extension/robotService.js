import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const BUS_NAME = 'org.himisbah.Robot';
const OBJECT_PATH = '/org/himisbah/Robot';

const INTERFACE = `
<node>
  <interface name="org.himisbah.Robot">
    <method name="SetExpression">
      <arg type="s" direction="in" name="name"/>
      <arg type="i" direction="in" name="durationMs"/>
    </method>
    <method name="SetTint">
      <arg type="d" direction="in" name="hue"/>
      <arg type="d" direction="in" name="glowBoost"/>
    </method>
    <method name="Reset"/>
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

    // Wardrobe lewat D-Bus. hue negatif = ikut ekspresi (reset tint).
    SetTint(hue, glowBoost) {
        try {
            this._controller.setTint(hue, glowBoost);
        } catch (e) {
            console.error(`[dynamic-island] SetTint gagal: ${e}`);
        }
    }

    get Expression() {
        return this._controller.expression;
    }

    // Membuka menu Memo dari luar (mis. skrip atau pintasan lain).
    BukaMenu() {
        try {
            this._controller.bukaMenu();
        } catch (e) {
            console.error(`[dynamic-island] BukaMenu gagal: ${e}`);
        }
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
