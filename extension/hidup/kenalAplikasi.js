// Mengenali jenis jendela dari nama aplikasi (wm_class / app id) dan
// judulnya, supaya pikiran Memo bisa bereaksi: ikut menonton video,
// menemani ngoding, joget saat musik. Murni: tanpa St/Clutter/Meta.
//
// Judul hanya dipakai di sini untuk menebak kategori; tidak disimpan ke
// berkas dan tidak dikirim ke mana pun.

export const KATEGORI = ['kode', 'video', 'terminal', 'chat', 'musik', 'dokumen', 'lain'];

// Urutan penting: yang lebih khusus di atas.
const APLIKASI = [
    ['musik', /spotify|rhythmbox|lollypop|amberol/i],
    ['video', /vlc|mpv|celluloid|totem|showtime/i],
    ['kode', /^code|vscod|codium|jetbrains|pycharm|webstorm|intellij|builder|zed/i],
    ['terminal', /ptyxis|terminal|kitty|alacritty|wezterm|foot|tilix|console/i],
    ['chat', /telegram|discord|slack|signal|element|whatsapp/i],
    ['dokumen', /obsidian|libreoffice|soffice|papers|evince|okular|texteditor|gedit|apostrophe/i],
];

const BROWSER = /firefox|chrome|chromium|brave|epiphany|vivaldi|msedge|opera/i;
const JUDUL_BROWSER = [
    ['musik', /youtube music|open\.spotify|spotify –|spotify -/i],
    ['video', /youtube|netflix|vidio|twitch|vimeo/i],
    ['chat', /whatsapp|telegram|discord|slack|messenger/i],
    ['kode', /github|gitlab|stack overflow|localhost/i],
];

export function kenali(aplikasi = '', judul = '') {
    if (BROWSER.test(aplikasi)) {
        for (const [k, pola] of JUDUL_BROWSER) {
            if (pola.test(judul))
                return k;
        }
        return 'lain';
    }
    for (const [k, pola] of APLIKASI) {
        if (pola.test(aplikasi))
            return k;
    }
    return 'lain';
}
