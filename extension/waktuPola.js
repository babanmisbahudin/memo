// Bagian hari menurut jam, dipakai bersama oleh sambutan (langit adegan),
// layar kunci, dan timer latar layar login (login/latar-login.sh memakai
// batas yang sama; tests/test_login.py mencocokkan keduanya). Murni.

export const BAGIAN_HARI = ['pagi', 'siang', 'sore', 'malam'];

// pagi 04.00–10.59 · siang 11.00–14.59 · sore 15.00–17.59 · malam 18.00–03.59
export function bagianHari(jam) {
    if (jam >= 4 && jam < 11)
        return 'pagi';
    if (jam >= 11 && jam < 15)
        return 'siang';
    if (jam >= 15 && jam < 18)
        return 'sore';
    return 'malam';
}
