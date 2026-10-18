// Jalankan: gjs -m extension/tests/test-kenal-aplikasi.js
import { KATEGORI, kenali } from '../hidup/kenalAplikasi.js';

let gagal = 0;
let lolos = 0;
const cek = (label, syarat) => {
    if (syarat) {
        lolos++;
    } else {
        gagal++;
        console.log(`GAGAL: ${label}`);
    }
};

const KASUS = [
    ['Code', 'memo — Visual Studio Code', 'kode'],
    ['code-oss', 'layar.js', 'kode'],
    ['VSCodium', '', 'kode'],
    ['jetbrains-pycharm', '', 'kode'],
    ['org.gnome.Ptyxis', '~/Projects/memo', 'terminal'],
    ['org.gnome.Console', '', 'terminal'],
    ['kitty', '', 'terminal'],
    ['obsidian', 'Peta Utama - himisbah - Obsidian', 'dokumen'],
    ['libreoffice-writer', 'laporan.odt', 'dokumen'],
    ['org.gnome.TextEditor', 'catatan.txt', 'dokumen'],
    ['spotify', 'Spotify Premium', 'musik'],
    ['vlc', 'film.mkv', 'video'],
    ['io.github.celluloid_player.Celluloid', '', 'video'],
    ['TelegramDesktop', '', 'chat'],
    ['discord', '', 'chat'],
    ['firefox', 'Lofi hip hop — YouTube — Mozilla Firefox', 'video'],
    ['firefox', 'YouTube Music — Mozilla Firefox', 'musik'],
    ['Google-chrome', 'WhatsApp', 'chat'],
    ['firefox', 'anthropics/claude-code · GitHub — Mozilla Firefox', 'kode'],
    ['firefox', 'Google — Mozilla Firefox', 'lain'],
    ['org.gnome.Nautilus', 'Unduhan', 'lain'],
    ['', '', 'lain'],
];
for (const [aplikasi, judul, harap] of KASUS)
    cek(`${aplikasi} / "${judul}" -> ${harap} (dapat ${kenali(aplikasi, judul)})`, kenali(aplikasi, judul) === harap);

cek('semua hasil termasuk KATEGORI', KASUS.every(([a, j]) => KATEGORI.includes(kenali(a, j))));
cek('tanpa argumen tidak melempar', kenali() === 'lain');

console.log(`\n${lolos} lolos, ${gagal} gagal`);
if (gagal)
    throw new Error(`${gagal} gagal`);
