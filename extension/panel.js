// Panel Memo bergaya Coucou: island yang membesar jadi panel hitam berisi
// tab (Beranda, Chat, +), kartu sesi/izin/selesai dengan Memo piksel besar,
// dan kisi pill berwarna. Wajah tetap digambar face.js lewat RobotFace.

import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Pango from 'gi://Pango';
import GObject from 'gi://GObject';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { RobotFace } from './robotFace.js';
import { Gerak } from './gerak.js';
import { tickerSesi } from './agenStore.js';

const SHM = GLib.getenv('MEMO_SHM') || '/dev/shm';
const KONFIG = () => `${GLib.get_user_config_dir()}/memo`;

// Warna aksen per agen/layanan (cermin pill_katalog.py, disesuaikan supaya
// terbaca di atas hitam).
const WARNA = {
    claude: '#D97757', 'claude-desktop': '#D97757', opencode: '#cfd6dd', gemini: '#4285F4',
    codex: '#10A37F', copilot: '#8b6cf0', amp: '#FFAA00', cursor: '#9b7cf6', memo: '#3fb950',
    lebihteratur: '#3fd9b8', github: '#a5b1c2', vercel: '#e6edf3', notion: '#d4d4d4', lainnya: '#9aa4b2',
};
const NAMA_AGEN = {
    claude: 'Claude Code', 'claude-desktop': 'Claude Desktop', opencode: 'OpenCode', gemini: 'Gemini CLI',
    codex: 'Codex', copilot: 'Copilot CLI', amp: 'Amp', cursor: 'Cursor', memo: 'Memo', lainnya: 'Agen',
};
const WARNA_STATUS = {
    kerja: '#58a6ff', berpikir: '#58a6ff', tanya: '#f0b429', butuh_izin: '#f0b429',
    selesai: '#3fb950', galat: '#f85149', idle: '#6e7681',
};
const KATA_STATUS = {
    kerja: 'bekerja', berpikir: 'berpikir', tanya: 'bertanya', butuh_izin: 'minta izin',
    selesai: 'selesai', galat: 'gagal', idle: 'diam',
};

export const OTAK = [['opencode', 'OpenCode'], ['claude', 'Claude'], ['gemini', 'Gemini'], ['ollama', 'Ollama']];
// Cermin wardrobe_pola.py OUTFITS: [id, nama, hue, glow].
export const OUTFITS = [
    ['musiman', 'Musiman', null, 0], ['klasik', 'Klasik', 120, 0], ['laut', 'Laut', 205, 0.1],
    ['senja', 'Senja', 30, 0.1], ['anggur', 'Anggur', 280, 0.15], ['sakura', 'Sakura', 330, 0.1],
    ['emas', 'Emas', 45, 0.25], ['natal', 'Natal', 0, 0.2],
];
const MUSIMAN = { 1: 'emas', 2: 'sakura', 3: 'klasik', 4: 'klasik', 5: 'klasik', 6: 'laut', 7: 'laut',
    8: 'laut', 9: 'senja', 10: 'senja', 11: 'senja', 12: 'natal' };

const TINDAKAN = [
    ['Deploy ke Vercel', 'Tolong deploy proyek ini ke vercel'],
    ['Cek GitHub PR', 'Cek status PR di GitHub'],
    ['Status Render', 'Bagaimana status server di Render?'],
    ['Rekap mingguan', 'Tulis rekap mingguan: sesi, berkas, perintah tersering, hari tersibuk'],
];

// Avatar pill: gumpalan pixel-art dengan dua mata, seperti Mochi mini.
const BLOB = ['..########..', '.##########.', '############', '###.####.###',
    '############', '############', '.##########.', '..########..'];

export function bacaTeks(path) {
    try {
        const [ok, isi] = GLib.file_get_contents(path);
        return ok ? new TextDecoder().decode(isi) : null;
    } catch (e) {
        return null;
    }
}

export function bacaJson(path) {
    const t = bacaTeks(path);
    if (!t)
        return null;
    try {
        return JSON.parse(t);
    } catch (e) {
        return null;
    }
}

function tulis(path, isi) {
    try {
        GLib.file_set_contents(path, isi);
        return true;
    } catch (e) {
        console.error(`[dynamic-island] gagal menulis ${path}: ${e}`);
        return false;
    }
}

function rgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [n >> 16 & 255, n >> 8 & 255, n & 255];
}

