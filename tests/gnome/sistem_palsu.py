#!/usr/bin/env python3
"""Layanan bus sistem palsu untuk uji layar login/kunci di GNOME Shell headless.

Dijalankan pada bus privat (DBUS_SYSTEM_BUS_ADDRESS milik uji), bukan bus
sistem asli, supaya GDM, logind, dan AccountsService sungguhan tidak pernah
tersentuh. Isinya sebatas yang dibaca shell:

- org.gnome.DisplayManager: properti Version (syarat LoginManager.canLock()),
  RegisterDisplay/RegisterSession tanpa efek, OpenSession menolak (tidak ada
  sesi login sungguhan yang bisa dibuka).
- org.freedesktop.Accounts: satu pengguna (nama dari argumen) untuk daftar
  pengguna di layar login.

  sistem_palsu.py <nama-pengguna> <nama-asli>
"""

import os
import sys

from gi.repository import Gio, GLib

GDM_XML = """
<node>
  <interface name="org.gnome.DisplayManager.Manager">
    <method name="RegisterDisplay"><arg type="a{ss}" direction="in"/></method>
    <method name="RegisterSession"><arg type="a{sv}" direction="in"/></method>
    <method name="OpenSession"><arg type="s" direction="out"/></method>
    <method name="OpenReauthenticationChannel">
      <arg type="s" direction="in"/><arg type="s" direction="out"/>
    </method>
    <property name="Version" type="s" access="read"/>
  </interface>
</node>
"""

AKUN_XML = """
<node>
  <interface name="org.freedesktop.Accounts">
    <method name="ListCachedUsers"><arg type="ao" direction="out"/></method>
    <method name="FindUserById"><arg type="x" direction="in"/><arg type="o" direction="out"/></method>
    <method name="FindUserByName"><arg type="s" direction="in"/><arg type="o" direction="out"/></method>
    <method name="CacheUser"><arg type="s" direction="in"/><arg type="o" direction="out"/></method>
    <method name="UncacheUser"><arg type="s" direction="in"/></method>
    <method name="GetUsersLanguages"><arg type="as" direction="out"/></method>
    <signal name="UserAdded"><arg type="o"/></signal>
    <signal name="UserDeleted"><arg type="o"/></signal>
    <property name="DaemonVersion" type="s" access="read"/>
    <property name="HasNoUsers" type="b" access="read"/>
    <property name="HasMultipleUsers" type="b" access="read"/>
    <property name="AutomaticLoginUsers" type="ao" access="read"/>
  </interface>
</node>
"""

PENGGUNA_XML = """
<node>
  <interface name="org.freedesktop.Accounts.User">
    <signal name="Changed"/>
    <property name="Uid" type="t" access="read"/>
    <property name="UserName" type="s" access="read"/>
    <property name="RealName" type="s" access="read"/>
    <property name="AccountType" type="i" access="read"/>
    <property name="HomeDirectory" type="s" access="read"/>
    <property name="Shell" type="s" access="read"/>
    <property name="Email" type="s" access="read"/>
    <property name="Language" type="s" access="read"/>
    <property name="Session" type="s" access="read"/>
    <property name="SessionType" type="s" access="read"/>
    <property name="XSession" type="s" access="read"/>
    <property name="Location" type="s" access="read"/>
    <property name="LoginFrequency" type="t" access="read"/>
    <property name="LoginTime" type="x" access="read"/>
    <property name="LoginHistory" type="a(xxa{sv})" access="read"/>
    <property name="IconFile" type="s" access="read"/>
    <property name="Saved" type="b" access="read"/>
    <property name="Locked" type="b" access="read"/>
    <property name="PasswordMode" type="i" access="read"/>
    <property name="PasswordHint" type="s" access="read"/>
    <property name="AutomaticLogin" type="b" access="read"/>
    <property name="SystemAccount" type="b" access="read"/>
    <property name="LocalAccount" type="b" access="read"/>
  </interface>
</node>
"""


