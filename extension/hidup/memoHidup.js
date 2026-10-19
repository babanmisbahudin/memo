// Memo hidup di desktop: badan Mochi — island hitam bulat bermata LED — yang
// keluar dari island, melompat di atas jendela, mengintip, dan memilih
// kegiatannya sendiri (docs/superpowers/specs/2026-10-18-memo-hidup-design.md).
//
// Berkas ini hanya penyambung ke GNOME Shell: membaca jendela & kursor,
// menggerakkan aktor, menempatkannya di tumpukan jendela, dan menerima
// sentuhan. Otaknya murni dan diuji di luar GNOME: dunia.js (peta),
// fisika.js (badan), pikiran.js (kebutuhan, sifat, kegiatan).
//
// Semua berjalan di proses gnome-shell (yang juga compositor): tiap langkah
// dibungkus _aman(), dan tiga galat beruntun memulangkan Memo serta
// mematikan jalan-jalan untuk sesi ini.

import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { RobotFace } from '../robotFace.js';
import { Gerak } from '../gerak.js';
import { FPS_PIKSEL } from '../gerakPola.js';
import { P, bingkai, pikselMakam, rencanaPerawatan, rencanakan } from './atraksi.js';
import { LINGKAR_KURSOR, bolehDi, petaDari } from './dunia.js';
import { RUPA_BARIS, RUPA_KOLOM } from './rupa.js';
import { KOTORAN_L, KOTORAN_T, MAKANAN_L, MAKANAN_T, TELUR_L, TELUR_T, gambarKotoran, gambarMakanan, gambarNoda,
    gambarPiksel, gambarRupa, gambarTelur } from './gambarMemo.js';
import { angkat, badanBaru, langkah, langkahJalan, lempar, mulaiLompat, ngintip, rute, titikDi } from './fisika.js';
import { dariJson, keJson, pikir } from './pikiran.js';
import {
    WARNA_BADAN, beriMakan, bersihkan, cebok, dariJson as hayatDariJson, hayatBaru, keJson as hayatKeJson, majukanHayat,
    mandikan, obati, tahapPada, telurBaru, tetaskan, ubahIdentitas,
} from './hayat.js';

export const UKURAN = { lebar: 120, tinggi: 72 };
const SKALA_WAJAH = 2.6;
const MS_LANGKAH = Math.round(1000 / FPS_PIKSEL);
const SIMPAN_TIAP_S = 300;
const KLIK_GANDA_MS = 400;
const AMBANG_SERET = 6;
const BERKAS = () => `${GLib.get_user_config_dir()}/memo/hidup.json`;

function bacaKonfig() {
    try {
        const [ok, isi] = GLib.file_get_contents(BERKAS());
        if (ok) {
            const d = JSON.parse(new TextDecoder().decode(isi));
            if (d && typeof d === 'object')
                return d;
        }
    } catch (e) { /* belum pernah disimpan */ }
    return {};
}

export class MemoHidup {
    constructor(island) {
        this._island = island;
        const cfg = bacaKonfig();
        this._aktif = cfg.aktif === true;
        this._pikiran = dariJson(cfg, Date.now());
        this._badan = badanBaru(0, 0);
        this._peta = null;
        this._antrean = [];
        this._gerakJendela = new Map();
        this._diLuar = false;
        this._sembunyi = false;
        this._rusak = false;
        this._galat = 0;
        this._detik = 0;
        this._pergiLalu = false;
        this._dielus = false;
        this._sampai = false;
        this._pulangTertunda = false;
        this._seret = null;
        this._grab = null;
        this._klikId = 0;
        this._langkahId = 0;
        this._simpanId = 0;
        this._sinyal = [];
        this._sinyalPijakan = null;
        this._rectPijakan = null;
        this._dihancurkan = false;
        this._sisa = null;          // properti atraksi yang masih beranimasi sesudah badan dilepas
        this._tertunda = undefined; // tujuan yang datang selagi atraksi berjalan
        this._pikselProp = [];
        this._bolehMain = true;     // uji mematikannya supaya kegiatan bisa diramal
        // Hayat (hayat.js): config kosong = pemasangan baru -> telur + wizard
        // nama; config lama tanpa hayat = Memo dewasa.
        const baru = Object.keys(cfg).length === 0;
        this._hayat = baru ? hayatBaru({}, Date.now()) : hayatDariJson(cfg, Date.now());
        // Memo lama (sebelum ada hayat) juga sekali diminta kenalan: nama,
        // jenis kelamin, rupa — tanpa jadi telur.
        this._perluNama = baru || cfg.perluNama === true || !cfg.hayat;
        this._monoLalu = GLib.get_monotonic_time();
        this._kotoranAktor = [];
        this._tanda = { lapar: false, kotor: false };
        this._u = 1;
        this._fraseTelur = 0;

        this._face = new RobotFace();
        // Sentuhan ditangani badan; RobotFace sendiri menelan klik.
        this._face.actor.reactive = false;
        this._face.actor.x_align = Clutter.ActorAlign.CENTER;
        this._face.actor.y_align = Clutter.ActorAlign.CENTER;
        this._face.actor.set_pivot_point(0.5, 0.5);
        this._face.actor.set_scale(SKALA_WAJAH, SKALA_WAJAH);
        this._face.setBlinkingEnabled(true);
        this.actor = new St.Widget({
            style_class: 'memo-hidup', reactive: true, visible: false,
            width: UKURAN.lebar, height: UKURAN.tinggi,
            layout_manager: new Clutter.BinLayout(),
        });
        this.actor.add_child(this._face.actor);
        // Telur: digambar sendiri, menggantikan wajah sampai menetas.
        this._telur = new St.DrawingArea({ width: TELUR_L, height: TELUR_T, visible: false, reactive: false,
            x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.END });
        this._telur.connect('repaint', () => this._gambarTelur());
        this.actor.add_child(this._telur);
        // Noda & lalat saat Memo kotor (belum dimandikan).
        this._noda = new St.DrawingArea({ width: UKURAN.lebar, height: UKURAN.tinggi, reactive: false, visible: false });
        this._noda.connect('repaint', () => this._gambarNoda());
        this.actor.add_child(this._noda);
        // Rupa per tahap & jenis kelamin (topi/pita, empeng, headphone, alis,
        // janggut/kacamata, tongkat), boleh menjulur di luar badan.
        this._rupa = new St.DrawingArea({ reactive: false, x_align: Clutter.ActorAlign.START, y_align: Clutter.ActorAlign.START,
            width: (RUPA_KOLOM[1] - RUPA_KOLOM[0] + 1) * P, height: (RUPA_BARIS[1] - RUPA_BARIS[0] + 1) * P });
        // Posisi tetap: BinLayout memberinya ukuran asli, tidak dipotong selebar badan.
        this._rupa.set_position(RUPA_KOLOM[0] * P, RUPA_BARIS[0] * P);
        this._rupa.connect('repaint', () => this._gambarRupa());
        this.actor.add_child(this._rupa);
        // Saat GNOME Shell dimatikan, aktor bisa dihancurkan tanpa disable():
        // hentikan semua timer supaya tidak menyentuh aktor yang sudah hilang.
        this.actor.connect('destroy', () => {
            this._dihancurkan = true;
            this._hentikanTimer();
        });
        // Gerak menggerakkan seluruh badan, bertumpu di kaki (pivot bawah).
        this._gerak = new Gerak(this.actor, { skalaDasar: 1, amplitudo: 1, pivotY: 1, arahPartikel: -1, blokPartikel: 3 });
        this._terapkanAvatar();
        Main.uiGroup.add_child(this.actor);
        // Properti atraksi (tali ayunan, lengan, parasut, mobil): satu kanvas
        // tepat di atas badan, digambar ulang tiap langkah.
        this._properti = new St.DrawingArea({ reactive: false, visible: false });
        this._properti.connect('repaint', () => this._gambarProperti());
        Main.uiGroup.add_child(this._properti);
        // Bayangan piksel di lantai di bawah Memo: mengecil makin tinggi Memo.
        this._bayangan = new St.DrawingArea({ reactive: false, visible: false, width: 96, height: 9 });
        this._bayangan.connect('repaint', () => this._gambarBayangan());
        Main.uiGroup.add_child(this._bayangan);
        this._ekspresiKini = null;
        this._efekTerakhir = 0;
        this._makam = null;
        this._makamData = cfg.makam && cfg.makam.sampaiMs > Date.now() ? cfg.makam : null;

        this.actor.connect('button-press-event', (_a, ev) => this._aman(() => this._tekan(ev)) ?? Clutter.EVENT_STOP);
        this.actor.connect('motion-event', (_a, ev) => this._aman(() => this._seretKe(ev)) ?? Clutter.EVENT_STOP);
        this.actor.connect('button-release-event', () => this._aman(() => this._lepas()) ?? Clutter.EVENT_STOP);

        const segarkan = () => {
            this._aman(() => this._bangunPeta());
        };
        const sambung = (obj, nama) => this._sinyal.push([obj, obj.connect(nama, segarkan)]);
        sambung(global.display, 'restacked');
        sambung(global.display, 'notify::focus-window');
        sambung(global.display, 'grab-op-end');
        for (const nama of ['size-change', 'map', 'destroy', 'minimize', 'unminimize'])
            sambung(global.window_manager, nama);
        sambung(global.workspace_manager, 'active-workspace-changed');
        sambung(Main.overview, 'showing');
        sambung(Main.overview, 'hidden');

        this._detikId = GLib.timeout_add_seconds(GLib.PRIORITY_LOW, 1, () => {
            this._aman(() => this._tiapDetik());
            return GLib.SOURCE_CONTINUE;
        });
        this._tatapId = GLib.timeout_add(GLib.PRIORITY_LOW, 200, () => {
            this._aman(() => this._tatap());
            return GLib.SOURCE_CONTINUE;
        });
    }

