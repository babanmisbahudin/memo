// Riwayat kabar & agen untuk tab Riwayat panel Memo: semua yang lewat di
// island hari ini (notifikasi, kabar LebihTeratur, agen selesai/galat, izin).
// Murni: tanpa St/Clutter/Meta, disimpan/dimuat sebagai JSON oleh island.
//
// entri: { waktu (ms), jenis: 'agen' | 'kabar' | 'notifikasi', judul, isi,
//          warna ('#rrggbb' atau null), buka ({jenis: 'url' | 'folder', target} atau null) }

export const BATAS = 200;
export const JENIS = ['agen', 'kabar', 'notifikasi'];
const JEDA_DUPLIKAT_MS = 10000;

// Hanya tautan http(s) dan folder berjalur mutlak yang boleh dibuka dari riwayat.
function bukaAman(b) {
    if (b?.jenis === 'url' && typeof b.target === 'string' && /^https?:\/\//.test(b.target))
        return { jenis: 'url', target: b.target };
    if (b?.jenis === 'folder' && typeof b.target === 'string' && b.target.startsWith('/'))
        return { jenis: 'folder', target: b.target };
    return null;
}

function rapikan(e) {
    if (!e || typeof e !== 'object' || !Number.isFinite(e.waktu) || !JENIS.includes(e.jenis) ||
        typeof e.judul !== 'string' || !e.judul.trim())
        return null;
    return {
        waktu: e.waktu, jenis: e.jenis, judul: e.judul.trim(),
        isi: typeof e.isi === 'string' ? e.isi : '',
        warna: typeof e.warna === 'string' && /^#[0-9a-f]{6}$/i.test(e.warna) ? e.warna : null,
        buka: bukaAman(e.buka),
    };
}

const hariSama = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();

export class Riwayat {
    constructor(entri = []) {
        this._e = (Array.isArray(entri) ? entri : []).map(rapikan).filter(Boolean).slice(-BATAS);
    }

    static dariJson(data) {
        return new Riwayat(data);
    }

    keJson() {
        return this._e.map(e => ({ ...e }));
    }

    // Mengembalikan false bila entri tidak sah atau sama persis dengan
    // entri sejenis terakhir kurang dari 10 detik lalu.
    tambah(e, sekarang = Date.now()) {
        const baru = rapikan({ ...e, waktu: sekarang });
        if (!baru)
            return false;
        const lalu = [...this._e].reverse().find(x => x.jenis === baru.jenis);
        if (lalu && lalu.judul === baru.judul && lalu.isi === baru.isi && sekarang - lalu.waktu < JEDA_DUPLIKAT_MS)
            return false;
        this._e.push(baru);
        if (this._e.length > BATAS)
            this._e.splice(0, this._e.length - BATAS);
        return true;
    }

    // Entri hari ini, terbaru di atas. saring: 'semua' atau salah satu JENIS.
    hariIni(saring = 'semua', sekarang = Date.now()) {
        return this._e
            .filter(e => hariSama(e.waktu, sekarang) && (saring === 'semua' || e.jenis === saring))
            .sort((a, b) => b.waktu - a.waktu);
    }
}
