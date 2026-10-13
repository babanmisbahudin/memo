// Gambar Memo piksel untuk layar kunci & login (PNG transparan).
//
//   gjs -m gambar-memo.js <ekspresi> <keluaran.png> [lebar tinggi]
//
// Wajah digambar face.js yang sama dengan island di kanvas 44x26, lalu
// diperbesar x6 dengan filter nearest: pecah pikselnya disengaja.
// [lebar tinggi] memotong bagian tengah kanvas (dalam piksel seni), untuk
// avatar yang matanya harus tampak besar.

import Cairo from 'cairo';
import system from 'system';

import { drawFace, resolveExpression } from '../extension/face.js';

const SENI_L = 44;
const SENI_T = 26;
const SKALA = 6;

const [ekspresi, keluaran, potongL, potongT] = ARGV;
const L = Number(potongL ?? SENI_L);
const T = Number(potongT ?? SENI_T);
const params = resolveExpression(ekspresi ?? '');
if (!params || !keluaran) {
    printerr('pakai: gjs -m gambar-memo.js <ekspresi> <keluaran.png> [lebar tinggi]');
    system.exit(2);
}

const kecil = new Cairo.ImageSurface(Cairo.Format.ARGB32, SENI_L, SENI_T);
const c = new Cairo.Context(kecil);
drawFace(c, SENI_L, SENI_T, params);
c.$dispose();

const besar = new Cairo.ImageSurface(Cairo.Format.ARGB32, L * SKALA, T * SKALA);
const cr = new Cairo.Context(besar);
cr.scale(SKALA, SKALA);
cr.setSourceSurface(kecil, -Math.round((SENI_L - L) / 2), -Math.round((SENI_T - T) / 2));
cr.getSource().setFilter(Cairo.Filter.NEAREST);
cr.paint();
cr.$dispose();
besar.writeToPNG(keluaran);
