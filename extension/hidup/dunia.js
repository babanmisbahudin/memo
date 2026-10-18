// Peta dunia Memo dari apa yang ada di layar: di mana ia boleh berdiri
// (lantai), dari mana boleh mengintip (tepi), dan ke mana tidak boleh
// (zona larangan). Murni: tanpa St/Clutter/Meta, diuji dengan gjs polos.
//
// Koordinat = piksel logis layar. Titik Memo = tengah bawah badannya
// ("kaki"), sama di dunia.js, fisika.js, dan pikiran.js.
//
// persepsi: { areaKerja: {x, y, lebar, tinggi},
//             jendela: [{ id, x, y, lebar, tinggi, aktif, maksimal,
//                         layarPenuh, aplikasi, judul }]   // urut bawah → atas
//             kursor: {x, y}, ... }

export const LINGKAR_KURSOR = 160;
// Bagian badan yang menyembul saat mengintip.
export const BAGIAN_NGINTIP = 0.4;

// Interval [a, b) dikurangi interval-interval penutup -> sisa yang terbuka.
export function kurangiInterval([a, b], penutup) {
    let sisa = a < b ? [[a, b]] : [];
    for (const [p, q] of penutup) {
        const baru = [];
        for (const [x, y] of sisa) {
            if (q <= x || p >= y) {
                baru.push([x, y]);
                continue;
            }
            if (p > x)
                baru.push([x, p]);
            if (q < y)
                baru.push([q, y]);
        }
        sisa = baru;
    }
    return sisa;
}

const memotongPita = (w, atas, bawah) => w.y < bawah && w.y + w.tinggi > atas;

function memenuhi(w, A) {
    const t = 2;
    return w.x <= A.x + t && w.y <= A.y + t &&
        w.x + w.lebar >= A.x + A.lebar - t && w.y + w.tinggi >= A.y + A.tinggi - t;
}

export function petaDari(persepsi, ukuran) {
    const { areaKerja: A, jendela, kursor } = persepsi;
    const { lebar: l, tinggi: t } = ukuran;
    const aktif = jendela.find(w => w.aktif) ?? null;
    const sembunyi = jendela.some(w => w.layarPenuh);
    const hanyaTepi = !!aktif && (aktif.maksimal || memenuhi(aktif, A));
    const larangan = {
        kotak: aktif ? [{ x: aktif.x, y: aktif.y, lebar: aktif.lebar, tinggi: aktif.tinggi }] : [],
        kursor: { x: kursor.x, y: kursor.y, r: LINGKAR_KURSOR },
    };
    const bawah = A.y + A.tinggi;

    // Bagian [x1, x2) pada ketinggian y yang tidak tertutup jendela `diAtas`
    // di dalam pita setinggi `pita` tepat di atas y.
    const terbuka = (x1, x2, y, diAtas, pita) =>
        kurangiInterval([Math.max(x1, A.x), Math.min(x2, A.x + A.lebar)],
            diAtas.filter(w => memotongPita(w, y - pita, y)).map(w => [w.x, w.x + w.lebar]));

    // Lantai: dasar area kerja (tidak boleh tertutup jendela mana pun, karena
    // di sana Memo ada di lapisan atas) + tepi atas tiap jendela (hanya
    // tertutup oleh jendela yang lebih atas di tumpukan).
    const lantai = [];
    if (!hanyaTepi) {
        for (const [x1, x2] of terbuka(A.x, A.x + A.lebar, bawah, jendela, t))
            lantai.push({ x1, x2, y: bawah, jendelaId: null });
        jendela.forEach((w, i) => {
            if (w.y - t < A.y || w.y >= bawah)
                return;
            for (const [x1, x2] of terbuka(w.x, w.x + w.lebar, w.y, jendela.slice(i + 1), t))
                lantai.push({ x1, x2, y: w.y, jendelaId: w.id });
        });
    }

    // Tepi ngintip: pinggir layar (selalu ada) + atas jendela tak aktif
    // (Memo di belakang jendela itu, hanya BAGIAN_NGINTIP badan yang menyembul).
    const geser = Math.round(l * (0.5 - BAGIAN_NGINTIP));
    const tepi = [
        { jenis: 'layar', sisi: 'kiri', x: A.x - geser, y: bawah, jendelaId: null },
        { jenis: 'layar', sisi: 'kanan', x: A.x + A.lebar + geser, y: bawah, jendelaId: null },
        ...[0.25, 0.75].map(f => ({ jenis: 'layar', sisi: 'bawah', x: Math.round(A.x + A.lebar * f),
            y: Math.round(bawah + t * (1 - BAGIAN_NGINTIP)), jendelaId: null })),
    ];
    if (!hanyaTepi) {
        const pita = t * BAGIAN_NGINTIP;
        jendela.forEach((w, i) => {
            if (w.aktif || w.lebar < l || w.y - pita < A.y)
                return;
            const x = Math.round(w.x + Math.max(l / 2, Math.min(w.lebar * 0.3, w.lebar - l / 2)));
            const sisa = terbuka(x - l / 2, x + l / 2, w.y, jendela.slice(i + 1), pita);
            if (sisa.length === 1 && sisa[0][1] - sisa[0][0] >= l) {
                tepi.push({ jenis: 'jendela', sisi: 'atas', x, y: Math.round(w.y + t * (1 - BAGIAN_NGINTIP)),
                    jendelaId: w.id });
            }
        });
    }

    return { areaKerja: { ...A }, lantai: lantai.filter(L => L.x2 - L.x1 >= l), tepi, larangan, hanyaTepi, sembunyi };
}

// Bolehkah Memo (titik kaki x, y) berada di sini? Badannya tidak boleh di
// lingkar kursor dan tidak boleh menimpa isi jendela aktif. Satu-satunya
// pengecualian: tepi layar saat jendela aktif memenuhi layar (hanyaTepi).
export function bolehDi(peta, { x, y, jenis = null }, ukuran) {
    const { lebar: l, tinggi: t } = ukuran;
    const bx = x - l / 2, by = y - t;
    const k = peta.larangan.kursor;
    const dx = Math.max(bx - k.x, 0, k.x - (bx + l));
    const dy = Math.max(by - k.y, 0, k.y - (by + t));
    if (Math.hypot(dx, dy) < k.r)
        return false;
    if (jenis === 'layar' && peta.hanyaTepi)
        return true;
    return !peta.larangan.kotak.some(r =>
        bx < r.x + r.lebar && bx + l > r.x && by < r.y + r.tinggi && by + t > r.y);
}
