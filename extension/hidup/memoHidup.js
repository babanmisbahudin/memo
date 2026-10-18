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
import { bolehDi, petaDari } from './dunia.js';
import { angkat, badanBaru, langkah, langkahJalan, lempar, mulaiLompat, ngintip, rute, titikDi } from './fisika.js';
import { dariJson, keJson, pikir } from './pikiran.js';

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
        // Gerak menggerakkan seluruh badan, bertumpu di kaki (pivot bawah).
        this._gerak = new Gerak(this.actor, { skalaDasar: 1, amplitudo: 1, pivotY: 1, arahPartikel: -1, blokPartikel: 3 });
        Main.uiGroup.add_child(this.actor);

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
        if (this._rusak)
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
        const sid = w.connect('position-changed', () => this._aman(() => {
            const baru = w.get_frame_rect();
            const g = this._gerakJendela.get(id) ?? { dx: 0, dy: 0 };
            this._gerakJendela.set(id, { dx: g.dx + baru.x - r.x, dy: g.dy + baru.y - r.y });
            r = baru;
            this._bangunPeta();
        }));
        this._sinyalPijakan = { id, w, sid };
    }

    _gambar() {
        const b = this._badan;
        this.actor.set_position(Math.round(b.x - UKURAN.lebar / 2), Math.round(b.y - UKURAN.tinggi));
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
        const diam = (this._badan.keadaan === 'berdiri' || this._badan.keadaan === 'ngintip') && !this._antrean.length;
        if (diam && a)
            this._sampai = true;
        return !diam;
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
            this.actor.scale_y = [0.66, 0.33, 0, 0, 0.33, 0.66, 1][a.fase - 1] ?? 1;
            if (a.fase === 4) {
                this._badan = a.tepi ? ngintip(this._badan, a.tepi)
                    : { ...badanBaru(a.ke.x, a.ke.y), keadaan: 'berdiri', pijakan: a.ke.jendelaId ?? null };
                this._tempatkan();
                this._ikatPijakan();
            }
            if (a.fase >= 7) {
                this.actor.scale_y = 1;
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
        if (tujuan === undefined)
            return;
        this._antrean = [];
        if (tujuan === null)
            return;
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
        if (!this._aktif)
            return;
        if (!this._diLuar) {
            if (this._island.bolehKeluar())
                this._keluar();
            return;
        }
        const persepsi = this._persepsi();
        this._peta = petaDari(persepsi, UKURAN);
        this._perbaruiSembunyi();
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
        // "Kamu pergi" memakai aturan tidur island yang sama (bolehTidur).
        const pergi = this._island.sedangTidur;
        const b = this._badan;
        const r = pikir(this._pikiran, {
            persepsi, peta: this._peta, ukuran: UKURAN, posisi: { x: b.x, y: b.y },
            tepi: b.keadaan === 'ngintip' ? b.tepi : null, dtMs, acak: Math.random,
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
        if (n.ekspresi)
            this._face.setExpression(n.ekspresi);
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
        if (!this.actor.visible)
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
        // Terlempar keluar dari island, lalu jatuh ke lantai di bawahnya.
        this._badan = lempar(badanBaru(px, py + UKURAN.tinggi), Math.round((Math.random() - 0.5) * 30), -6);
        this._antrean = [];
        this._face.setExpression('senang');
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
        const [px, py] = this._island.posisiIsland();
        this._antrean = [{ jenis: 'pulang', dari: { x: this._badan.x, y: this._badan.y }, ke: { x: px, y: py }, fase: 0 }];
        this._badan = { ...this._badan, keadaan: 'diangkat', pijakan: undefined, tepi: null };
        this.actor.scale_y = 1;
        this._tempatkan();
        this._pastikanLangkah();
    }

    _masukIsland() {
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
            this._antrean = [];
            this.actor.scale_y = 1;
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
        this._face.setExpression('senang');
        this._pergiKe({ jenis: 'titik', x: terbaik.x, y: terbaik.y, jendelaId: terbaik.jendelaId });
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
            GLib.file_set_contents(BERKAS(), JSON.stringify({ aktif: this._aktif, ...keJson(this._pikiran, Date.now()) }));
        } catch (e) {
            console.error(`[dynamic-island] simpan hidup: ${e}`);
        }
    }

    destroy() {
        this.simpan();
        for (const id of [this._detikId, this._tatapId, this._klikId, this._simpanId]) {
            if (id)
                GLib.source_remove(id);
        }
        this._berhentiLangkah();
        for (const [obj, id] of this._sinyal)
            obj.disconnect(id);
        this._sinyal = [];
        if (this._sinyalPijakan)
            this._sinyalPijakan.w.disconnect(this._sinyalPijakan.sid);
        this._sinyalPijakan = null;
        this._grab?.dismiss();
        this._gerak.destroy();
        this._face.destroy();
        this.actor.destroy();
    }
}