def main():
    nama, asli = sys.argv[1], sys.argv[2]
    uid = os.getuid()
    jalur_pengguna = f"/org/freedesktop/Accounts/User{uid}"
    bus = Gio.DBusConnection.new_for_address_sync(
        os.environ["DBUS_SYSTEM_BUS_ADDRESS"],
        Gio.DBusConnectionFlags.AUTHENTICATION_CLIENT | Gio.DBusConnectionFlags.MESSAGE_BUS_CONNECTION, None, None)

    sifat_gdm = {"Version": GLib.Variant("s", "50.1")}
    sifat_akun = {
        "DaemonVersion": GLib.Variant("s", "23.13.9"),
        "HasNoUsers": GLib.Variant("b", False),
        "HasMultipleUsers": GLib.Variant("b", False),
        "AutomaticLoginUsers": GLib.Variant("ao", []),
    }
    sifat_pengguna = {
        "Uid": GLib.Variant("t", uid), "UserName": GLib.Variant("s", nama),
        "RealName": GLib.Variant("s", asli), "AccountType": GLib.Variant("i", 1),
        "HomeDirectory": GLib.Variant("s", f"/home/{nama}"), "Shell": GLib.Variant("s", "/bin/bash"),
        "Email": GLib.Variant("s", ""), "Language": GLib.Variant("s", ""),
        "Session": GLib.Variant("s", ""), "SessionType": GLib.Variant("s", ""),
        "XSession": GLib.Variant("s", ""), "Location": GLib.Variant("s", ""),
        "LoginFrequency": GLib.Variant("t", 1), "LoginTime": GLib.Variant("x", 0),
        "LoginHistory": GLib.Variant("a(xxa{sv})", []), "IconFile": GLib.Variant("s", ""),
        "Saved": GLib.Variant("b", True), "Locked": GLib.Variant("b", False),
        "PasswordMode": GLib.Variant("i", 0), "PasswordHint": GLib.Variant("s", ""),
        "AutomaticLogin": GLib.Variant("b", False), "SystemAccount": GLib.Variant("b", False),
        "LocalAccount": GLib.Variant("b", True),
    }

    def panggil_gdm(_c, _s, _p, _i, metode, _param, inv):
        if metode == "OpenSession" or metode == "OpenReauthenticationChannel":
            inv.return_dbus_error("org.gnome.DisplayManager.Palsu", "bus uji: tidak ada sesi login")
        else:
            inv.return_value(None)

    def panggil_akun(_c, _s, _p, _i, metode, param, inv):
        if metode == "ListCachedUsers":
            inv.return_value(GLib.Variant("(ao)", ([jalur_pengguna],)))
        elif metode == "FindUserById" and param.unpack()[0] == uid:
            inv.return_value(GLib.Variant("(o)", (jalur_pengguna,)))
        elif metode in ("FindUserByName", "CacheUser") and param.unpack()[0] == nama:
            inv.return_value(GLib.Variant("(o)", (jalur_pengguna,)))
        elif metode == "GetUsersLanguages":
            inv.return_value(GLib.Variant("(as)", ([],)))
        elif metode == "UncacheUser":
            inv.return_value(None)
        else:
            inv.return_dbus_error("org.freedesktop.Accounts.Error.Failed", "tidak dikenal")

    def sifat(tabel):
        return lambda _c, _s, _p, _i, nama_sifat: tabel.get(nama_sifat)

    def daftar(xml, jalur, panggil, tabel):
        info = Gio.DBusNodeInfo.new_for_xml(xml).interfaces[0]
        daftar_objek = getattr(bus, "register_object_with_closures2", None) or bus.register_object
        daftar_objek(jalur, info, panggil, sifat(tabel), None)

    daftar(GDM_XML, "/org/gnome/DisplayManager/Manager", panggil_gdm, sifat_gdm)
    daftar(AKUN_XML, "/org/freedesktop/Accounts", panggil_akun, sifat_akun)
    daftar(PENGGUNA_XML, jalur_pengguna, lambda *a: a[-1].return_value(None), sifat_pengguna)
    for nama_bus in ("org.gnome.DisplayManager", "org.freedesktop.Accounts"):
        bus.call_sync("org.freedesktop.DBus", "/org/freedesktop/DBus", "org.freedesktop.DBus", "RequestName",
                      GLib.Variant("(su)", (nama_bus, 4)), None, Gio.DBusCallFlags.NONE, -1, None)
    # Bus privat ditutup bersama shell uji: ikut berhenti, jangan tertinggal.
    loop = GLib.MainLoop()
    bus.connect("closed", lambda *_: loop.quit())
    print("siap", flush=True)
    loop.run()


if __name__ == "__main__":
    main()
