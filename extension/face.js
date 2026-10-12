// Logika wajah murni. TIDAK BOLEH mengimpor St/Shell/resource:// —
// modul ini harus tetap bisa dijalankan gjs polos tanpa GNOME Shell.

import cairo from 'gi://cairo';

export const NEUTRAL = {
    open: 1,      // 0 = terpejam, 1 = terbuka penuh
    curve: 0,     // -1 sedih, 0 datar, 1 busur senang
    width: 1,     // pengali lebar/jarak mata
    gazeX: 0,     // -1 kiri, 1 kanan
    gazeY: 0,     // -1 atas, 1 bawah
    tilt: 0,      // satu mata naik, satu turun
    glow: 0.55,   // kuat cahaya LED sekeliling wajah
    hue: 120,     // 120 hijau (LED khas robot), 0 merah
    cross: 0,     // kadar bentuk silang
    iconAlpha: 0, // 0 = wajah normal, 1 = tampilkan ikon sistem
    iconKind: 'none', // 'none' | 'shutdown' | 'restart' | 'logout'
};

export const EXPRESSIONS = {
    netral: {},
    mendengar: { open: 1.2, width: 1.1, glow: 0.95 },
    berpikir: { open: 0.55, gazeX: -0.75, gazeY: -1, glow: 0.5 },
    bicara: { open: 0.72, width: 0.95, glow: 0.85 },
    senang: { open: 0.4, curve: 1, glow: 0.9 },
    bingung: { open: 1.1, width: 1.15, tilt: 0.8 },
    error: { open: 1, glow: 1, hue: 0, cross: 1 },
    tidur: { open: 0.06, curve: 0, glow: 0.2 },
    shutdown: { iconAlpha: 1, iconKind: 'shutdown', hue: 0, glow: 0.9 },
    restart: { iconAlpha: 1, iconKind: 'restart', hue: 45, glow: 0.9 },
    logout: { iconAlpha: 1, iconKind: 'logout', hue: 210, glow: 0.9 },
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
    for (const key of Object.keys(NEUTRAL)) {
        if (typeof NEUTRAL[key] === 'number')
            out[key] = from[key] + (to[key] - from[key]) * k;
        else
            out[key] = to[key];
    }
    return out;
}

function pixColor(hue, alpha) {
    const h = ((hue % 360) + 360) % 360;
    const s = 0.85;
    const l = 0.55;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const sector = h / 60;
    const x = c * (1 - Math.abs((sector % 2) - 1));
    let r, g, b;
    if (sector < 1) [r, g, b] = [c, x, 0];
    else if (sector < 2) [r, g, b] = [x, c, 0];
    else if (sector < 3) [r, g, b] = [0, c, x];
    else if (sector < 4) [r, g, b] = [0, x, c];
    else if (sector < 5) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    const m = l - c / 2;
    return [r + m, g + m, b + m, alpha];
}


const ICONS = {
    shutdown: [
        '..X..',
        '..X..',
        '.X.X.',
        'X...X',
        '.XXX.',
    ],
    restart: [
        '.XXX.',
        'X..X.',
        'X...',
        'X...',
        '.XXX',
    ],
    logout: [
        '...X.',
        '....X',
        'XXXXX',
        '....X',
        '...X.',
    ],
};


function smoothstep(edge0, edge1, value) {
    const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
}

// Hanya dua mata LED, tanpa kepala/layar/mulut. Tiap ekspresi adalah bentuk
// piksel mata yang berbeda; semua diblend dengan alpha supaya transisi mulus.
export function drawFace(cr, width, height, params) {
    const centerX = width / 2;
    const centerY = height / 2;

    const cell = 2.1;
    const alpha = 0.72 + 0.28 * params.glow;
    const color = [0.95, 0.97, 1, alpha]; // mata putih
    const iconColor = pixColor(params.hue, alpha);
    const iconWeight = Math.max(0, Math.min(1, params.iconAlpha));

    const crossWeight = Math.max(0, Math.min(1, params.cross));
    const arcWeight = smoothstep(0.35, 0.8, params.curve) * (1 - crossWeight);
    const plainWeight = Math.max(0, 1 - crossWeight - arcWeight);

    function led(cx, cy, c) {
        cr.setSourceRGBA(...c);
        cr.rectangle(cx - cell * 0.375, cy - cell * 0.375, cell * 0.75, cell * 0.75);
        cr.fill();
    }

    if (iconWeight > 0.01) {
        const rows = ICONS[params.iconKind];
        if (rows) {
            const w = rows[0].length * cell;
            const h = rows.length * cell;
            const sx = centerX - w / 2;
            const sy = centerY - h / 2;
            const a = [iconColor[0], iconColor[1], iconColor[2], iconColor[3] * iconWeight];
            for (let r = 0; r < rows.length; r++)
                for (let c = 0; c < rows[r].length; c++)
                    if (rows[r][c] === 'X')
                        led(sx + c * cell + cell / 2, sy + r * cell + cell / 2, a);
        }
        return;
    }

    for (const side of [-1, 1]) {
        const ex = centerX + side * 7.5 * params.width + params.gazeX * 4;
        const ey = centerY + params.gazeY * 3 + side * params.tilt * 2.5;

        if (plainWeight > 0.01) {
            // Mata blok 3 kolom; tinggi menyusut saat berkedip.
            const lit = Math.max(1, Math.round(params.open * 3));
            const dy0 = ey - ((lit - 1) * cell) / 2;
            for (let dc = -1; dc <= 1; dc++)
                for (let dr = 0; dr < lit; dr++)
                    led(ex + dc * cell, dy0 + dr * cell,
                        [color[0], color[1], color[2], color[3] * plainWeight]);
        }

        if (arcWeight > 0.01) {
            const a = [color[0], color[1], color[2], color[3] * arcWeight];
            led(ex - cell, ey + cell * 0.5, a);
            led(ex, ey - cell * 0.5, a);
            led(ex + cell, ey + cell * 0.5, a);
        }

        if (crossWeight > 0.01) {
            const a = [color[0], color[1], color[2], color[3] * crossWeight];
            led(ex - cell, ey - cell, a);
            led(ex + cell, ey - cell, a);
            led(ex, ey, a);
            led(ex - cell, ey + cell, a);
            led(ex + cell, ey + cell, a);
        }
    }
}
