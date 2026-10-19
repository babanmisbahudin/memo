import system from 'system';

import cairo from 'gi://cairo';
import GLib from 'gi://GLib';
import GdkPixbuf from 'gi://GdkPixbuf';
import { NEUTRAL, EXPRESSIONS, drawFace, resolveExpression, lerpParams } from '../face.js';

let failed = 0;
let passed = 0;

function check(label, condition) {
    if (condition) {
        passed++;
    } else {
        failed++;
        printerr(`GAGAL: ${label}`);
    }
}

function near(a, b) {
    return Math.abs(a - b) < 1e-9;
}

const KEYS = ['open', 'curve', 'width', 'gazeX', 'gazeY', 'tilt', 'glow', 'hue', 'cross'];

check('NEUTRAL punya semua kunci',
    KEYS.every(k => typeof NEUTRAL[k] === 'number'));

check('ada 12 ekspresi', Object.keys(EXPRESSIONS).length === 12);

for (const name of ['netral', 'mendengar', 'berpikir', 'bicara', 'senang', 'bingung', 'error', 'tidur', 'sakit', 'shutdown', 'restart', 'logout'])
    check(`ekspresi "${name}" terdaftar`, name in EXPRESSIONS);

for (const name of Object.keys(EXPRESSIONS)) {
    const p = resolveExpression(name);
    check(`"${name}" resolve ke objek lengkap`,
        p !== null && KEYS.every(k => typeof p[k] === 'number' && Number.isFinite(p[k])));
}

check('nama tak dikenal mengembalikan null', resolveExpression('ngaco') === null);
check('nama kosong mengembalikan null', resolveExpression('') === null);

const a = resolveExpression('netral');
const b = resolveExpression('senang');

check('lerp t=0 sama dengan awal', KEYS.every(k => near(lerpParams(a, b, 0)[k], a[k])));
check('lerp t=1 sama dengan akhir', KEYS.every(k => near(lerpParams(a, b, 1)[k], b[k])));
check('lerp t=0.5 di tengah',
    KEYS.every(k => near(lerpParams(a, b, 0.5)[k], (a[k] + b[k]) / 2)));
check('lerp menjepit t negatif', KEYS.every(k => near(lerpParams(a, b, -5)[k], a[k])));
check('lerp menjepit t lebih dari 1', KEYS.every(k => near(lerpParams(a, b, 9)[k], b[k])));

check('error berwarna merah', resolveExpression('error').hue === 0);
check('error berbentuk silang', resolveExpression('error').cross === 1);
check('tidur hampir terpejam', resolveExpression('tidur').open < 0.15);
check('senang melengkung ke atas', resolveExpression('senang').curve > 0.5);

// Avatar: bentuk & warna mata. Hitung piksel terang di kanvas 44x26 x4.
function gambar(lebih) {
    const s = new cairo.ImageSurface(cairo.Format.ARGB32, 176, 104);
    const cr = new cairo.Context(s);
    cr.scale(4, 4);
    drawFace(cr, 44, 26, { ...resolveExpression('netral'), ...lebih });
    cr.$dispose();
    const berkas = GLib.build_filenamev([GLib.get_tmp_dir(), `memo-uji-wajah-${GLib.getenv('USER')}.png`]);
    s.writeToPNG(berkas);
    const pb = GdkPixbuf.Pixbuf.new_from_file(berkas);
    GLib.unlink(berkas);
    const d = pb.get_pixels();
    let n = 0, merah = 0;
    for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] > 100) {
            n++;
            if (d[i] > 150 && d[i + 2] < 100)
                merah++;
        }
    }
    return { n, merah };
}
const kotak = gambar({}).n, bulat = gambar({ mata: 'bulat' }).n, sipit = gambar({ mata: 'sipit' }).n;
check('mata bulat lebih sedikit piksel dari kotak (tanpa sudut)', bulat < kotak && bulat > kotak * 0.4);
check('mata sipit satu baris (±1/3 kotak)', sipit < bulat && Math.abs(sipit * 3 - kotak) < kotak * 0.2);
check('warna mata avatar dipakai', gambar({ warnaMata: [0.9, 0.1, 0.1] }).merah > 0 && gambar({}).merah === 0);
check('nilai bawaan avatar', NEUTRAL.mata === 'kotak' && NEUTRAL.warnaMata === null);

print(`${passed} lolos, ${failed} gagal`);
if (failed > 0)
    system.exit(1);
