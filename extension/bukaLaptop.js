// Membuka situs, aplikasi, folder, dan terminal atas permintaan Memo
// (D-Bus org.himisbah.Robot.Buka, dipanggil bin/aksi_laptop.py).
//
// Dijalankan dari dalam GNOME Shell karena konteks peluncuran shell memberi
// token aktivasi: jendela baru langsung tampil di depan. Diluncurkan dari
// layanan systemd, GNOME hanya memberi notifikasi "… siap".
//
// Masukan divalidasi lagi di sini (pertahanan berlapis): situs hanya
// http/https, folder harus benar-benar ada.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';

// Terminal yang bisa dibuka di folder tertentu, dan argumen untuk itu.
const TERMINAL = [
    ['org.gnome.Ptyxis.desktop', dir => `ptyxis --new-window -d ${GLib.shell_quote(dir)}`],
    ['org.gnome.Terminal.desktop', dir => `gnome-terminal --working-directory=${GLib.shell_quote(dir)}`],
];

function konteks() {
    return global.create_app_launch_context(0, -1);
}

function urlAman(url) {
    try {
        const u = GLib.Uri.parse(url, GLib.UriFlags.NONE);
        return ['http', 'https'].includes(u.get_scheme()) && !!u.get_host();
    } catch {
        return false;
    }
}

function folderAda(jalur) {
    return GLib.path_is_absolute(jalur) && GLib.file_test(jalur, GLib.FileTest.IS_DIR);
}

// Kandidat: id .desktop, atau "?kata" untuk pencarian aplikasi GNOME.
function cariAplikasi(kandidat) {
    const sistem = Shell.AppSystem.get_default();
    for (const k of kandidat) {
        if (!k.startsWith('?')) {
            const app = sistem.lookup_app(k);
            if (app)
                return app;
            continue;
        }
        const kata = k.slice(1).trim();
        if (!kata)
            continue;
        for (const kelompok of Shell.AppSystem.search(kata)) {
            for (const id of kelompok) {
                const app = sistem.lookup_app(id);
                if (app && app.get_app_info()?.should_show())
                    return app;
            }
        }
    }
    return null;
}

// -> [berhasil, nama yang dibuka]
export function buka(jenis, target) {
    switch (jenis) {
    case 'url':
        if (!urlAman(target))
            return [false, ''];
        Gio.AppInfo.launch_default_for_uri(target, konteks());
        return [true, target];
    case 'folder':
        if (!folderAda(target))
            return [false, ''];
        Gio.AppInfo.launch_default_for_uri(Gio.File.new_for_path(target).get_uri(), konteks());
        return [true, GLib.path_get_basename(target)];
    case 'aplikasi': {
        const app = cariAplikasi(target.split('\n'));
        if (!app)
            return [false, ''];
        app.activate();
        return [true, app.get_name()];
    }
    case 'terminal': {
        if (!folderAda(target))
            return [false, ''];
        const sistem = Shell.AppSystem.get_default();
        const ada = TERMINAL.find(([id]) => sistem.lookup_app(id));
        if (!ada)
            return [false, ''];
        Gio.AppInfo.create_from_commandline(ada[1](target), 'Terminal', Gio.AppInfoCreateFlags.NONE)
            .launch([], konteks());
        return [true, 'Terminal'];
    }
    default:
        return [false, ''];
    }
}