    // --- Keselamatan ------------------------------------------------------

    // Galat tidak boleh merusak desktop: dicatat, dan sesudah tiga galat
    // beruntun Memo pulang dan jalan-jalan mati untuk sesi ini.
    _aman(fn) {
        if (this._rusak || this._dihancurkan)
            return undefined;
        try {
            const hasil = fn();
            this._galat = 0;
            return hasil;
        } catch (e) {
            console.error(`[dynamic-island] hidup: ${e}\n${e.stack ?? ''}`);
            if (++this._galat >= 3) {
                this._rusak = true;
                this._berhentiLangkah();
                this.actor.hide();
                this._diLuar = false;
                this._island.memoKembali();
            }
            return undefined;
        }
    }

    // --- Persepsi & peta --------------------------------------------------

    _jendela() {
        const ws = global.workspace_manager.get_active_workspace();
        const daftar = ws.list_windows().filter(w => !w.minimized && !w.skip_taskbar &&
            w.get_window_type() === Meta.WindowType.NORMAL && w.is_on_primary_monitor());
        return global.display.sort_windows_by_stacking(daftar);
    }

    _persepsi() {
        const fokus = global.display.focus_window;
        const kerja = Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.primaryIndex);
        const [x, y] = global.get_pointer();
        return {
            areaKerja: { x: kerja.x, y: kerja.y, lebar: kerja.width, tinggi: kerja.height },
            jendela: this._jendela().map(w => {
                const r = w.get_frame_rect();
                return {
                    id: w.get_id(), x: r.x, y: r.y, lebar: r.width, tinggi: r.height, aktif: w === fokus,
                    maksimal: w.is_maximized(), layarPenuh: w.is_fullscreen(),
                    aplikasi: w.get_wm_class() ?? '', judul: w.get_title() ?? '',
                };
            }),
            kursor: { x, y },
            jam: GLib.DateTime.new_now_local().get_hour(),
        };
    }

    _bangunPeta() {
        this._peta = petaDari(this._persepsi(), UKURAN);
        this._perbaruiSembunyi();
        if (this._diLuar) {
            this._tempatkan();
            // Lantai bisa berubah/hilang: biarkan fisika memeriksanya.
            this._pastikanLangkah();
        }
    }

    _perbaruiSembunyi() {
        this._sembunyi = Main.overview.visible || Main.sessionMode.isLocked || !!this._peta?.sembunyi;
        this.actor.visible = this._diLuar && !this._sembunyi;
        this._properti.visible = this.actor.visible && this._pikselProp.length > 0;
        for (const k of this._kotoranAktor)
            k.visible = this._aktif && !this._sembunyi;
        if (this._makam)
            this._makam.visible = this._aktif && !this._sembunyi;
        this._segarkanBayangan();
    }

    _aktorJendela(id) {
        return this._jendela().find(w => w.get_id() === id)?.get_compositor_private() ?? null;
    }

    // Di atas jendela pijakannya (jendela yang lebih atas bisa menutupinya),
    // di belakang jendela yang diintip, selebihnya di lapisan paling atas.
    _tempatkan() {
        const b = this._badan;
        let acuan = null, diBelakang = false;
        if (b.keadaan === 'berdiri' && b.pijakan !== null && b.pijakan !== undefined) {
            acuan = this._aktorJendela(b.pijakan);
        } else if (b.keadaan === 'ngintip' && b.tepi?.jenis === 'jendela') {
            acuan = this._aktorJendela(b.pijakan);
            diBelakang = true;
        }
        const induk = acuan?.get_parent() ?? Main.uiGroup;
        if (this.actor.get_parent() !== induk) {
            this.actor.get_parent()?.remove_child(this.actor);
            induk.add_child(this.actor);
        }
        if (!acuan)
            induk.set_child_above_sibling(this.actor, null);
        else if (diBelakang)
            induk.set_child_below_sibling(this.actor, acuan);
        else
            induk.set_child_above_sibling(this.actor, acuan);
        if (this._properti.get_parent() !== induk) {
            this._properti.get_parent()?.remove_child(this._properti);
            induk.add_child(this._properti);
        }
        induk.set_child_above_sibling(this._properti, this.actor);
    }

    // Jendela pijakan digeser pengguna -> catat geserannya untuk fisika.
    _ikatPijakan() {
        const id = this._badan.pijakan ?? null;
        if (this._sinyalPijakan?.id === id)
            return;
        if (this._sinyalPijakan) {
            this._sinyalPijakan.w.disconnect(this._sinyalPijakan.sid);
            this._sinyalPijakan = null;
        }
        const w = id === null ? null : this._jendela().find(x => x.get_id() === id);
        if (!w)
            return;
        let r = w.get_frame_rect();
        this._rectPijakan = { id, x: r.x, y: r.y };
        const sid = w.connect('position-changed', () => this._aman(() => {
            const baru = w.get_frame_rect();
            const g = this._gerakJendela.get(id) ?? { dx: 0, dy: 0 };
            this._gerakJendela.set(id, { dx: g.dx + baru.x - r.x, dy: g.dy + baru.y - r.y });
            r = baru;
            this._rectPijakan = { id, x: baru.x, y: baru.y };
            this._bangunPeta();
        }));
        this._sinyalPijakan = { id, w, sid };
    }

    _catatGeserPijakan(persepsi) {
        const id = this._badan.pijakan ?? null;
        const w = id === null ? null : persepsi.jendela.find(x => x.id === id);
        const lalu = this._rectPijakan;
        this._rectPijakan = w ? { id, x: w.x, y: w.y } : null;
        if (!w || lalu?.id !== id || (lalu.x === w.x && lalu.y === w.y) || this._gerakJendela.has(id))
            return;
        this._gerakJendela.set(id, { dx: w.x - lalu.x, dy: w.y - lalu.y });
    }

    _gambar() {
        const b = this._badan;
        this.actor.set_position(Math.round(b.x - UKURAN.lebar / 2), Math.round(b.y - UKURAN.tinggi));
        this._segarkanBayangan();
    }

    // --- Langkah fisika 12x/dtk, hanya selama ada yang bergerak ------------

    _pastikanLangkah() {
        if (this._langkahId || !this._diLuar)
            return;
        this._langkahId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, MS_LANGKAH, () => {
            if (this._aman(() => this._langkah()))
                return GLib.SOURCE_CONTINUE;
            this._langkahId = 0;
            return GLib.SOURCE_REMOVE;
        });
    }

    _berhentiLangkah() {
        if (this._langkahId) {
            GLib.source_remove(this._langkahId);
            this._langkahId = 0;
        }
    }

    // Satu langkah. Mengembalikan true selama masih ada yang bergerak.
    _langkah() {
        if (!this._peta)
            this._bangunPeta();
        const a = this._antrean[0];
        if (a?.jenis === 'atraksi')
            return this._langkahAtraksi(a);
        // Atraksi diputus (diseret, pulang, sembunyi): rapikan badan & properti.
        if (this._badan.keadaan === 'atraksi' || (this._pikselProp.length && !this._sisa))
            this._akhiriAtraksi();
        if (this._sisa)
            this._langkahSisa();
        if (a?.jenis === 'selinap' || a?.jenis === 'pulang')
            return this._langkahKhusus(a);
        const gerakJendela = this._gerakJendela;
        this._gerakJendela = new Map();
        const pijakanLama = this._badan.pijakan;
        const { badan, kejadian } = langkah(this._badan, this._peta, { ukuran: UKURAN, gerakJendela });
        this._badan = badan;
        for (const e of kejadian) {
            if (e === 'mendarat') {
                this._gerak.main('tepuk');
            } else if (e === 'mendaratKeras') {
                this._gerak.main('pusing');
                this._gerak.partikel('bintang', 3);
            } else if (e === 'jatuh') {
                this._gerak.main('kaget');
            }
        }
        if (this._badan.keadaan === 'berdiri' && a)
            this._jalankanAntrean(a);
        if (this._badan.pijakan !== pijakanLama || kejadian.length) {
            this._tempatkan();
            this._ikatPijakan();
        }
        this._gambar();
        // Tujuan yang ditahan selama atraksi dijalankan begitu Memo mendarat.
        if (this._tertunda !== undefined && this._badan.keadaan === 'berdiri' && !this._antrean.length) {
            const t = this._tertunda;
            this._tertunda = undefined;
            this._pergiKe(t);
        }
        const diam = (this._badan.keadaan === 'berdiri' || this._badan.keadaan === 'ngintip') && !this._antrean.length;
        if (diam && a)
            this._sampai = true;
        return !diam || !!this._sisa;
    }

    // --- Atraksi (atraksi.js) ---------------------------------------------

    _langkahAtraksi(a) {
        // Kursor mendekat: Memo kaget dan melepas atraksinya (jatuh ke lantai).
        if (a.f > 0 && this._badan.keadaan === 'atraksi' && !['wafat', 'bintang'].includes(a.rencana.nama)) {
            const [kx, ky] = global.get_pointer();
            const { x, y } = this._badan;
            const dx = Math.max(x - UKURAN.lebar / 2 - kx, 0, kx - (x + UKURAN.lebar / 2));
            const dy = Math.max(y - UKURAN.tinggi - ky, 0, ky - y);
            if (Math.hypot(dx, dy) < LINGKAR_KURSOR) {
                this._antrean.shift();
                this._akhiriAtraksi();
                this._gerak.main('kaget');
                return true;
            }
        }
        const b = bingkai(a.rencana, a.f++);
        if (a.f === 1) {
            this._gerak.kunci();
            this._ekspresi('senang');
        }
        if (b.badan) {
            this._badan = { ...this._badan, x: b.badan.x, y: b.badan.y, keadaan: 'atraksi', pijakan: undefined, tepi: null };
            this.actor.rotation_angle_z = b.badan.rz;
            this.actor.scale_x = this._u;
            this.actor.scale_y = b.badan.sy * this._u;
            this.actor.opacity = b.badan.opacity ?? 255;
            this._gambar();
        }
        if (b.mata)
            this._face.setGaze(b.mata[0], b.mata[1]);
        if (b.ekspresi)
            this._ekspresi(b.ekspresi);
        this._pasangProperti(b.piksel);
        if (b.lepas || b.selesai || a.f > 2000) {
            this._antrean.shift();
            if (a.rencana.nama === 'wafat')
                this._pasangMakam(a.rencana.asal.x, a.rencana.asal.y);
            if (a.rencana.nama === 'bintang' || a.rencana.nama === 'wafat')
                this._jadiTelur();
            this._sisa = b.selesai ? null : a;
            this._lepasBadan(b.lepas ?? { vx: 0, vy: 0 });
            if (b.selesai)
                this._pasangProperti([]);
        }
        return true;
    }

    // Properti yang masih beranimasi sesudah badan dilepas (tali naik,
    // parasut kempis, mobil jadi asap) — berjalan bersama fisika.
    _langkahSisa() {
        const b = bingkai(this._sisa.rencana, this._sisa.f++);
        this._pasangProperti(b.selesai ? [] : b.piksel);
        if (b.selesai || this._sisa.f > 2000)
            this._sisa = null;
    }

    _lepasBadan({ vx, vy }) {
        this.actor.opacity = 255;
        this.actor.rotation_angle_z = 0;
        this.actor.scale_y = this._u;
        this._gerak.lepas();
        this._badan = lempar({ ...this._badan, keadaan: 'jatuh' }, vx, vy);
        this._tempatkan();
    }

    // Atraksi berhenti di tengah jalan (bukan oleh atraksi.js sendiri).
    _akhiriAtraksi() {
        this._sisa = null;
        this._pasangProperti([]);
        if (this._badan.keadaan === 'atraksi')
            this._lepasBadan({ vx: 0, vy: 0 });
        else {
            this.actor.rotation_angle_z = 0;
            this._gerak.lepas();
        }
    }

    _pasangProperti(piksel) {
        this._pikselProp = piksel;
        if (!piksel.length) {
            this._properti.visible = false;
            return;
        }
        const xs = piksel.map(p => p[0]), ys = piksel.map(p => p[1]);
        const gx = Math.min(...xs), gy = Math.min(...ys);
        this._asalProp = [gx, gy];
        this._properti.set_position(gx * P, gy * P);
        this._properti.set_size((Math.max(...xs) - gx + 1) * P, (Math.max(...ys) - gy + 1) * P);
        this._properti.visible = this.actor.visible;
        this._tempatkan();
        this._properti.queue_repaint();
    }

    _gambarProperti() {
        const cr = this._properti.get_context();
        try {
            const [gx, gy] = this._asalProp ?? [0, 0];
            for (const [x, y, [r, g, b]] of this._pikselProp) {
                cr.setSourceRGB(r / 255, g / 255, b / 255);
                cr.rectangle((x - gx) * P, (y - gy) * P, P, P);
                cr.fill();
            }
        } finally {
            cr.$dispose();
        }
    }

    _jalankanAntrean(a) {
        const b = this._badan;
        if (a.jenis === 'jalan') {
            if (b.x === a.ke.x)
                this._antrean.shift();
            else
                this._badan = mulaiLompat(b, langkahJalan(b, a.ke.x)) ?? b;
        } else if (a.jenis === 'lompat') {
            this._antrean.shift();
            const lompat = mulaiLompat(b, a.ke);
            if (lompat)
                this._badan = lompat;
            else
                this._antrean.unshift({ jenis: 'selinap', ke: a.ke, fase: 0 });
        }
    }

    // Menyelinap: tenggelam di tempat, muncul di tujuan (tanpa rute; juga cara
    // masuk ke tepi ngintip). Pulang: busur ke island lalu masuk.
    _langkahKhusus(a) {
        a.fase++;
        if (a.jenis === 'selinap') {
            this.actor.scale_y = ([0.66, 0.33, 0, 0, 0.33, 0.66, 1][a.fase - 1] ?? 1) * this._u;
            if (a.fase === 4) {
                this._badan = a.tepi ? ngintip(this._badan, a.tepi)
                    : { ...badanBaru(a.ke.x, a.ke.y), keadaan: 'berdiri', pijakan: a.ke.jendelaId ?? null };
                this._tempatkan();
                this._ikatPijakan();
            }
            if (a.fase >= 7) {
                this.actor.scale_y = this._u;
                this._antrean.shift();
                if (!this._antrean.length)
                    this._sampai = true;
            }
        } else {
            const s = Math.min(1, a.fase / 8);
            this._badan = {
                ...this._badan,
                x: Math.round(a.dari.x + (a.ke.x - a.dari.x) * s),
                y: Math.round(a.dari.y + (a.ke.y - a.dari.y) * s - 320 * s * (1 - s)),
            };
            if (s >= 1) {
                this._antrean = [];
                this._masukIsland();
                return false;
            }
        }
        this._gambar();
        return this._antrean.length > 0 || this._badan.keadaan !== 'berdiri';
    }

    _pergiKe(tujuan) {
        // Penerbangan pulang tidak boleh dibatalkan niat baru dari pikiran.
        if (tujuan === undefined || this._antrean[0]?.jenis === 'pulang')
            return;
        // Atraksi tidak diputus pikiran: tujuan barunya menunggu sampai
        // Memo mendarat.
        if (this._antrean[0]?.jenis === 'atraksi' || this._badan.keadaan === 'atraksi') {
            this._tertunda = tujuan;
            return;
        }
        this._antrean = [];
        if (tujuan === null)
            return;
        if (tujuan.jenis === 'atraksi') {
            const b = this._badan;
            if (b.keadaan === 'diangkat' || (tujuan.nama === 'mobil' && (b.keadaan !== 'berdiri' || b.x !== tujuan.dari || b.y !== tujuan.y)))
                return;
            this._antrean = [{ jenis: 'atraksi', rencana: { ...tujuan, asal: { x: b.x, y: b.y } }, f: 0 }];
            this._pastikanLangkah();
            return;
        }
        if (tujuan.jenis === 'tepi') {
            this._antrean = [{ jenis: 'selinap', ke: tujuan, tepi: tujuan.tepi, fase: 0 }];
        } else {
            const r = this._badan.keadaan === 'berdiri' ? rute(this._badan, tujuan, this._peta, UKURAN.lebar) : null;
            this._antrean = r ?? [{ jenis: 'selinap', ke: tujuan, fase: 0 }];
        }
        if (!this._antrean.length)
            this._sampai = true;
        this._pastikanLangkah();
    }

    // --- Pikiran 1x/dtk ---------------------------------------------------

    _tiapDetik() {
        this._detik++;
        // Hayat hanya berjalan selama jalan-jalan nyala & kamu login: waktu
        // monotonic tidak menghitung suspend, dan dijepit 5 dtk.
        const kini = GLib.get_monotonic_time();
        const dt = Math.min(5000, Math.max(0, (kini - this._monoLalu) / 1000));
        this._monoLalu = kini;
        if (!this._aktif)
            return;
        this._majukanHayat(dt);
        if (this._detik % 60 === 0 && this._makamData && this._makamData.sampaiMs <= Date.now()) {
            this._makamData = null;
            this._buatMakam();
            this.simpan();
        }
        if (this._makamData && !this._makam)
            this._buatMakam();
        // Pengaman: Memo yang sudah meninggal (animasi bintang terputus, atau
        // dimuat dari hidup.json) selalu berlanjut ke telur baru.
        if (this._hayat.mati && !this._wafatId && !['bintang', 'wafat'].includes(this._antrean[0]?.rencana?.nama)) {
            this._wafatId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 4000, () => {
                this._wafatId = 0;
                this._aman(() => this._hayat.mati && this._jadiTelur());
                return GLib.SOURCE_REMOVE;
            });
        }
        if (!this._diLuar) {
            if (this._island.bolehKeluar())
                this._keluar();
            return;
        }
        if (this._antrean[0]?.jenis === 'pulang')
            return;
        const persepsi = this._persepsi();
        this._peta = petaDari(persepsi, UKURAN);
        this._perbaruiSembunyi();
        // Cadangan bila sinyal jendela terlewat: geseran jendela pijakan
        // dicatat, dan fisika memeriksa ulang pijakan sekali per detik.
        this._catatGeserPijakan(persepsi);
        this._pastikanLangkah();
        // Activities / layar terkunci: berhenti berpikir sampai kembali.
        if (this._sembunyi && !this._peta.sembunyi)
            return;
        this._pikir(persepsi, 1000);
        if (this._gerak.tidur && this._detik % 3 === 0)
            this._gerak.partikel('z', 1);
        if (this._detik % SIMPAN_TIAP_S === 0)
            this.simpan();
    }

    _pikir(persepsi, dtMs) {
        if (this._hayat.lahirMs === null || this._hayat.mati)
            return;
        // "Kamu pergi" memakai aturan tidur island yang sama (bolehTidur).
        const pergi = this._island.sedangTidur;
        const b = this._badan;
        const r = pikir(this._pikiran, {
            persepsi, peta: this._peta, ukuran: UKURAN, posisi: { x: b.x, y: b.y },
            tepi: b.keadaan === 'ngintip' ? b.tepi : null, dtMs, acak: Math.random, berdiri: b.keadaan === 'berdiri', main: this._bolehMain,
            tubuh: { tahap: this._hayat.tahap, sakit: this._hayat.sakit },
            pergi, kembali: this._pergiLalu && !pergi, dielus: this._dielus, sampai: this._sampai,
        });
        this._pergiLalu = pergi;
        this._dielus = false;
        this._sampai = false;
        this._pikiran = r.keadaan;
        if (r.niat)
            this._jalankanNiat(r.niat);
    }

    _jalankanNiat(n) {
        if (n.kegiatan === 'sembunyi') {
            this._antrean = [];
            return;
        }
        if (this._antrean[0]?.jenis === 'atraksi') {
            this._pergiKe(n.tujuan);
            return;
        }
        if (n.ekspresi)
            this._ekspresi(this._hayat.sakit ? 'sakit' : n.ekspresi);
        if (n.kegiatan === 'tidur')
            this._gerak.tidurkan();
        else if (this._gerak.tidur)
            this._gerak.bangunkan();
        if (n.emote)
            this._gerak.main(n.emote);
        if (n.ikon)
            this._gerak.partikel(n.ikon, 1);
        this._pergiKe(n.tujuan);
    }

    _tatap() {
        if (this._noda.visible && this._hayat.kotor >= 0.85)
            this._noda.queue_repaint();
        if (!this.actor.visible || this._antrean[0]?.jenis === 'atraksi')
            return;
        const [px, py] = global.get_pointer();
        const b = this._badan;
        this._face.setGaze((px - b.x) / 500, (py - (b.y - UKURAN.tinggi / 2)) / 350);
    }

    // --- Keluar & pulang --------------------------------------------------

    _keluar() {
        const [px, py] = this._island.posisiIsland();
        this._diLuar = true;
        this._island.memoKeluar();
        this._bangunPeta();
        this._pastikanKotoran();
        // Terlempar keluar dari island, lalu jatuh ke lantai di bawahnya.
        this._badan = lempar(badanBaru(px, py + UKURAN.tinggi), Math.round((Math.random() - 0.5) * 30), -6);
        this._antrean = [];
        this._ekspresi('senang');
        this._tempatkan();
        this._gambar();
        this._perbaruiSembunyi();
        this._pastikanLangkah();
    }

    // Pulang ke island (izin, kabar, panel dibuka, tombol Pulang). Selagi
    // diseret, ditunda sampai dilepas.
    pulang() {
        if (!this._diLuar || this._antrean[0]?.jenis === 'pulang')
            return;
        if (this._badan.keadaan === 'diangkat') {
            this._pulangTertunda = true;
            return;
        }
        if (!this.actor.visible) {
            this._berhentiLangkah();
            this._masukIsland();
            return;
        }
        if (this._antrean[0]?.jenis === 'atraksi' || this._badan.keadaan === 'atraksi')
            this._akhiriAtraksi();
        this._tertunda = undefined;
        const [px, py] = this._island.posisiIsland();
        this._antrean = [{ jenis: 'pulang', dari: { x: this._badan.x, y: this._badan.y }, ke: { x: px, y: py }, fase: 0 }];
        this._badan = { ...this._badan, keadaan: 'diangkat', pijakan: undefined, tepi: null };
        this.actor.scale_y = this._u;
        this._tempatkan();
        this._pastikanLangkah();
    }

    _masukIsland() {
        if (this._badan.keadaan === 'atraksi' || this._pikselProp.length)
            this._akhiriAtraksi();
        this._antrean = this._antrean.filter(a => a.jenis !== 'atraksi');
        this._tertunda = undefined;
        this._diLuar = false;
        this.actor.hide();
        if (this._gerak.tidur)
            this._gerak.bangunkan();
        this._island.memoKembali();
        this.simpan();
    }

    // --- Sentuhan ---------------------------------------------------------

    _tekan(ev) {
        if (ev.get_button() !== 1)
            return Clutter.EVENT_PROPAGATE;
        const [x, y] = ev.get_coords();
        this._seret = { x0: x, y0: y, dx: x - this._badan.x, dy: y - this._badan.y,
            jejak: [[GLib.get_monotonic_time(), x, y]], aktif: false };
        this._grab = global.stage.grab(this.actor);
        return Clutter.EVENT_STOP;
    }

    _seretKe(ev) {
        const s = this._seret;
        if (!s)
            return Clutter.EVENT_PROPAGATE;
        const [x, y] = ev.get_coords();
        const kini = GLib.get_monotonic_time();
        s.jejak = [...s.jejak.filter(([t]) => kini - t < 100000), [kini, x, y]];
        if (!s.aktif && Math.hypot(x - s.x0, y - s.y0) > AMBANG_SERET) {
            s.aktif = true;
            if (this._antrean[0]?.jenis === 'pulang')
                this._pulangTertunda = true;
            this._antrean = [];
            this._tertunda = undefined;
            this._akhiriAtraksi();
            this.actor.scale_y = this._u;
            this._gerak.main('kaget');
        }
        if (s.aktif) {
            this._badan = angkat(this._badan, x - s.dx, y - s.dy);
            this._tempatkan();
            this._gambar();
        }
        return Clutter.EVENT_STOP;
    }

    _lepas() {
        const s = this._seret;
        this._seret = null;
        this._grab?.dismiss();
        this._grab = null;
        if (!s)
            return Clutter.EVENT_PROPAGATE;
        if (s.aktif) {
            // Kecepatan dari gerak kursor ±100 ms terakhir, dalam piksel per langkah.
            const [t0, x0, y0] = s.jejak[0];
            const [t1, x1, y1] = s.jejak.at(-1);
            const langkahLewat = Math.max(1, (t1 - t0) / 1000 / MS_LANGKAH);
            const jepit = v => Math.max(-60, Math.min(60, Math.round(v)));
            this._badan = lempar(this._badan, jepit((x1 - x0) / langkahLewat), jepit((y1 - y0) / langkahLewat));
            this._pastikanLangkah();
            if (this._pulangTertunda) {
                this._pulangTertunda = false;
                this.pulang();
            }
            return Clutter.EVENT_STOP;
        }
        // Klik: tunggu sebentar untuk membedakannya dari klik dua kali.
        if (this._klikId) {
            GLib.source_remove(this._klikId);
            this._klikId = 0;
            this._island.bukaMenu();
        } else {
            this._klikId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, KLIK_GANDA_MS, () => {
                this._klikId = 0;
                this._aman(() => this._elus());
                return GLib.SOURCE_REMOVE;
            });
        }
        return Clutter.EVENT_STOP;
    }

    _elus() {
        if (this._hayat.lahirMs === null && !this._hayat.mati) {
            // Telur: belum bernama -> panel (wizard); sudah -> menetas.
            if (this._perluNama)
                this._island.bukaMenu();
            else
                this._tetaskan();
            return;
        }
        this._dielus = true;
        this._pikir(this._persepsi(), 0);
    }

    // --- Untuk island & panel ---------------------------------------------

    get aktif() {
        return this._aktif;
    }

    get diLuar() {
        return this._diLuar;
    }

    get sifat() {
        return { ...this._pikiran.sifat };
    }

    get kegiatan() {
        return this._pikiran.kegiatan;
    }

    get kebutuhan() {
        return { ...this._pikiran.kebutuhan, lapar: this._hayat.lapar, kotor: this._hayat.kotor };
    }

    // --- Hayat: untuk panel ----------------------------------------------

    get hayat() {
        const t = tahapPada(this._hayat, Date.now());
        return { ...this._hayat, tahap: t.tahap, hari: Math.floor(t.hari), perluNama: this._perluNama };
    }

    // Wizard Memo baru: beri identitas, lalu telur muncul di desktop.
    lahirkan(identitas) {
        this._hayat = ubahIdentitas(this._hayat, identitas);
        this._perluNama = false;
        this._terapkanAvatar();
        // Telur baru langsung muncul di desktop; Memo lama cukup disimpan.
        if (this._hayat.lahirMs === null) {
            if (!this._aktif)
                this.setAktif(true);
            if (!this._diLuar)
                this._keluar();
        }
        this.simpan();
    }

    ubahIdentitas(identitas) {
        this._hayat = ubahIdentitas(this._hayat, identitas);
        this._terapkanAvatar();
        this.simpan();
    }

    beriMakan(jenis) {
        const baru = beriMakan(this._hayat, jenis, Date.now());
        if (baru === this._hayat)
            return false;
        this._hayat = baru;
        if (this._hayat.lapar < 0.5)
            this._tanda.lapar = false;
        if (this.actor.visible)
            this._jatuhkanMakanan(jenis);
        else
            this._island.gerak('angguk', { kali: 2 });
        this.simpan();
        return true;
    }

    mandikan() {
        if (this._hayat.lahirMs === null || this._hayat.mati)
            return false;
        this._hayat = mandikan(this._hayat);
        this._tanda.kotor = false;
        this._segarkanNoda();
        if (!this._rawat('mandi')) {
            this._gerak.partikel('gelembung', 6);
            this._gerak.main('getar', { kali: 2 });
        }
        this.simpan();
        return true;
    }

    cebok() {
        if (this._hayat.lahirMs === null || this._hayat.mati)
            return false;
        this._hayat = cebok(this._hayat);
        if (!this._rawat('cebok'))
            this._gerak.main('tepuk');
        this.simpan();
        return true;
    }

    // Disuruh tidur: kasur, bantal, selimut ±1 menit, energi pulih.
    suruhTidur() {
        if (this._hayat.lahirMs === null || this._hayat.mati)
            return false;
        this._pikiran = { ...this._pikiran, kegiatan: 'tidur', sisaMs: 65000 };
        if (!this._rawat('tidur', { lamaTidur: 720 })) {
            this._ekspresi('tidur');
            this._gerak.tidurkan();
        }
        return true;
    }

    // Animasi perawatan di tempat Memo berdiri; false bila Memo tidak tampak
    // berdiri (di island, melayang, sembunyi) -> pemanggil memakai cadangan.
    _rawat(nama, opsi = {}) {
        const b = this._badan;
        if (!this.actor.visible || b.keadaan !== 'berdiri' || this._antrean[0]?.jenis === 'pulang')
            return false;
        if (this._antrean[0]?.jenis === 'atraksi' || this._badan.keadaan === 'atraksi')
            this._akhiriAtraksi();
        this._tertunda = undefined;
        this._antrean = [{ jenis: 'atraksi', rencana: rencanaPerawatan(nama, b, opsi), f: 0 }];
        this._pastikanLangkah();
        return true;
    }

    obati() {
        if (!this._hayat.sakit)
            return false;
        this._hayat = obati(this._hayat);
        this._gerak.partikel('obat', 1);
        this._gerak.main('bangun');
        this._ekspresi('senang');
        this._kabar(`${this._hayat.nama} sudah minum obat`, 'emblem-ok-symbolic');
        this.simpan();
        return true;
    }

    // --- Ekspresi dengan efek -------------------------------------------

    // Ganti ekspresi; bila berubah & Memo tampak, partikel kecil ikut
    // (senang hati, kaget "!", bingung "?", sakit keringat, galat "x").
    _ekspresi(nama) {
        this._face.setExpression(nama);
        if (nama === this._ekspresiKini)
            return;
        this._ekspresiKini = nama;
        const efek = { senang: 'hati', mendengar: 'seru', bingung: 'tanya', sakit: 'keringat', error: 'tidak' }[nama];
        const kini = GLib.get_monotonic_time();
        if (efek && this.actor.visible && kini - this._efekTerakhir > 2.5e6) {
            this._efekTerakhir = kini;
            this._gerak.partikel(efek, nama === 'senang' ? 2 : 1);
        }
    }

    // --- Bayangan -------------------------------------------------------

    // Lantai di bawah kaki Memo (y terdekat di bawahnya), atau null.
    _lantaiBawah() {
        const b = this._badan;
        const A = this._peta?.areaKerja;
        if (!A)
            return null;
        let y = A.y + A.tinggi;
        for (const L of this._peta.lantai) {
            if (b.x >= L.x1 && b.x <= L.x2 && L.y >= b.y - 1 && L.y < y)
                y = L.y;
        }
        return y;
    }

    _segarkanBayangan() {
        const b = this._badan;
        const lantai = this._lantaiBawah();
        const tampak = this.actor.visible && lantai !== null && b.keadaan !== 'ngintip' && !this._hayat.mati &&
            this.actor.opacity > 0 && this.actor.scale_y > 0.05;
        this._bayangan.visible = tampak;
        if (!tampak)
            return;
        const tinggi = Math.max(0, lantai - b.y);
        // Melangkah per 3 px: lebar 90% badan di lantai, mengecil saat terbang.
        const k = Math.max(0.3, 1 - tinggi / 400);
        const lebar = Math.max(6, Math.round(UKURAN.lebar * 0.8 * k * this._u / 3) * 3);
        if (lebar !== this._lebarBayangan) {
            this._lebarBayangan = lebar;
            this._bayangan.queue_repaint();
        }
        this._bayangan.set_position(Math.round(b.x - 48), lantai - 5);
        const induk = this.actor.get_parent();
        if (this._bayangan.get_parent() !== induk) {
            this._bayangan.get_parent()?.remove_child(this._bayangan);
            induk?.add_child(this._bayangan);
        }
        induk?.set_child_below_sibling(this._bayangan, this.actor);
    }

    _gambarBayangan() {
        const cr = this._bayangan.get_context();
        try {
            // Elips piksel 3 baris, gaya dither: tengah pekat, tepi jarang.
            const l = this._lebarBayangan ?? 90;
            cr.setSourceRGBA(0, 0, 0, 0.32);
            for (const [y, f] of [[0, 0.7], [3, 1], [6, 0.7]]) {
                const w = Math.round(l * f / 3) * 3;
                cr.rectangle(48 - w / 2, y, w, 3);
            }
            cr.fill();
        } finally {
            cr.$dispose();
        }
    }

    // --- Makam: kenangan di lantai selama 3 hari -------------------------

    _pasangMakam(x, y) {
        const h = this._hayat;
        const terakhir = h.album.at(-1) ?? {};
        this._makamData = { x: Math.round(x), y: Math.round(y), nama: h.nama, umur: terakhir.umurHari ?? 0,
            sebab: terakhir.sebab ?? h.sebab, sampaiMs: Date.now() + 3 * 86400000 };
        this._buatMakam();
    }

    _buatMakam() {
        this._makam?.destroy();
        this._makam = null;
        const m = this._makamData;
        if (!m)
            return;
        const piksel = pikselMakam(m.nama);
        const xs = piksel.map(p => p[0]), ys = piksel.map(p => p[1]);
        const gx = Math.min(...xs), gy = Math.min(...ys);
        const a = new St.DrawingArea({ reactive: true, visible: this._aktif && !this._sembunyi,
            width: (Math.max(...xs) - gx + 1) * P, height: (Math.max(...ys) - gy + 1) * P });
        a.connect('repaint', () => {
            const cr = a.get_context();
            try {
                gambarPiksel(cr, piksel.map(([x, py, w]) => [x - gx, py - gy, w]));
            } finally {
                cr.$dispose();
            }
        });
        a.connect('button-press-event', () => {
            this._aman(() => this._kabar(`${m.nama} · ${m.umur} hari · ${m.sebab === 'tua' ? 'tenang di surga' : 'tidak dirawat'}`,
                'starred-symbolic'));
            return Clutter.EVENT_STOP;
        });
        Main.uiGroup.add_child(a);
        a.set_position(m.x + gx * P, m.y + gy * P);
        this._makam = a;
    }

    // --- Hayat: berjalan & kejadian ----------------------------------------

    _majukanHayat(dtMs) {
        const r = majukanHayat(this._hayat, { dtMs, sekarangMs: Date.now() });
        this._hayat = r.hayat;
        const nama = this._hayat.nama;
        for (const e of r.kejadian) {
            if (e.jenis === 'tumbuh') {
                const dariU = this._u;
                this._terapkanAvatar();
                this._tumbuhkan(dariU);
                this._kabar(`${nama} sekarang ${e.tahap}!`, 'starred-symbolic');
            } else if (e.jenis === 'pup') {
                // Gumpal pertama di samping Memo, sisanya berserakan di lantai bawah.
                for (let i = 0; i < (e.jumlah ?? 1); i++)
                    this._tambahKotoran(i > 0);
                this._kabar(`${nama} pup! bersihkan & cebok dulu`, 'user-trash-symbolic');
            } else if (e.jenis === 'sakit') {
                this._ekspresi('sakit');
                this._kabar(`${nama} sakit! beri obat di panel`, 'dialog-warning-symbolic');
            } else if (e.jenis === 'peringatan') {
                this._kabar(`${nama} makin lemah — ${e.sisaJam} jam lagi`, 'dialog-warning-symbolic');
            } else if (e.jenis === 'mati') {
                this._wafat(e.sebab);
            }
        }
        const h = this._hayat;
        if (h.lahirMs === null || h.mati) {
            if (h.lahirMs === null && this._detik % 4 === 0 && this.actor.visible)
                this._gerak.main('oleng');
        } else {
            if (h.lapar >= 0.7 && !this._tanda.lapar) {
                this._tanda.lapar = true;
                this._kabar(`${nama} lapar — beri makan di panel`, 'face-sad-symbolic');
            }
            if (h.kotor >= 0.7 && !this._tanda.kotor) {
                this._tanda.kotor = true;
                this._kabar(`${nama} bau, waktunya mandi`, 'face-sad-symbolic');
            }
            if (this.actor.visible && this._detik % 20 === 0 && h.lapar >= 0.7)
                this._gerak.partikel('lapar', 1);
            else if (this.actor.visible && this._detik % 6 === 0 && h.kotor >= 0.6)
                this._gerak.partikel('bau', 2);
            this._segarkanNoda();
        }
        if (r.kejadian.length)
            this.simpan();
    }

    _kabar(teks, ikon) {
        this._island.trigger?.(ikon, teks, 5000);
        this._island.catat?.({ jenis: 'notifikasi', judul: this._hayat.nama, isi: teks });
    }

    _terapkanAvatar() {
        const h = this._hayat;
        const telur = h.lahirMs === null && !h.mati;
        const w = WARNA_BADAN[h.avatar.warna] ?? WARNA_BADAN.hitam;
        this.actor.style = telur ? 'background-color: transparent; border: 0; box-shadow: none;'
            : `background-color: ${w.badan};`;
        this._face.actor.visible = !telur && !h.mati;
        this._telur.visible = telur;
        this._telur.queue_repaint();
        this._segarkanNoda();
        this._rupa.visible = !telur && !h.mati;
        this._rupa.queue_repaint();
        this._face.setAvatar({ mata: h.avatar.mata, warnaMata: w.mata });
        this._island._face?.setAvatar?.({ mata: h.avatar.mata });
        this._u = telur ? 1 : tahapPada(h, Date.now()).ukuran;
        this._gerak.setSkala(this._u);
        if (!this._gerak.emoteAktif)
            this.actor.scale_y = this._u;
    }

    _gambarRupa() {
        const cr = this._rupa.get_context();
        try {
            const h = this._hayat;
            gambarRupa(cr, { kelamin: h.kelamin, tahap: tahapPada(h, Date.now()).tahap, warna: h.avatar.warna },
                -RUPA_KOLOM[0] * P, -RUPA_BARIS[0] * P);
        } finally {
            cr.$dispose();
        }
    }

    // Naik tahap: badan membesar bertahap 6 langkah dengan kilau.
    _tumbuhkan(dariU) {
        const keU = this._u;
        if (this._tumbuhId)
            GLib.source_remove(this._tumbuhId);
        this._gerak.partikel('bintang', 4);
        let i = 0;
        this._tumbuhId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, MS_LANGKAH * 2, () => {
            i++;
            this._aman(() => {
                const u = Math.round((dariU + (keU - dariU) * i / 6) * 100) / 100;
                this._gerak.setSkala(u);
                if (!this._gerak.emoteAktif && !this._gerak.dikunci)
                    this.actor.scale_y = u;
                if (i === 6)
                    this._gerak.main('lompat');
            });
            if (i < 6)
                return GLib.SOURCE_CONTINUE;
            this._tumbuhId = 0;
            return GLib.SOURCE_REMOVE;
        });
    }

    // Noda tampak mulai kotor 0,3, makin banyak; lalat mulai 0,85.
    _segarkanNoda() {
        const h = this._hayat;
        const tampak = h.lahirMs !== null && !h.mati && h.kotor >= 0.3;
        const tingkat = tampak ? Math.floor(h.kotor * 10) + (h.kotor >= 0.85 ? 100 : 0) : 0;
        this._noda.visible = tampak;
        if (tingkat !== this._tingkatNoda) {
            this._tingkatNoda = tingkat;
            this._noda.queue_repaint();
        }
    }

    _gambarNoda() {
        const cr = this._noda.get_context();
        try {
            gambarNoda(cr, this._hayat.kotor, GLib.get_monotonic_time() / 1e6);
        } finally {
            cr.$dispose();
        }
    }

    // Telur piksel 18 x 22 petak (3 px), retak sesuai _fraseTelur 0..3.
    _gambarTelur() {
        const cr = this._telur.get_context();
        try {
            gambarTelur(cr, TELUR_L / 2, TELUR_T, this._hayat.avatar.warna, this._fraseTelur);
        } finally {
            cr.$dispose();
        }
    }

    _tetaskan() {
        if (this._telurId)
            return;
        this._fraseTelur = 0;
        this._telurId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 250, () => this._aman(() => {
            this._fraseTelur++;
            this._telur.queue_repaint();
            this._gerak.main('getar');
            if (this._fraseTelur < 4)
                return GLib.SOURCE_CONTINUE;
            this._telurId = 0;
            this._fraseTelur = 0;
            this._hayat = tetaskan(this._hayat, Date.now());
            this._terapkanAvatar();
            this._ekspresi('senang');
            this._gerak.main('lompat');
            this._gerak.partikel('hati', 3);
            this._kabar(`${this._hayat.nama} menetas!`, 'starred-symbolic');
            this.simpan();
            return GLib.SOURCE_REMOVE;
        }) ?? GLib.SOURCE_REMOVE);
    }

    _wafat(sebab) {
        const nama = this._hayat.nama;
        this._antrean = this._antrean.filter(a => a.jenis !== 'atraksi');
        this._ekspresi('tidur');
        this._gerak.partikel('bintang', 5);
        this._kabar(sebab === 'tua' ? `${nama} kembali ke bintang dengan tenang`
            : `${nama} kembali ke bintang karena tidak dirawat`, 'starred-symbolic');
        // Tampak: melayang ke bintang, lalu telur baru jatuh dari atas
        // (_langkahAtraksi). Tidak tampak: telur baru sebentar kemudian.
        if (this._rawat('wafat', { tujuan: sebab === 'tua' ? 'surga' : 'neraka', namaMemo: nama }))
            return;
        // Tidak tampak: makam tetap dipasang di lantai bawah.
        const A = this._peta?.areaKerja;
        if (A)
            this._pasangMakam(Math.min(A.x + A.lebar - 80, Math.max(A.x + 80, this._badan.x)), A.y + A.tinggi);
        this._wafatId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 4000, () => {
            this._wafatId = 0;
            this._aman(() => this._jadiTelur());
            return GLib.SOURCE_REMOVE;
        });
    }

    // Telur baru untuk Memo berikutnya (album tetap).
    _jadiTelur() {
        this._hayat = telurBaru(this._hayat, Date.now());
        this._perluNama = true;
        for (const k of this._kotoranAktor)
            k.destroy();
        this._kotoranAktor = [];
        this._tanda = { lapar: false, kotor: false };
        this._terapkanAvatar();
        this.simpan();
    }

    // --- Kotoran & makanan di desktop -------------------------------------

    _aktorKotoran(x, y) {
        const a = new St.DrawingArea({ width: KOTORAN_L, height: KOTORAN_T, reactive: true, visible: this._aktif && !this._sembunyi });
        a.connect('repaint', () => {
            const cr = a.get_context();
            try {
                gambarKotoran(cr, KOTORAN_L / 2, KOTORAN_T);
            } finally {
                cr.$dispose();
            }
        });
        a.connect('button-press-event', () => {
            this._aman(() => this._buangKotoran(a));
            return Clutter.EVENT_STOP;
        });
        Main.uiGroup.add_child(a);
        a.set_position(Math.round(x - KOTORAN_L / 2), Math.round(y - KOTORAN_T));
        this._kotoranAktor.push(a);
        return a;
    }

    _tambahKotoran(berserakan = false) {
        const b = this._badan;
        const A = this._peta?.areaKerja;
        const diLantai = !berserakan && this._diLuar && b.keadaan === 'berdiri';
        let x = diLantai ? b.x + (Math.random() < 0.5 ? -1 : 1) * (UKURAN.lebar / 2 + 14)
            : (A ? A.x + A.lebar * (0.05 + Math.random() * 0.9) : 400);
        // Di dekat tepi layar: kotoran pindah ke sisi Memo yang lain.
        if (A && (x < A.x + 20 || x > A.x + A.lebar - 20))
            x = Math.min(A.x + A.lebar - 20, Math.max(A.x + 20, 2 * b.x - x));
        const y = diLantai ? b.y : (A ? A.y + A.tinggi : 800);
        if (this._kotoranAktor.length < 9)
            this._aktorKotoran(x, y);
    }

    // Kotoran yang tersimpan (sesudah login ulang) digambar lagi di lantai bawah.
    _pastikanKotoran() {
        while (this._kotoranAktor.length < Math.min(9, this._hayat.kotoran))
            this._tambahKotoran(this._kotoranAktor.length > 0);
    }

    _buangKotoran(a) {
        this._kotoranAktor = this._kotoranAktor.filter(x => x !== a);
        a.destroy();
        this._hayat = bersihkan(this._hayat, 1);
        if (this.actor.visible)
            this._gerak.main('angguk');
        this.simpan();
    }

    // Makanan piksel jatuh di samping Memo, Memo mengunyah.
    _jatuhkanMakanan(jenis) {
        this._makanan?.destroy();
        const a = new St.DrawingArea({ width: MAKANAN_L, height: MAKANAN_T, reactive: false });
        a.connect('repaint', () => {
            const cr = a.get_context();
            try {
                gambarMakanan(cr, 0, 0, jenis);
            } finally {
                cr.$dispose();
            }
        });
        Main.uiGroup.add_child(a);
        this._makanan = a;
        const b = this._badan;
        const x = Math.round(b.x + UKURAN.lebar / 2 - 6);
        let f = 0;
        if (this._makanId)
            GLib.source_remove(this._makanId);
        this._makanId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, Math.round(1000 / 12), () => {
            f++;
            const ok = this._aman(() => {
                a.set_position(x, Math.round(b.y - 120 + Math.min(1, f / 8) * (120 - MAKANAN_T)));
                if (f === 8) {
                    this._gerak.main('angguk', { kali: 3 });
                    this._gerak.partikel('hati', 2);
                }
                return true;
            });
            if (f < 24 && ok !== undefined)
                return GLib.SOURCE_CONTINUE;
            this._makanId = 0;
            a.destroy();
            if (this._makanan === a)
                this._makanan = null;
            return GLib.SOURCE_REMOVE;
        });
    }

    setAktif(aktif) {
        this._aktif = !!aktif;
        if (!this._aktif)
            this.pulang();
        this.simpan();
    }

    setSifat(nama, nilai) {
        if (!(nama in this._pikiran.sifat))
            return;
        this._pikiran = { ...this._pikiran, sifat: { ...this._pikiran.sifat, [nama]: Math.max(0, Math.min(1, nilai)) } };
        // Slider mengirim banyak nilai saat digeser: simpan sekali sesudahnya.
        if (this._simpanId)
            GLib.source_remove(this._simpanId);
        this._simpanId = GLib.timeout_add(GLib.PRIORITY_LOW, 1000, () => {
            this._simpanId = 0;
            this.simpan();
            return GLib.SOURCE_REMOVE;
        });
    }

    // Datang ke dekat kursor (tetap di luar lingkar kursor).
    panggilKeSini() {
        if (!this._aktif)
            this.setAktif(true);
        if (!this._diLuar)
            this._keluar();
        if (!this._peta)
            this._bangunPeta();
        const [kx, ky] = global.get_pointer();
        let terbaik = null;
        for (const L of this._peta.lantai) {
            for (const dx of [-220, 220, -320, 320]) {
                const p = titikDi(L, kx + dx, UKURAN.lebar);
                const jarak = Math.hypot(p.x - kx, p.y - ky);
                if (bolehDi(this._peta, p, UKURAN) && (!terbaik || jarak < terbaik.jarak))
                    terbaik = { ...p, jarak };
            }
        }
        if (!terbaik)
            return;
        this._pikiran = { ...this._pikiran, kegiatan: 'temani', sisaMs: 30000 };
        this._ekspresi('senang');
        this._pergiKe({ jenis: 'titik', x: terbaik.x, y: terbaik.y, jendelaId: terbaik.jendelaId });
    }

    // Mainkan satu atraksi sekarang (uji; Memo biasanya memilih sendiri). false bila tidak
    // muat di layar saat ini (jendela aktif, kursor, tidak berdiri).
    // Memo yang masih di island / sedang melayang dikeluarkan dulu, lalu
    // dicoba sekali lagi sesudah mendarat.
    mainAtraksi(nama, coba = true) {
        if (!this._aktif)
            this.setAktif(true);
        if (!this._diLuar)
            this._keluar();
        if (coba && (this._badan.keadaan !== 'berdiri' || this._antrean.length)) {
            if (this._atraksiId)
                GLib.source_remove(this._atraksiId);
            this._atraksiId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1500, () => {
                this._atraksiId = 0;
                this._aman(() => this.mainAtraksi(nama, false));
                return GLib.SOURCE_REMOVE;
            });
            return true;
        }
        if (!this._peta)
            this._bangunPeta();
        const b = this._badan;
        const r = rencanakan(nama, { peta: this._peta, ukuran: UKURAN, posisi: { x: b.x, y: b.y }, acak: Math.random,
            berdiri: b.keadaan === 'berdiri' });
        if (!r || this._antrean[0]?.jenis === 'atraksi' || this._antrean[0]?.jenis === 'pulang')
            return false;
        this._antrean = [];
        this._pikiran = { ...this._pikiran, kegiatan: 'main', sisaMs: 20000 };
        this._pergiKe(r);
        return this._antrean[0]?.jenis === 'atraksi';
    }

    // Emote dari island (agen selesai, pembayaran, dll.) ikut dimainkan.
    gerak(nama, opsi = {}) {
        if (!this.actor.visible)
            return;
        if (nama)
            this._gerak.main(nama, opsi);
        if (opsi.partikel)
            this._gerak.partikel(opsi.partikel, opsi.jumlah ?? 1);
    }

    setTint(hue, glowBoost) {
        this._face.setTint(hue, glowBoost);
    }

    simpan() {
        try {
            GLib.mkdir_with_parents(`${GLib.get_user_config_dir()}/memo`, 0o700);
            GLib.file_set_contents(BERKAS(), JSON.stringify({ aktif: this._aktif, ...keJson(this._pikiran, Date.now()),
                ...hayatKeJson(this._hayat), perluNama: this._perluNama, makam: this._makamData }));
        } catch (e) {
            console.error(`[dynamic-island] simpan hidup: ${e}`);
        }
    }

    _hentikanTimer() {
        for (const id of [this._detikId, this._tatapId, this._klikId, this._simpanId, this._atraksiId, this._telurId,
            this._wafatId, this._makanId, this._tumbuhId]) {
            if (id)
                GLib.source_remove(id);
        }
        this._detikId = this._tatapId = this._klikId = this._simpanId = this._atraksiId = this._telurId = 0;
        this._wafatId = this._makanId = this._tumbuhId = 0;
        this._berhentiLangkah();
    }

    destroy() {
        this.simpan();
        this._hentikanTimer();
        for (const [obj, id] of this._sinyal)
            obj.disconnect(id);
        this._sinyal = [];
        if (this._sinyalPijakan)
            this._sinyalPijakan.w.disconnect(this._sinyalPijakan.sid);
        this._sinyalPijakan = null;
        this._grab?.dismiss();
        this._gerak.destroy();
        this._properti.destroy();
        this._bayangan.destroy();
        this._makam?.destroy();
        for (const k of this._kotoranAktor)
            k.destroy();
        this._kotoranAktor = [];
        this._makanan?.destroy();
        this._dihancurkan = true;
        this._face.destroy();
        this.actor.destroy();
    }
}
