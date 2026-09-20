import cairo from 'gi://cairo';
import GLib from 'gi://GLib';

import { EXPRESSIONS, resolveExpression, drawFace } from '../face.js';

const SCALE = 6;               // diperbesar supaya bentuknya terlihat mata
const WIDTH = 44;
const HEIGHT = 26;

const outDir = ARGV[0] ?? '/tmp/ekspresi';
GLib.mkdir_with_parents(outDir, 0o755);

for (const name of Object.keys(EXPRESSIONS)) {
    const surface = new cairo.ImageSurface(cairo.Format.ARGB32, WIDTH * SCALE, HEIGHT * SCALE);
    const cr = new cairo.Context(surface);

    cr.scale(SCALE, SCALE);
    cr.setSourceRGBA(0.07, 0.07, 0.08, 1);
    cr.paint();

    drawFace(cr, WIDTH, HEIGHT, resolveExpression(name));

    cr.$dispose();
    const path = `${outDir}/${name}.png`;
    surface.writeToPNG(path);
    print(`ditulis: ${path}`);
}

print(`selesai, ${Object.keys(EXPRESSIONS).length} berkas`);
