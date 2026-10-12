// Toko sesi agen + pills ala Coucou untuk Memo.
//
// Membaca berkas yang ditulis daemon (memo-agen.py, memo-integrasi.py) di
// /dev/shm tiap detik, dan menulis keputusan izin balik ke sana. Isi berkas
// yang tidak berubah tidak di-parse ulang, jadi biayanya satu baca kecil per
// detik. TIDAK menyentuh face.js / robotFace.js.

import GLib from 'gi://GLib';

const SHM = GLib.getenv('MEMO_SHM') || '/dev/shm';
const AGEN_PATH = `${SHM}/memo-agen.json`;
const PILLS_PATH = `${SHM}/memo-pills.json`;
const KEPUTUSAN_PATH = `${SHM}/memo-agen.keputusan.json`;
const DEMO_PATH = `${SHM}/memo-demo.aktif`;

const INTERVAL_MS = 1000;
// memo-agen menulis ulang paling lambat tiap 5 detik; lebih lama dari ini
// berarti daemonnya tidak jalan.
const BATAS_HIDUP_S = 15;

function bacaTeks(path) {
    try {
        const [ok, isi] = GLib.file_get_contents(path);
        return ok ? new TextDecoder().decode(isi) : null;
    } catch (e) {
        return null;
    }
}

function parse(teks) {
    if (!teks)
        return null;
    try {
        return JSON.parse(teks);
    } catch (e) {
        return null;
    }
}

export function tickerSesi(s) {
    if (!s)
        return '';
    const kepala = s.proyek ? `${s.agen} · ${s.proyek}` : s.agen;
    switch (s.status) {
    case 'butuh_izin':
        return `${kepala} — izin? ${s.butuh_izin?.aksi ?? ''}`;
    case 'selesai':
        return `${kepala} — selesai +${s.tambah ?? 0} −${s.kurang ?? 0}`;
    case 'galat':
        return `${kepala} — gagal`;
    case 'berpikir':
        return `${kepala} — berpikir…`;
    case 'idle':
        return s.tambah || s.kurang ? `${kepala} — diam · +${s.tambah} −${s.kurang}` : `${kepala} — diam`;
    }
    const langkah = (s.langkah ?? []).slice(-1)[0];
    const berkas = (s.file_diubah ?? []).slice(-1)[0];
    if (langkah?.jenis === 'edit' && berkas)
        return `${kepala} — ${berkas.berkas} +${berkas.tambah} −${berkas.kurang}`;
    if (langkah)
        return `${kepala} — ${langkah.ringkasan}`;
    return `${kepala} — ${s.status ?? 'idle'}`;
}

export class AgenStore {
    constructor() {
        this.sesi = [];
        this.izin = [];
        this.pills = [];
        this.demo = false;
        this._diperbarui = 0;
        this._teksAgen = null;
        this._teksPills = null;
        this._pendengar = [];
        this._id = 0;
    }

    get hidup() {
        return this._diperbarui > 0 && Date.now() / 1000 - this._diperbarui < BATAS_HIDUP_S;
    }

    onChange(fn) {
        this._pendengar.push(fn);
    }

    start() {
        if (this._id)
            return;
        // Gambar sekali walau berkasnya belum ada, supaya menu bisa bilang
        // daemonnya tidak jalan alih-alih kosong.
        this._tick(true);
        this._id = GLib.timeout_add(GLib.PRIORITY_LOW, INTERVAL_MS, () => {
            this._tick();
            return GLib.SOURCE_CONTINUE;
        });
    }

    stop() {
        if (this._id) {
            GLib.source_remove(this._id);
            this._id = 0;
        }
        this._pendengar = [];
    }

    _tick(paksa = false) {
        const teksAgen = bacaTeks(AGEN_PATH);
        const teksPills = bacaTeks(PILLS_PATH);
        const hidupLama = this.hidup;
        let berubah = paksa;
        if (teksAgen !== this._teksAgen) {
            this._teksAgen = teksAgen;
            const d = parse(teksAgen);
            this.sesi = Array.isArray(d?.sesi) ? d.sesi : [];
            this.izin = Array.isArray(d?.izin) ? d.izin : [];
            this.demo = !!d?.demo;
            this._diperbarui = d?.mati ? 0 : Number(d?.diperbarui) || 0;
            berubah = true;
        }
        if (teksPills !== this._teksPills) {
            this._teksPills = teksPills;
            const d = parse(teksPills);
            this.pills = Array.isArray(d?.pills) ? d.pills : [];
            berubah = true;
        }
        if (berubah || hidupLama !== this.hidup) {
            for (const fn of this._pendengar) {
                try {
                    fn(this);
                } catch (e) {
                    console.error(`[dynamic-island] pendengar agen: ${e}`);
                }
            }
        }
    }

    jawab(id, keputusan) {
        if (!id || !['allow', 'deny', 'always'].includes(keputusan))
            return false;
        try {
            GLib.file_set_contents(KEPUTUSAN_PATH,
                JSON.stringify({ id, keputusan, kapan: Date.now() }));
            return true;
        } catch (e) {
            console.error(`[dynamic-island] tulis keputusan: ${e}`);
            return false;
        }
    }

    mulaiDemo() {
        try {
            GLib.file_set_contents(DEMO_PATH, '1');
        } catch (e) {
            console.error(`[dynamic-island] demo: ${e}`);
        }
    }

    // Sesi yang paling layak tampil di island: yang sedang bekerja/selesai.
    get sesiAktif() {
        return this.sesi.find(s => ['kerja', 'berpikir', 'tanya', 'selesai', 'galat'].includes(s.status)) ?? null;
    }
}
