import system from 'system';

import { NEUTRAL, EXPRESSIONS, resolveExpression, lerpParams } from '../face.js';

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

check('ada 11 ekspresi', Object.keys(EXPRESSIONS).length === 11);

for (const name of ['netral', 'mendengar', 'berpikir', 'bicara', 'senang', 'bingung', 'error', 'tidur', 'shutdown', 'restart', 'logout'])
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

print(`${passed} lolos, ${failed} gagal`);
if (failed > 0)
    system.exit(1);
