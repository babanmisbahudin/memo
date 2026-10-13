// Jalur berkas di repo Memo. Folder extension biasanya symlink ke repo
// (~/.local/share/gnome-shell/extensions/dynamic-island@local ->
// ~/Projects/memo/extension), jadi targetnya dibaca dulu.

import Gio from 'gi://Gio';

export function jalurRepo(...bagian) {
    try {
        let dir = Gio.File.new_for_uri(import.meta.url).get_parent();
        const info = dir.query_info('standard::symlink-target,standard::is-symlink',
            Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
        if (info.get_is_symlink())
            dir = dir.get_parent().resolve_relative_path(info.get_symlink_target());
        let f = dir.get_parent();
        for (const b of bagian)
            f = f.get_child(b);
        return f.query_exists(null) ? f.get_path() : null;
    } catch (e) {
        console.error(`[dynamic-island] jalur repo: ${e}`);
        return null;
    }
}