function hsl(h) {
    const f = n => {
        const k = (n + h / 30) % 12;
        return Math.round(255 * (0.55 - 0.45 * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
    };
    return `rgb(${f(0)},${f(8)},${f(4)})`;
}

function label(teks, kelas, opsi = {}) {
    const l = new St.Label({ text: teks ?? '', style_class: kelas, y_align: Clutter.ActorAlign.CENTER, ...opsi });
    l.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    return l;
}

function labelBungkus(teks, kelas) {
    const l = new St.Label({ text: teks ?? '', style_class: kelas, x_expand: true });
    l.clutter_text.line_wrap = true;
    l.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
    l.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
    return l;
}

function tombol(teks, kelas, aksi, { petunjuk = null, ikon = null } = {}) {
    const isi = new St.BoxLayout({ style_class: 'memo-tombol-isi', y_align: Clutter.ActorAlign.CENTER });
    if (ikon)
        isi.add_child(new St.Icon({ icon_name: ikon, icon_size: 14, y_align: Clutter.ActorAlign.CENTER }));
    for (const [t, k] of [[teks, 'memo-tombol-teks'], [petunjuk, 'memo-kunci']]) {
        if (!t)
            continue;
        const l = label(t, k);
        l.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
        isi.add_child(l);
    }
    const b = new St.Button({ child: isi, style_class: `memo-btn ${kelas}`, can_focus: true, reactive: true });
    b.connect('clicked', () => aksi());
    return b;
}

const PANAH = ['...##...', '..####..', '.######.', '########', '...##...', '...##...', '...##...'];

function ikonPanah(blok = 2) {
    const a = new St.DrawingArea({ width: 8 * blok, height: PANAH.length * blok,
        x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER });
    a.connect('repaint', () => {
        const cr = a.get_context();
        try {
            cr.setSourceRGBA(0.07, 0.07, 0.07, 1);
            PANAH.forEach((baris, j) => [...baris].forEach((c, i) => {
                if (c === '#')
                    cr.rectangle(i * blok, j * blok, blok, blok);
            }));
            cr.fill();
        } finally {
            cr.$dispose();
        }
    });
    return a;
}

export function avatarPiksel(warna, statusWarna = null, blok = 2) {
    const lebar = BLOB[0].length * blok;
    const tinggi = BLOB.length * blok;
    const a = new St.DrawingArea({ width: lebar + 4, height: tinggi + 2, y_align: Clutter.ActorAlign.CENTER });
    const [r, g, b] = rgb(warna).map(v => v / 255);
    a.connect('repaint', () => {
        const cr = a.get_context();
        try {
            BLOB.forEach((baris, j) => [...baris].forEach((c, i) => {
                if (c === '.')
                    return;
                if (c === '#')
                    cr.setSourceRGBA(r, g, b, 1);
                else
                    cr.setSourceRGBA(0.1, 0.1, 0.12, 1);
                cr.rectangle(4 + i * blok, 2 + j * blok, blok, blok);
                cr.fill();
            }));
            // Mata: dua piksel gelap.
            cr.setSourceRGBA(0.1, 0.1, 0.12, 1);
            cr.rectangle(4 + 3 * blok, 2 + 3 * blok, blok, blok * 2);
            cr.rectangle(4 + 8 * blok, 2 + 3 * blok, blok, blok * 2);
            cr.fill();
            if (statusWarna) {
                const [sr, sg, sb] = rgb(statusWarna).map(v => v / 255);
                cr.setSourceRGBA(0, 0, 0, 1);
                cr.rectangle(0, 0, blok * 3, blok * 3);
                cr.fill();
                cr.setSourceRGBA(sr, sg, sb, 1);
                cr.rectangle(blok * 0.5, blok * 0.5, blok * 2, blok * 2);
                cr.fill();
            }
        } finally {
            cr.$dispose();
        }
    });
    return a;
}

export class PanelMemo {
    constructor(island) {
        this._island = island;
        this._tab = 'beranda';
        this._chatTertunda = null;       // pesan terkirim yang belum dicatat memo-suara
        this._pilihan = null;            // {jenis: 'sesi'|'layanan', id}
        this._selesai = new Map();       // id sesi -> ringkasan, sampai diklik OK
        this._statusLalu = new Map();
        this._store = null;
        this._tanda = '';
        this.kartuIzin = null;
        this.tombolIzin = {};

        this.actor = new St.BoxLayout({ vertical: true, style_class: 'memo-panel', x_expand: true });
        this.actor.add_child(this._bangunAtas());

        this._isi = new St.Widget({ layout_manager: new Clutter.BinLayout(), x_expand: true });
        this.actor.add_child(this._isi);

        this._beranda = new St.BoxLayout({ style_class: 'memo-baris-kartu', x_expand: true });
        this._kartuUtama = new St.BoxLayout({ style_class: 'memo-kartu', x_expand: true });
        this._wajah = this._bangunAvatar();
        this._kartuUtama.add_child(this._wajah.bingkai);
        this._info = new St.BoxLayout({ vertical: true, style_class: 'memo-info', x_expand: true,
            y_align: Clutter.ActorAlign.CENTER });
        this._kartuUtama.add_child(this._info);
        this._kartuPill = new St.BoxLayout({ style_class: 'memo-kartu memo-kartu-pill', y_expand: true });
        this._kisi = new St.Widget({
            layout_manager: new Clutter.GridLayout({ column_spacing: 8, row_spacing: 8 }),
            y_align: Clutter.ActorAlign.CENTER, x_align: Clutter.ActorAlign.CENTER,
        });
        this._kartuPill.add_child(this._kisi);
        this._beranda.add_child(this._kartuUtama);
        this._beranda.add_child(this._kartuPill);

        this._chat = this._bangunChat();
        this._tambah = this._bangunTambah();
        this._atur = this._bangunAtur();
        for (const v of [this._beranda, this._chat.akar, this._tambah.akar, this._atur.akar])
            this._isi.add_child(v);
        this.pilihTab('beranda');
    }

    // --- Baris atas: tab kiri, status + suara + pengaturan kanan ---------
    // Jam + titik notifikasi bawaan Ubuntu, dicerminkan dari dateMenu di top
    // bar supaya formatnya selalu sama dengan pengaturan sistem. Diklik:
    // membuka kalender & notifikasi bawaan.
    _bangunJam() {
        const isi = new St.BoxLayout({ style_class: 'memo-jam-isi', y_align: Clutter.ActorAlign.CENTER });
        this._jam = new St.Label({ style_class: 'memo-jam-teks', y_align: Clutter.ActorAlign.CENTER });
        this._titikNotif = new St.Widget({ style_class: 'memo-jam-titik', visible: false,
            y_align: Clutter.ActorAlign.CENTER });
        isi.add_child(this._jam);
        isi.add_child(this._titikNotif);
        this._tombolJam = new St.Button({ style_class: 'memo-jam', can_focus: true, child: isi,
            x_expand: true, y_expand: true, x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER });
        this._tombolJam.connect('clicked', () => this._island.bukaKalender());
        this._ikatan = [];
        const dm = Main.panel.statusArea.dateMenu;
        try {
            if (dm?._clockDisplay)
                this._ikatan.push(dm._clockDisplay.bind_property('text', this._jam, 'text', GObject.BindingFlags.SYNC_CREATE));
            if (dm?._indicator)
                this._ikatan.push(dm._indicator.bind_property('visible', this._titikNotif, 'visible', GObject.BindingFlags.SYNC_CREATE));
        } catch (e) {
            console.error(`[dynamic-island] jam panel: ${e}`);
        }
        if (!this._jam.text) {
            const kini = GLib.DateTime.new_now_local();
            this._jam.text = kini.format('%b %e  %H:%M');
        }
        return this._tombolJam;
    }

    // Ikon sistem bilah atas (Wi-Fi, suara, daya, baterai, ...) sebagai salinan
    // langsung, jadi selalu sama dengan aslinya. Diklik: Pengaturan Cepat
    // bawaan (restart/matikan, kunci layar, Wi-Fi, Bluetooth, ...).
    _bangunIkonSistem() {
        const qs = Main.panel.statusArea.quickSettings;
        const isi = qs?._indicators
            ? new Clutter.Clone({ source: qs._indicators, y_align: Clutter.ActorAlign.CENTER })
            : new St.Icon({ icon_name: 'system-shutdown-symbolic', icon_size: 16 });
        this._tombolSistem = new St.Button({ style_class: 'memo-sistem', can_focus: true, child: isi,
            y_align: Clutter.ActorAlign.CENTER });
        this._tombolSistem.connect('clicked', () => this._island.bukaPengaturanCepat());
        return this._tombolSistem;
    }

    _bangunAtas() {
        const tumpuk = new St.Widget({ layout_manager: new Clutter.BinLayout(), x_expand: true });
        const atas = new St.BoxLayout({ style_class: 'memo-panel-atas', x_expand: true });
        tumpuk.add_child(atas);
        tumpuk.add_child(this._bangunJam());
        this._tombolTab = {};
        for (const [id, ikon] of [['beranda', 'go-home-symbolic'], ['chat', 'chat-bubble-text-symbolic'],
            ['tambah', 'list-add-symbolic']]) {
            const b = new St.Button({ style_class: 'memo-tab', can_focus: true,
                child: new St.Icon({ icon_name: ikon, icon_size: 16 }) });
            b.connect('clicked', () => this.pilihTab(id));
            this._tombolTab[id] = b;
            atas.add_child(b);
        }
        // Status di kiri (setelah +) supaya sisi kanan cukup untuk ikon sistem
        // tanpa menabrak jam di tengah.
        this._statusAtas = label('', 'memo-panel-status');
        atas.add_child(this._statusAtas);
        atas.add_child(new St.Widget({ x_expand: true }));
        atas.add_child(this._bangunIkonSistem());
        this._ikonSuara = new St.Icon({ icon_size: 16 });
        const suara = new St.Button({ style_class: 'memo-tab', can_focus: true, child: this._ikonSuara });
        suara.connect('clicked', () => this._togelSuara());
        atas.add_child(suara);
        const atur = new St.Button({ style_class: 'memo-tab', can_focus: true,
            child: new St.Icon({ icon_name: 'emblem-system-symbolic', icon_size: 16 }) });
        atur.connect('clicked', () => this.pilihTab('atur'));
        this._tombolTab.atur = atur;
        atas.add_child(atur);
        this._segarkanSuara();
        return tumpuk;
    }

    _bangunAvatar() {
        const bingkai = new St.Widget({ layout_manager: new Clutter.BinLayout(), style_class: 'memo-avatar',
            width: 100, height: 80, y_align: Clutter.ActorAlign.CENTER,
            // Diset eksplisit: x_expand milik lencana tidak boleh merambat ke
            // bingkai, kalau tidak wajah melebar ke tengah kartu.
            x_expand: false, y_expand: false });
        const wajah = new RobotFace();
        wajah.actor.x_align = Clutter.ActorAlign.CENTER;
        wajah.actor.y_align = Clutter.ActorAlign.CENTER;
        wajah.setBlinkingEnabled(true);
        bingkai.add_child(wajah.actor);
        const gerak = new Gerak(wajah.actor, { skalaDasar: 2.2, amplitudo: 0.8, pivotY: 0.5, arahPartikel: -1, blokPartikel: 3 });
        const lencana = new St.Label({ style_class: 'memo-lencana', visible: false, x_expand: true, y_expand: true,
            x_align: Clutter.ActorAlign.START, y_align: Clutter.ActorAlign.START });
        bingkai.add_child(lencana);
        return { bingkai, wajah, gerak, lencana };
    }

    pilihTab(id) {
        this._tab = id;
        if (id === 'beranda' && this._store)
            GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                this.segarkan();
                return GLib.SOURCE_REMOVE;
            });
        const view = { beranda: this._beranda, chat: this._chat.akar, tambah: this._tambah.akar, atur: this._atur.akar };
        for (const [k, v] of Object.entries(view))
            v.visible = k === id;
        for (const [k, b] of Object.entries(this._tombolTab)) {
            if (k === id)
                b.add_style_pseudo_class('checked');
            else
                b.remove_style_pseudo_class('checked');
        }
        // Wajah besar ikut pindah ke kartu yang sedang tampil.
        this._wajah.bingkai.get_parent()?.remove_child(this._wajah.bingkai);
        const rumah = { beranda: this._kartuUtama, chat: this._chat.kartu, tambah: this._tambah.kartu, atur: null }[id];
        if (rumah)
            rumah.insert_child_at_index(this._wajah.bingkai, 0);
        if (id !== 'beranda')
            this._wajah.lencana.visible = false;
        else
            this._tanda = '';
        if (id === 'chat') {
            this.segarkanChat();
            global.stage.set_key_focus(this._chat.entri.clutter_text);
        } else if (id === 'tambah') {
            this.segarkanLampiran();
        } else if (id === 'atur') {
            this.segarkanAtur();
        }
    }

    // --- Ekspresi/gerak cermin island ------------------------------------
    sync(ekspresi) {
        this._wajah.wajah.setExpression(ekspresi);
    }

    setTint(hue, glow) {
        this._wajah.wajah.setTint(hue, glow);
    }

    gerak(nama, opsi = {}) {
        if (!this.actor.mapped)
            return;
        if (nama)
            this._wajah.gerak.main(nama, opsi);
        if (opsi.partikel)
            this._wajah.gerak.partikel(opsi.partikel, opsi.jumlah ?? 1);
    }

    // --- Beranda ---------------------------------------------------------
    segarkan(store) {
        if (store)
            this._store = store;
        store = this._store;
        if (!store)
            return;
        for (const s of store.sesi) {
            const lama = this._statusLalu.get(s.id);
            if (s.status === 'selesai' && lama && lama !== 'selesai')
                this._selesai.set(s.id, { ...s, waktu: Date.now() });
            if (['kerja', 'berpikir', 'tanya', 'butuh_izin'].includes(s.status))
                this._selesai.delete(s.id);
        }
        this._statusLalu = new Map(store.sesi.map(s => [s.id, s.status]));
        for (const [id, info] of this._selesai) {
            if (Date.now() - info.waktu > 10 * 60 * 1000)
                this._selesai.delete(id);
        }
        const jalan = store.sesi.filter(s => ['kerja', 'berpikir', 'tanya', 'butuh_izin'].includes(s.status)).length;
        this._statusAtas.text = !store.hidup ? 'memo-agen mati' : jalan ? `${jalan} berjalan` : '';
        this._statusAtas.visible = !!this._statusAtas.text;

        const tanda = JSON.stringify([store.hidup, store.izin, store.sesi, store.pills, this._pilihan,
            [...this._selesai.keys()], store.demo]);
        if (tanda === this._tanda)
            return;
        this._tanda = tanda;
        this._isiKartuUtama(store);
        this._isiPill(store);
        const u = this._utama(store);
        if (u.jenis === 'izin' || u.jenis === 'selesai')
            this._kartuPill.visible = false;
    }

    _utama(store) {
        if (store.izin.length)
            return { jenis: 'izin', izin: store.izin[0] };
        const p = this._pilihan;
        if (p?.jenis === 'layanan') {
            const pill = store.pills.find(x => x.id === p.id);
            if (pill)
                return { jenis: 'layanan', pill };
        }
        if (p?.jenis === 'sesi') {
            const s = store.sesi.find(x => x.id === p.id);
            if (s)
                return this._selesai.has(s.id) ? { jenis: 'selesai', sesi: this._selesai.get(s.id) } : { jenis: 'sesi', sesi: s };
        }
        const [idSelesai, infoSelesai] = [...this._selesai.entries()].pop() ?? [];
        if (idSelesai)
            return { jenis: 'selesai', sesi: infoSelesai };
        const aktif = store.sesi.find(s => ['kerja', 'berpikir', 'tanya'].includes(s.status)) ?? store.sesi[0];
        return aktif ? { jenis: 'sesi', sesi: aktif } : { jenis: 'kosong' };
    }

    _judul(dot, nama, sekunder) {
        const baris = new St.BoxLayout({ style_class: 'memo-judul-baris' });
        baris.add_child(new St.Widget({ style_class: 'memo-titik', style: `background-color: ${dot};`,
            y_align: Clutter.ActorAlign.CENTER }));
        baris.add_child(label(nama, 'memo-judul-nama'));
        if (sekunder)
            baris.add_child(label(sekunder, 'memo-judul-sekunder'));
        return baris;
    }

    _lencana(teks, kelas) {
        const l = this._wajah.lencana;
        l.visible = !!teks;
        l.text = teks ?? '';
        l.style_class = `memo-lencana ${kelas ?? ''}`;
    }

    _isiKartuUtama(store) {
        this._info.destroy_all_children();
        this.kartuIzin = null;
        this.izinPerintah = null;
        this.tombolIzin = {};
        const u = this._utama(store);
        this._kartuUtama.style_class = `memo-kartu memo-kartu-${u.jenis}`;
        this._lencana(null);

        if (!store.hidup) {
            this._info.add_child(this._judul(WARNA_STATUS.galat, 'memo-agen tidak jalan'));
            this._info.add_child(label('systemctl --user start memo-agen', 'memo-langkah memo-langkah-kini'));
            return;
        }
        if (u.jenis === 'kosong') {
            this._info.add_child(this._judul(WARNA_STATUS.idle, 'Belum ada agen bekerja'));
            this._info.add_child(labelBungkus('Sesi Claude Code dan OpenCode muncul di sini, lengkap dengan kartu izinnya.',
                'memo-langkah'));
            return;
        }
        if (u.jenis === 'izin') {
            const iz = u.izin;
            this._lencana('!', 'memo-lencana-izin');
            this._info.add_child(this._judul(WARNA[iz.agen] ?? WARNA.lainnya, iz.proyek || iz.agen,
                `${NAMA_AGEN[iz.agen] ?? iz.agen} minta izin`));
            this.izinPerintah = labelBungkus(iz.perintah || iz.aksi, 'memo-perintah');
            this._info.add_child(this.izinPerintah);
            const baris = new St.BoxLayout({ style_class: 'memo-baris-tombol' });
            for (const [teks, k, kelas, kunci] of [['Tolak', 'deny', 'memo-btn-gelap', '⇧Y'],
                ['Izinkan', 'allow', 'memo-btn-terang', 'Y'], ['Selalu', 'always', 'memo-btn-gelap', null]]) {
                const b = tombol(teks, kelas, () => this._island.jawabIzin(k), { petunjuk: kunci ? `Super+${kunci}` : null });
                this.tombolIzin[k] = b;
                baris.add_child(b);
            }
            this._info.add_child(baris);
            if (store.izin.length > 1)
                this._info.add_child(label(`+${store.izin.length - 1} izin lain menunggu`, 'memo-langkah'));
            this.kartuIzin = this._kartuUtama;
            return;
        }
        if (u.jenis === 'selesai') {
            const s = u.sesi;
            this._lencana('✓', 'memo-lencana-selesai');
            this._info.add_child(this._judul(WARNA[s.agen] ?? WARNA.lainnya, s.proyek || s.agen,
                `${NAMA_AGEN[s.agen] ?? s.agen} selesai`));
            const berkas = (s.file_diubah ?? []).length;
            const kalimat = berkas
                ? `+${s.tambah ?? 0} −${s.kurang ?? 0} di ${berkas} berkas`
                : (s.langkah ?? []).filter(l => l.jenis !== 'info').slice(-1)[0]?.ringkasan ?? 'Tugas selesai.';
            this._info.add_child(labelBungkus(kalimat, 'memo-kalimat-besar'));
            const baris = new St.BoxLayout({ style_class: 'memo-baris-tombol' });
            baris.add_child(tombol('OK', 'memo-btn-gelap', () => {
                this._selesai.delete(s.id);
                this._pilihan = null;
                this.segarkan();
            }));
            this._info.add_child(baris);
            return;
        }
        if (u.jenis === 'layanan') {
            const p = u.pill;
            this._info.add_child(this._judul(WARNA[p.id] ?? WARNA.lainnya, p.judul, p.aktif ? 'tersambung' : 'belum aktif'));
            this._info.add_child(labelBungkus(p.sub, 'memo-langkah'));
            for (const k of (p.kabar ?? []).slice(0, 3)) {
                const sah = typeof k.url === 'string' && /^https?:\/\//.test(k.url);
                const isi = label(`${sah ? '↗ ' : ''}${k.judul} — ${k.pesan ?? ''}`, 'memo-kabar');
                if (sah) {
                    const b = new St.Button({ child: isi, style_class: 'memo-baris-tautan', x_expand: true, can_focus: true });
                    b.connect('clicked', () => {
                        try {
                            Gio.AppInfo.launch_default_for_uri(k.url, null);
                        } catch (e) {
                            console.error(`[dynamic-island] buka kabar: ${e}`);
                        }
                    });
                    this._info.add_child(b);
                } else {
                    this._info.add_child(isi);
                }
            }
            return;
        }
        // Sesi berjalan: judul + tiga langkah terakhir.
        const s = u.sesi;
        if (['kerja', 'berpikir', 'tanya'].includes(s.status))
            this._lencana('•••', 'memo-lencana-kerja');
        this._info.add_child(this._judul(WARNA_STATUS[s.status] ?? WARNA_STATUS.idle, s.proyek || s.agen,
            `${NAMA_AGEN[s.agen] ?? s.agen} · ${KATA_STATUS[s.status] ?? s.status}`));
        const langkah = (s.langkah ?? []).slice(-3);
        if (!langkah.length)
            this._info.add_child(label(s.prompt || tickerSesi(s), 'memo-langkah'));
        langkah.forEach((l, i) => {
            const kini = i === langkah.length - 1 && ['kerja', 'tanya'].includes(s.status);
            const ikon = kini ? { jalan: 'utilities-terminal-symbolic', edit: 'document-edit-symbolic', baca: 'system-search-symbolic' }[l.jenis] ?? 'utilities-terminal-symbolic' : 'object-select-symbolic';
            const baris = new St.BoxLayout({ style_class: `memo-baris-langkah${kini ? ' memo-langkah-kini' : ''}` });
            baris.add_child(new St.Icon({ icon_name: ikon, icon_size: 14, style_class: 'memo-ikon-langkah' }));
            baris.add_child(label(l.ringkasan, `memo-langkah${kini ? ' memo-langkah-kini' : ''}`, { x_expand: true }));
            this._info.add_child(baris);
        });
        if (s.tambah || s.kurang) {
            const diff = new St.BoxLayout({ style_class: 'memo-baris-diff' });
            diff.add_child(label(`+${s.tambah}`, 'memo-tambah'));
            diff.add_child(label(`−${s.kurang}`, 'memo-kurang'));
            diff.add_child(label(`${(s.file_diubah ?? []).length} berkas`, 'memo-langkah'));
            this._info.add_child(diff);
        }
        if (store.demo)
            this._info.add_child(label('mode demo — data contoh', 'memo-langkah'));
    }

    _pill(id, judul, warna, statusWarna, aksi, terpilih) {
        const [r, g, b] = rgb(warna);
        const isi = new St.BoxLayout({ style_class: 'memo-pill-isi' });
        isi.add_child(avatarPiksel(warna, statusWarna));
        isi.add_child(label(judul, 'memo-pill-teks', { style: `color: rgb(${Math.round(r * 0.6 + 102)},${Math.round(g * 0.6 + 102)},${Math.round(b * 0.6 + 102)});` }));
        const btn = new St.Button({
            child: isi, can_focus: true, style_class: `memo-pill${terpilih ? ' memo-pill-terpilih' : ''}`,
            style: `background-color: rgba(${r},${g},${b},0.14); border-color: rgba(${r},${g},${b},${terpilih ? 0.9 : 0.42});`,
        });
        btn.connect('clicked', aksi);
        btn._memoId = id;
        return btn;
    }

    _isiPill(store) {
        this._kisi.destroy_all_children();
        const grid = this._kisi.layout_manager;
        const daftar = [];
        for (const s of store.sesi.slice(0, 6)) {
            daftar.push(this._pill(s.id, s.proyek || NAMA_AGEN[s.agen] || s.agen, WARNA[s.agen] ?? WARNA.lainnya,
                WARNA_STATUS[s.status], () => {
                    this._pilihan = { jenis: 'sesi', id: s.id };
                    this.segarkan();
                }, this._pilihan?.id === s.id));
        }
        for (const p of store.pills) {
            daftar.push(this._pill(p.id, p.judul, WARNA[p.id] ?? WARNA.lainnya, p.aktif ? null : '#6e7681', () => {
                this._pilihan = this._pilihan?.id === p.id ? null : { jenis: 'layanan', id: p.id };
                this.segarkan();
            }, this._pilihan?.id === p.id));
        }
        daftar.slice(0, 8).forEach((b, i) => grid.attach(b, i % 2, Math.floor(i / 2), 1, 1));
        this._kartuPill.visible = daftar.length > 0;
    }

    // Untuk uji: teks yang sedang tampil.
    get teksKartu() {
        const teks = [];
        const jelajah = a => {
            if (a instanceof St.Label && a.visible)
                teks.push(a.text);
            for (const c of a.get_children())
                jelajah(c);
        };
        jelajah(this._info);
        return teks;
    }

    get teksPill() {
        return this._kisi.get_children().map(b => b.get_child().get_children()[1].text);
    }

    // --- Chat ------------------------------------------------------------
    _bangunChat() {
        const akar = new St.BoxLayout({ style_class: 'memo-baris-kartu', x_expand: true });
        const kartu = new St.BoxLayout({ style_class: 'memo-kartu memo-kartu-chat', x_expand: true });
        const kanan = new St.BoxLayout({ vertical: true, x_expand: true, style_class: 'memo-info' });
        const riwayat = new St.BoxLayout({ vertical: true, style_class: 'memo-riwayat' });
        const status = label('', 'memo-langkah');
        const barisMasuk = new St.BoxLayout({ style_class: 'memo-chat-masuk', x_expand: true });
        const entri = new St.Entry({ style_class: 'memo-chat-entri', can_focus: true, x_expand: true,
            hint_text: 'Tanya Memo…' });
        const kirim = () => {
            const teks = entri.get_text().trim();
            if (!teks)
                return;
            tulis(`${SHM}/memo-ngobrol.teks`, teks);
            entri.set_text('');
            this.segarkanChat({ kamu: teks });
        };
        entri.clutter_text.connect('activate', kirim);
        const mic = new St.Button({ style_class: 'memo-bulat', can_focus: true,
            child: new St.Icon({ icon_name: 'audio-input-microphone-symbolic', icon_size: 16 }) });
        mic.connect('clicked', () => {
            tulis(`${SHM}/memo-ngobrol.minta`, '');
            this._island.trigger('audio-input-microphone-symbolic', 'Mendengarkan...', 2000);
        });
        const btnKirim = new St.Button({ style_class: 'memo-bulat memo-bulat-terang', can_focus: true,
            child: ikonPanah() });
        btnKirim.connect('clicked', kirim);
        barisMasuk.add_child(entri);
        barisMasuk.add_child(mic);
        barisMasuk.add_child(btnKirim);
        kanan.add_child(riwayat);
        kanan.add_child(status);
        kanan.add_child(barisMasuk);
        kartu.add_child(kanan);
        akar.add_child(kartu);
        return { akar, kartu, riwayat, status, entri };
    }

    segarkanChat({ kamu = null } = {}) {
        const c = this._chat;
        let riwayat = bacaJson(`${SHM}/memo-ngobrol.riwayat.json`);
        riwayat = Array.isArray(riwayat) ? riwayat : [];
        if (kamu)
            this._chatTertunda = { teks: kamu, waktu: Date.now() };
        const t = this._chatTertunda;
        if (t) {
            const sudah = riwayat.some(g => g.peran === 'kamu' && g.teks === t.teks);
            if (sudah || Date.now() - t.waktu > 120000)
                this._chatTertunda = null;
            else
                riwayat = [...riwayat, { peran: 'kamu', teks: t.teks }];
        }
        c.riwayat.destroy_all_children();
        if (!riwayat.length)
            c.riwayat.add_child(labelBungkus('Halo! Ketik pertanyaan, atau tekan mikrofon untuk bicara.', 'memo-langkah'));
        for (const g of riwayat.slice(-4)) {
            const baris = new St.BoxLayout({ style_class: `memo-gelembung memo-gelembung-${g.peran}` });
            baris.add_child(label({ kamu: 'Kamu', memo: 'Memo', galat: 'Galat', info: '·' }[g.peran] ?? g.peran,
                'memo-gelembung-siapa'));
            baris.add_child(labelBungkus(g.teks, 'memo-gelembung-teks'));
            c.riwayat.add_child(baris);
        }
        const st = (bacaTeks(`${SHM}/memo-ngobrol.status`) ?? '').trim();
        const otak = (bacaTeks(`${SHM}/memo-ngobrol.backend`) ?? '').trim() || 'otomatis';
        c.status.text = st && !st.startsWith('jawab:') ? `Memo ${st.split(':')[0]}… · otak: ${otak}` : `otak: ${otak}`;
    }

    // --- Tambah: tindakan cepat + lampiran -------------------------------
    _bangunTambah() {
        const akar = new St.BoxLayout({ style_class: 'memo-baris-kartu', x_expand: true });
        const kartu = new St.BoxLayout({ style_class: 'memo-kartu', x_expand: true });
        const kanan = new St.BoxLayout({ vertical: true, x_expand: true, style_class: 'memo-info' });
        kanan.add_child(this._judul(WARNA.memo, 'Tindakan cepat', 'dikirim ke chat Memo'));
        const baris1 = new St.BoxLayout({ style_class: 'memo-baris-tombol' });
        const baris2 = new St.BoxLayout({ style_class: 'memo-baris-tombol' });
        TINDAKAN.forEach(([teks, perintah], i) => {
            (i < 2 ? baris1 : baris2).add_child(tombol(teks, 'memo-btn-gelap', () => {
                tulis(`${SHM}/memo-ngobrol.teks`, perintah);
                this.pilihTab('chat');
                this.segarkanChat({ kamu: perintah });
            }));
        });
        kanan.add_child(baris1);
        kanan.add_child(baris2);
        const lamp = new St.BoxLayout({ style_class: 'memo-baris-tombol' });
        const teksLamp = label('', 'memo-langkah', { x_expand: true });
        const lepas = tombol('Lepas', 'memo-btn-gelap', () => {
            try {
                GLib.unlink(`${SHM}/memo-lampiran.json`);
            } catch (e) { /* tidak ada lampiran */ }
            this.segarkanLampiran();
        });
        lamp.add_child(tombol('Lampirkan berkas…', 'memo-btn-terang', () => this._pilihBerkas(),
            { ikon: 'mail-attachment-symbolic' }));
        lamp.add_child(teksLamp);
        lamp.add_child(lepas);
        kanan.add_child(lamp);
        kartu.add_child(kanan);
        akar.add_child(kartu);
        return { akar, kartu, teksLamp, lepas };
    }

    segarkanLampiran() {
        const l = bacaJson(`${SHM}/memo-lampiran.json`);
        this._tambah.teksLamp.text = l ? `📎 ${l.nama ?? l.path} — ikut ditanya` : 'belum ada lampiran';
        this._tambah.lepas.visible = !!l;
    }

    _pilihBerkas() {
        const skrip = this._island.jalurBin?.('memo-lampirkan.py');
        if (!skrip)
            return;
        try {
            const p = Gio.Subprocess.new(['zenity', '--file-selection', '--title=Lampirkan berkas ke Memo'],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE);
            p.communicate_utf8_async(null, null, (proc, res) => {
                try {
                    const [, keluar] = proc.communicate_utf8_finish(res);
                    const path = (keluar ?? '').trim();
                    if (path && proc.get_successful()) {
                        const l = Gio.Subprocess.new(['python3', skrip, path], Gio.SubprocessFlags.NONE);
                        l.wait_async(null, () => this.segarkanLampiran());
                    }
                } catch (e) {
                    console.error(`[dynamic-island] lampirkan: ${e}`);
                }
            });
            this._island.menu.close();
        } catch (e) {
            console.error(`[dynamic-island] zenity: ${e}`);
        }
    }

    // --- Pengaturan ------------------------------------------------------
    _bangunAtur() {
        const akar = new St.BoxLayout({ style_class: 'memo-baris-kartu', x_expand: true });
        const kartu = new St.BoxLayout({ vertical: true, style_class: 'memo-kartu', x_expand: true });
        const bagian = (judul, isi) => {
            const b = new St.BoxLayout({ style_class: 'memo-bagian' });
            b.add_child(label(judul, 'memo-bagian-judul'));
            b.add_child(isi);
            kartu.add_child(b);
        };
        const barisOtak = new St.BoxLayout({ style_class: 'memo-segmen' });
        this._tombolOtak = OTAK.map(([id, nama]) => {
            const b = tombol(nama, 'memo-btn-gelap', () => {
                tulis(`${SHM}/memo-ngobrol.backend`, id);
                this.segarkanAtur();
            });
            b._memoId = id;
            barisOtak.add_child(b);
            return b;
        });
        bagian('Otak AI', barisOtak);
        const barisBaju = new St.BoxLayout({ style_class: 'memo-segmen' });
        this._tombolBaju = OUTFITS.map(([id, nama, hue]) => {
            const b = new St.Button({ style_class: 'memo-baju', can_focus: true, accessible_name: nama,
                style: hue === null ? '' : `background-color: ${hsl(hue)};`,
                child: hue === null ? new St.Icon({ icon_name: 'weather-clear-symbolic', icon_size: 12 }) : null });
            b.connect('clicked', () => {
                this._island.pilihWardrobe(id);
                this.segarkanAtur();
            });
            b._memoId = id;
            barisBaju.add_child(b);
            return b;
        });
        this._namaBaju = label('', 'memo-langkah');
        barisBaju.add_child(this._namaBaju);
        bagian('Wardrobe', barisBaju);
        const barisMemo = new St.BoxLayout({ style_class: 'memo-segmen' });
        this._tombolDesktop = tombol('Lepas ke desktop', 'memo-btn-gelap', () => {
            this._island.togelCompanion();
            this.segarkanAtur();
        });
        barisMemo.add_child(this._tombolDesktop);
        barisMemo.add_child(tombol('Demo 60 dtk', 'memo-btn-gelap', () => {
            this._island.mulaiDemo();
            this.pilihTab('beranda');
        }));
        barisMemo.add_child(tombol('Folder suara', 'memo-btn-gelap', () => {
            try {
                const dir = `${KONFIG()}/suara`;
                GLib.mkdir_with_parents(dir, 0o700);
                Gio.AppInfo.launch_default_for_uri(`file://${dir}`, null);
            } catch (e) {
                console.error(`[dynamic-island] folder suara: ${e}`);
            }
            this._island.menu.close();
        }));
        bagian('Memo', barisMemo);
        akar.add_child(kartu);
        return { akar, kartu: null };
    }

    segarkanAtur() {
        const otak = (bacaTeks(`${SHM}/memo-ngobrol.backend`) ?? '').trim() || 'opencode';
        for (const b of this._tombolOtak)
            b.style_class = `memo-btn ${b._memoId === otak ? 'memo-btn-terang' : 'memo-btn-gelap'}`;
        const baju = this._island.wardrobeAktif();
        for (const b of this._tombolBaju) {
            if (b._memoId === baju)
                b.add_style_pseudo_class('checked');
            else
                b.remove_style_pseudo_class('checked');
        }
        this._namaBaju.text = OUTFITS.find(o => o[0] === baju)?.[1] ?? '';
        this._tombolDesktop.get_child().get_children().at(-1).text =
            this._island.companionTampil ? 'Kembalikan ke island' : 'Lepas ke desktop';
    }

    // --- Suara Memo hidup/mati -------------------------------------------
    get bisu() {
        return GLib.file_test(`${KONFIG()}/bisu`, GLib.FileTest.EXISTS);
    }

    _togelSuara() {
        try {
            if (this.bisu) {
                GLib.unlink(`${KONFIG()}/bisu`);
            } else {
                GLib.mkdir_with_parents(KONFIG(), 0o700);
                GLib.file_set_contents(`${KONFIG()}/bisu`, '1');
            }
        } catch (e) {
            console.error(`[dynamic-island] bisu: ${e}`);
        }
        this._segarkanSuara();
    }

    _segarkanSuara() {
        this._ikonSuara.icon_name = this.bisu ? 'notifications-disabled-symbolic' : 'preferences-system-notifications-symbolic';
    }

    destroy() {
        for (const b of this._ikatan ?? [])
            b.unbind();
        this._ikatan = [];
        this._wajah.gerak.destroy();
        this._wajah.wajah.destroy();
        this.actor.destroy();
    }
}
