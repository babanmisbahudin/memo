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
    glow: 0.55,   // kuat cahaya sekeliling mata
    hue: 205,     // 205 biru-putih, 0 merah
    cross: 0,     // kadar bentuk silang
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

const EYE_RADIUS = 3.4;
const EYE_SPREAD = 7;
const GAZE_RANGE = 3.2;
const TILT_RANGE = 2.2;

function hueToRgb(hue) {
    const saturation = 0.8;
    const lightness = 0.88;
    const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const sector = ((hue % 360) + 360) % 360 / 60;
    const x = c * (1 - Math.abs((sector % 2) - 1));

    let base;
    if (sector < 1) base = [c, x, 0];
    else if (sector < 2) base = [x, c, 0];
    else if (sector < 3) base = [0, c, x];
    else if (sector < 4) base = [0, x, c];
    else if (sector < 5) base = [x, 0, c];
    else base = [c, 0, x];

    const m = lightness - c / 2;
    return base.map(v => v + m);
}

function smoothstep(edge0, edge1, value) {
    const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
}

function roundedRect(cr, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    cr.newSubPath();
    cr.arc(x + width - r, y + r, r, -Math.PI / 2, 0);
    cr.arc(x + width - r, y + height - r, r, 0, Math.PI / 2);
    cr.arc(x + r, y + height - r, r, Math.PI / 2, Math.PI);
    cr.arc(x + r, y + r, r, Math.PI, 1.5 * Math.PI);
    cr.closePath();
}

// Bentuk mata digambar bertumpuk dengan alpha masing-masing, bukan dipilih
// dengan percabangan — percabangan keras membuat bentuk meloncat di tengah
// transisi antar ekspresi.
export function drawFace(cr, width, height, params) {
    const centerX = width / 2;
    const centerY = height / 2;
    const [r, g, b] = hueToRgb(params.hue);

    const crossWeight = Math.max(0, Math.min(1, params.cross));
    // Peralihan bulat->busur dibuat tegas. Kalau dicampur rata, nilai tengah
    // menghasilkan gumpalan yang tidak terbaca sebagai bulat maupun busur;
    // dengan smoothstep zona campur itu sempit dan cepat terlewati.
    const arcWeight = smoothstep(0.35, 0.8, params.curve) * (1 - crossWeight);
    const plainWeight = Math.max(0, 1 - crossWeight - arcWeight);

    for (const side of [-1, 1]) {
        const x = centerX + side * EYE_SPREAD * params.width + params.gazeX * GAZE_RANGE;
        const y = centerY + params.gazeY * GAZE_RANGE + side * params.tilt * TILT_RANGE;

        // Cahaya harus gradien yang memudar habis. Lingkaran beralpha rata
        // terbaca sebagai cakram abu-abu, dan dua cakram bersebelahan mulai
        // terlihat seperti kepala — bukan mata bercahaya.
        if (params.glow > 0.01) {
            const glowRadius = EYE_RADIUS + 4.5 * params.glow;
            const glow = new cairo.RadialGradient(x, y, EYE_RADIUS * 0.5, x, y, glowRadius);
            glow.addColorStopRGBA(0, r, g, b, 0.45 * params.glow);
            glow.addColorStopRGBA(0.55, r, g, b, 0.16 * params.glow);
            glow.addColorStopRGBA(1, r, g, b, 0);
            cr.setSource(glow);
            cr.arc(x, y, glowRadius, 0, 2 * Math.PI);
            cr.fill();
        }

        if (plainWeight > 0.01) {
            const eyeHeight = Math.max(0.7, EYE_RADIUS * 2 * params.open);
            cr.setSourceRGBA(r, g, b, plainWeight);
            roundedRect(cr, x - EYE_RADIUS, y - eyeHeight / 2,
                EYE_RADIUS * 2, eyeHeight, EYE_RADIUS);
            cr.fill();
        }

        if (arcWeight > 0.01) {
            cr.setSourceRGBA(r, g, b, arcWeight);
            cr.setLineWidth(2.1);
            cr.setLineCap(cairo.LineCap.ROUND);
            cr.newSubPath();
            cr.arc(x, y + EYE_RADIUS * 0.45, EYE_RADIUS + 0.7, Math.PI, 2 * Math.PI);
            cr.stroke();
        }

        if (crossWeight > 0.01) {
            const arm = EYE_RADIUS + 0.4;
            cr.setSourceRGBA(r, g, b, crossWeight);
            cr.setLineWidth(1.9);
            cr.setLineCap(cairo.LineCap.ROUND);
            cr.moveTo(x - arm, y - arm);
            cr.lineTo(x + arm, y + arm);
            cr.moveTo(x + arm, y - arm);
            cr.lineTo(x - arm, y + arm);
            cr.stroke();
        }
    }
}
