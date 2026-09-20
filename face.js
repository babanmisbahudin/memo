// Logika wajah murni. TIDAK BOLEH mengimpor St/Shell/resource:// —
// modul ini harus tetap bisa dijalankan gjs polos tanpa GNOME Shell.

export const NEUTRAL = {
    open: 1,      // 0 = terpejam, 1 = terbuka penuh
    curve: 0,     // -1 sedih, 0 datar, 1 busur senang
    width: 1,     // pengali lebar/jarak mata
    gazeX: 0,     // -1 kiri, 1 kanan
    gazeY: 0,     // -1 atas, 1 bawah
    tilt: 0,      // satu mata naik, satu turun
    glow: 0.55,   // kuat cahaya sekeliling mata
    hue: 205,     // 205 biru-putih, 0 merah
    cross: 0,     // kadar bentuk silang
};

export const EXPRESSIONS = {
    netral: {},
    mendengar: { open: 1.2, width: 1.1, glow: 0.95 },
    berpikir: { open: 0.55, gazeX: -0.45, gazeY: -0.7, glow: 0.5 },
    bicara: { open: 0.8, curve: 0.45, glow: 0.8 },
    senang: { open: 0.4, curve: 1, glow: 0.9 },
    bingung: { open: 1.1, width: 1.15, tilt: 0.8 },
    error: { open: 1, glow: 1, hue: 0, cross: 1 },
    tidur: { open: 0.06, curve: 0.2, glow: 0.25 },
};

export function resolveExpression(name) {
    const delta = Object.prototype.hasOwnProperty.call(EXPRESSIONS, name)
        ? EXPRESSIONS[name]
        : null;
    if (!delta)
        return null;
    return { ...NEUTRAL, ...delta };
}

export function lerpParams(from, to, t) {
    const k = Math.max(0, Math.min(1, t));
    const out = {};
    for (const key of Object.keys(NEUTRAL))
        out[key] = from[key] + (to[key] - from[key]) * k;
    return out;
}
