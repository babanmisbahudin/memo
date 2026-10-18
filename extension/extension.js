import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import Gvc from 'gi://Gvc';
import Pango from 'gi://Pango';

import { RobotFace } from './robotFace.js';
import { RobotService } from './robotService.js';
import { AgenStore, tickerSesi } from './agenStore.js';
import { MemoShortcuts } from './shortcut.js';
import { MemoHidup } from './hidup/memoHidup.js';
import { OUTFITS, PanelMemo, avatarPiksel } from './panel.js';
import { Gerak } from './gerak.js';
import { jalurRepo } from './jalur.js';
import { SambutanSistem } from './sambutanSistem.js';
import { DETIK_TIDUR, ISENG, ISENG_MAKS_S, ISENG_MIN_S, JARAK_BANGUN, bolehTidur } from './gerakPola.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

// MediaSource (pemberitahuan ganti lagu lewat MPRIS) DIBUANG, jangan
// dihidupkan lagi tanpa memahami ini:
//
// Penangan 'g-properties-changed' pada proxy MPRIS membuat gnome-shell abort
// dengan "uncatchable exception" — empat kali, dan tiap kali penggunanya
// ter-logout. Membungkusnya dengan try/catch TIDAK menolong: crash-nya
// terjadi di mesin pemanggilan GJS sebelum badan fungsi dijalankan, jadi
// tidak ada blok catch yang bisa menangkapnya.
//
// Dugaan penyebabnya: proxy dibuang dari daftar saat nama D-Bus berganti
// pemilik tanpa memutus sinyalnya lebih dulu, sehingga sinyal berikutnya
// memanggil objek yang sudah dilepas. Chrome berganti nama MPRIS tiap kali
// video dibuka, jadi pemicunya sesering itu.
//
// Kalau suatu saat mau dihidupkan lagi: putus sinyal SEBELUM melepas proxy,
// dan buktikan dengan membuka-tutup video puluhan kali di sesi sungguhan —
// bukan di sesi headless, karena uji headless gagal menangkap bug ini.

const ANIM_MS = 300;
const SHM = GLib.getenv('MEMO_SHM') || '/dev/shm';

// Menulis berkas /dev/shm untuk berkomunikasi dengan daemon Memo. Memakai
// GLib.file_set_contents, bukan `echo "..." > berkas` lewat shell — teks
// ketikan pengguna bisa memuat tanda kutip yang merusak perintah shell.
function tulisBerkas(path, isi) {
    try {
        GLib.file_set_contents(path, isi);
    } catch (e) {
        console.error(`[dynamic-island] gagal menulis ${path}: ${e}`);
    }
}

const RECHECK_MS = 250;
// Memo hidup baru keluar lagi sesudah sekian lama tanpa izin/kabar baru.
const SEPI_SEBELUM_KELUAR_MS = 20000;
const POLL_NEAR_MS = 100;
const POLL_FAR_MS = 400;
const POINTER_NEAR_Y = 220;
const HOVER_PAD = 8;

class Island {
    constructor() {
        this._queue = [];
        this._eventActive = false;
        this._covered = false;
        this._pointerNear = false;
        this._current = null;
        this._adopted = [];
        this._signals = [];
        this._holdId = null;
        this._recheckId = null;
        this._pollId = null;
        this._pollActive = false;
        this._expressionHoldId = null;
        this._service = null;
        this._hidup = null;
        this._kabarTerakhir = 0;
        this._tintHue = 120;
        this._tintGlow = 0;
        this._eventIsi = null;
        this._izinTampil = null;
        this._aktivitas = null;
        this._tidur = false;
        this._paksaNormal = null;
        this._sistemId = new Map();
        this._aktifTerakhir = Date.now();
        this._detikTidur = DETIK_TIDUR;
        this._statusLalu = new Map();
        this._izinLalu = new Set();
        this._klik = [];
        this._agenBekerja = false;
        this._detik = 0;
        this._isengBerikut = this._acakIseng();

        // Hitam pekat dan mengisi tinggi top bar, supaya menempel di tepi
        // atas layar seperti island Coucou.
        this._pill = new St.BoxLayout({
            style_class: 'dynamic-island-pill',
            y_align: Clutter.ActorAlign.FILL,
            x_align: Clutter.ActorAlign.CENTER,
            reactive: true,
        });
        this._pill.set_pivot_point(0.5, 0.5);
        // Mata robot adalah anak tetap pill: selalu terlihat, tidak pernah
        // ditukar. Yang bergantian di sebelahnya hanya isinya.
        
        
        this._face = new RobotFace();
        // Gerak tubuh ala Mochi; amplitudo kecil supaya tidak keluar top bar.
        this._gerak = new Gerak(this._face.actor, { amplitudo: 0.45, arahPartikel: 1, blokPartikel: 2 });
        
        // --- Panel Memo ala Coucou (island membesar jadi panel hitam) ---
        this.menu = new PopupMenu.PopupMenu(this._pill, 0.5, St.Side.TOP);
        this.menu.actor.add_style_class_name('memo-menu');
        Main.uiGroup.add_child(this.menu.actor);
        // Seperti PanelMenu.Button: menu yang baru ditambahkan harus
        // disembunyikan sendiri, kalau tidak ia tergambar di pojok layar.
        this.menu.actor.hide();
        this.menuManager = new PopupMenu.PopupMenuManager({ actor: this._pill });
        this.menuManager.addMenu(this.menu);

        this._agen = new AgenStore();
        this._tandaAgen = '';
        this._agen.onChange(store => this._segarkanAgen(store));

        this._panel = new PanelMemo(this);
        const wadah = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false, style_class: 'memo-panel-item' });
        wadah.add_child(this._panel.actor);
        this.menu.addMenuItem(wadah);

        // Mengetik saat panel terbuka langsung pindah ke tab Chat.
        this.menu.actor.connect('key-press-event', (_a, ev) => {
            const huruf = ev.get_key_unicode();
            const pengubah = ev.get_state() & (Clutter.ModifierType.CONTROL_MASK |
                Clutter.ModifierType.MOD1_MASK | Clutter.ModifierType.SUPER_MASK);
            if (!huruf || !/\S/.test(huruf) || pengubah || this._panel._tab === 'chat')
                return Clutter.EVENT_PROPAGATE;
            this._panel.pilihTab('chat');
            this._panel._chat.entri.clutter_text.insert_text(huruf, -1);
            return Clutter.EVENT_STOP;
        });

        this.menu.connect('open-state-changed', (_m, open) => {
            if (open) {
                // Panel dibuka dari mana pun -> Memo pulang dulu ke island.
                this._hidup?.pulang();
                // Seperti Coucou: panel naik menutupi strip island, jadi
                // baris teratas langsung tab + kontrol, bukan jam/notifikasi.
                this.menu.actor.set_style(`-boxpointer-gap: ${-Math.round(this._pill.height)}px;`);
                this._pill.add_style_class_name('memo-terbuka');
                this._panel.segarkan(this._agen);
                this._panel.pilihTab(this._agen.izin.length ? 'beranda' : this._panel._tab === 'atur' ? 'beranda' : this._panel._tab);
                this._chatId = GLib.timeout_add(GLib.PRIORITY_LOW, 1000, () => {
                    if (this._panel._tab === 'chat')
                        this._panel.segarkanChat();
                    return GLib.SOURCE_CONTINUE;
                });
            } else {
                this._pill.remove_style_class_name('memo-terbuka');
                if (this._chatId) {
                    GLib.source_remove(this._chatId);
                    this._chatId = null;
                }
            }
        });

        this.pilihWardrobe(this.wardrobeAktif(), false);
        // Memo hidup di desktop (extension/hidup/): keluar dari island untuk
        // jalan-jalan bila dinyalakan di Pengaturan.
        try {
            this._hidup = new MemoHidup(this);
            this._hidup.setTint(this._tintHue ?? 120, this._tintGlow ?? 0);
        } catch (e) {
            console.error(`[dynamic-island] memo hidup: ${e}`);
        }

        this._face.onClick = () => {
            // Coucou: tiga tepukan cepat bikin Mochi pusing.
            const kini = Date.now();
            this._klik = [...this._klik.filter(t => kini - t < 1700), kini];
            if (this._klik.length >= 3) {
                this._klik = [];
                this.gerak('pusing', { partikel: 'bintang', jumlah: 3 });
                this.setExpression('bingung', 1500);
            } else {
                this.gerak('tepuk');
            }
            this.menu.toggle();
        };
        // -----------------



        // Mode "ringkas": kotak kosong, jadi yang tersisa di pill hanya mata.
        this._dot = new St.BoxLayout({
            style_class: 'dynamic-island-dot',
            y_align: Clutter.ActorAlign.CENTER,
            visible: false,
        });

        this._normal = new St.BoxLayout({
            style_class: 'dynamic-island-normal',
            y_align: Clutter.ActorAlign.CENTER,
            visible: false,
        });
        this._event = new St.BoxLayout({
            style_class: 'dynamic-island-event',
            y_align: Clutter.ActorAlign.CENTER,
            visible: false,
        });

        this._icon = new St.Icon({
            style_class: 'dynamic-island-icon',
            icon_size: 16,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._label = new St.Label({
            style_class: 'dynamic-island-label',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        this._event.add_child(this._icon);
        this._event.add_child(this._label);
        this._event.reactive = true;
        this._event.connect('button-release-event', () => {
            this.menu.toggle();
            return Clutter.EVENT_STOP;
        });

        this._mini = new St.BoxLayout({ style_class: 'dynamic-island-mini', y_align: Clutter.ActorAlign.CENTER });

        this._pill.add_child(this._face.actor);
        this._pill.add_child(this._dot);
        this._pill.add_child(this._normal);
        this._pill.add_child(this._event);
        this._pill.add_child(this._mini);

        this._face.setBlinkingEnabled(true);

        this._adopt(Main.panel.statusArea.dateMenu);
        this._adopt(Main.panel.statusArea.quickSettings);

        Main.panel._centerBox.add_child(this._pill);
        Main.panel.add_style_class_name('dynamic-island-panel');

        this._connectWindowSignals();
        this._covered = this._computeCovered();
        this._update();
        this._agen.start();
        this._detakGerakId = GLib.timeout_add_seconds(GLib.PRIORITY_LOW, 1, () => {
            try {
                this._detakGerak();
            } catch (e) {
                console.error(`[dynamic-island] detak gerak: ${e}`);
            }
            return GLib.SOURCE_CONTINUE;
        });
        this._sapaId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1500, () => {
            this._sapaId = null;
            this.gerak('sapa', { partikel: 'bintang', jumlah: 2, diam: true });
            return GLib.SOURCE_REMOVE;
        });
    }

    // Isi kotak event menurut prioritas: kejadian sesaat (volume, notifikasi)
    // > kartu izin yang menunggu > ticker aktivitas agen.
    _isiEvent() {
        if (this._eventActive)
            return this._eventIsi;
        if (this._izinTampil)
            return this._izinTampil;
        if (this._aktivitas)
            return { iconName: 'system-run-symbolic', text: this._aktivitas };
        return null;
    }

    _renderEvent() {
        const isi = this._isiEvent();
        if (!isi)
            return;
        this._icon.icon_name = isi.iconName ?? 'dialog-information-symbolic';
        this._label.text = isi.text;
    }

    _segarkanAgen(store) {
        const izin = store.izin[0] ?? null;
        const aktif = store.sesiAktif;

        const izinBaru = store.izin.some(i => !this._izinLalu.has(i.id));
        this._izinLalu = new Set(store.izin.map(i => i.id));
        let emote = null;
        for (const s of store.sesi) {
            const lama = this._statusLalu.get(s.id);
            if (!lama || lama === s.status)
                continue;
            if (s.status === 'galat')
                emote = 'geleng';
            else if (s.status === 'selesai' && emote !== 'geleng')
                emote = 'lompat';
            else if (s.status === 'berpikir' && ['idle', 'selesai'].includes(lama) && !emote)
                emote = 'angguk';
        }
        this._statusLalu = new Map(store.sesi.map(s => [s.id, s.status]));
        this._agenBekerja = store.sesi.some(s => ['kerja', 'berpikir', 'tanya'].includes(s.status));
        if (izinBaru) {
            this._kabarTerakhir = Date.now();
            this._hidup?.pulang();
            this.gerak('kaget', { partikel: 'tanya' });
        } else if (emote === 'lompat') {
            // Coucou finished: lompat, lalu berguling, sambil menebar bintang.
            this.gerak('lompat', { partikel: 'bintang', jumlah: 5 });
            this.gerak('putar', { antre: true });
        } else if (emote === 'geleng') {
            this.gerak('geleng', { partikel: 'tidak' });
        } else if (emote) {
            this.gerak(emote);
        }
        if (aktif || izin)
            this._aktifTerakhir = Date.now();
        const tanda = JSON.stringify([store.hidup, store.izin, store.sesi.slice(0, 5).map(s => [s.status, tickerSesi(s)]),
            store.pills]);
        if (tanda === this._tandaAgen)
            return;
        this._tandaAgen = tanda;

        // Island: izin menempel sampai dijawab; aktivitas agen jadi ticker.
        this._izinTampil = izin
            ? { iconName: 'dialog-password-symbolic', text: `${izin.agen}: izin? ${izin.aksi}` }
            : null;
        this._aktivitas = aktif ? tickerSesi(aktif) : null;
        this._renderEvent();
        this._segarkanMini(store);
        this._update();
        this._panel.segarkan(store);
    }

    _segarkanMini(store) {
        this._mini.destroy_all_children();
        const WARNA = { claude: '#D97757', opencode: '#cfd6dd', gemini: '#4285F4', codex: '#10A37F', memo: '#3fb950' };
        const STATUS = { kerja: '#58a6ff', berpikir: '#58a6ff', tanya: '#f0b429', butuh_izin: '#f0b429', selesai: '#3fb950', galat: '#f85149' };
        for (const sesi of store.sesi.slice(0, 4))
            this._mini.add_child(avatarPiksel(WARNA[sesi.agen] ?? '#9aa4b2', STATUS[sesi.status] ?? null, 1));
        this._mini.visible = this._mini.get_n_children() > 0 && this._current !== this._dot;
    }

    jawabIzin(keputusan) {
        const izin = this._agen?.izin[0];
        if (!izin) {
            this.trigger('dialog-information-symbolic', 'Tidak ada izin menunggu', 2000);
            return;
        }
        if (!this._agen.jawab(izin.id, keputusan))
            return;
        if (keputusan === 'deny')
            this.gerak('geleng', { partikel: 'tidak' });
        else
            this.gerak('angguk', { partikel: 'ok', jumlah: keputusan === 'always' ? 2 : 1 });
        const kata = { allow: 'Diizinkan', deny: 'Ditolak', always: 'Selalu diizinkan' }[keputusan];
        this.trigger(keputusan === 'deny' ? 'action-unavailable-symbolic' : 'emblem-ok-symbolic',
            `${kata}: ${izin.aksi}`, 2000);
        if (this._agen.izin.length <= 1)
            this.menu.close();
    }

    wardrobeAktif() {
        try {
            const [ok, c] = GLib.file_get_contents(GLib.get_user_config_dir() + '/memo/wardrobe.json');
            if (ok) {
                const d = JSON.parse(new TextDecoder().decode(c));
                if (typeof d?.outfit === 'string')
                    return d.outfit;
            }
        } catch (e) { /* bawaan */ }
        return 'musiman';
    }

    pilihWardrobe(pilihan, simpan = true) {
        if (simpan) {
            try {
                GLib.mkdir_with_parents(GLib.get_user_config_dir() + '/memo', 0o700);
                tulisBerkas(GLib.get_user_config_dir() + '/memo/wardrobe.json', JSON.stringify({ outfit: pilihan }));
            } catch (e) {
                console.error(`[dynamic-island] simpan wardrobe: ${e}`);
            }
        }
        const MUSIMAN = { 1: 'emas', 2: 'sakura', 6: 'laut', 7: 'laut', 8: 'laut', 9: 'senja', 10: 'senja', 11: 'senja', 12: 'natal' };
        const id = pilihan === 'musiman' ? MUSIMAN[new Date().getMonth() + 1] ?? 'klasik' : pilihan;
        const o = OUTFITS.find(x => x[0] === id) ?? OUTFITS[1];
        this.setTint(o[2] === null ? 120 : o[2], o[3]);
    }

    get hidup() {
        return this._hidup;
    }

    // --- Untuk Memo hidup (extension/hidup/memoHidup.js) ---------------------
    // Boleh keluar: tidak ada izin/kabar yang tampil, panel tertutup, dan
    // sepi sejak kabar terakhir.
    bolehKeluar() {
        return !this._izinTampil && !this._eventActive && !this.menu.isOpen &&
            Date.now() - this._kabarTerakhir >= SEPI_SEBELUM_KELUAR_MS;
    }

    // Titik tengah bawah pill: tempat Memo keluar dan pulang.
    posisiIsland() {
        const [x, y] = this._pill.get_transformed_position();
        return [Math.round(x + this._pill.width / 2), Math.round(y + this._pill.height)];
    }

    // Selagi Memo di desktop, mata di island redup (Memo sedang keluar).
    memoKeluar() {
        this._face.actor.opacity = 70;
    }

    memoKembali() {
        this._face.actor.opacity = 255;
        this.gerak('sapa', { diam: true });
    }

    get sedangTidur() {
        return this._tidur;
    }

    // Notifikasi (termasuk kabar LebihTeratur) memanggil Memo pulang.
    kabarDatang() {
        this._kabarTerakhir = Date.now();
        this._hidup?.pulang();
    }

    mulaiDemo() {
        this._agen.mulaiDemo();
    }

    // Menu sistem bawaan (kalender & notifikasi, Pengaturan Cepat) dari
    // panel Memo. Island dipaksa menampilkan jam & ikon aslinya — yang
    // tersembunyi saat jendela dimaksimalkan — supaya menunya punya tempat
    // menempel, lalu dibuka setelah panel Memo tertutup dan island melebar.
    _bukaMenuSistem(nama) {
        const tombol = Main.panel.statusArea[nama];
        if (!tombol?.menu)
            return;
        if (!this._sistemId.has(nama)) {
            this._sistemId.set(nama, [tombol.menu, tombol.menu.connect('open-state-changed', (_m, buka) => {
                if (!buka && this._paksaNormal === nama) {
                    this._paksaNormal = null;
                    this._update();
                }
            })]);
        }
        this.menu.close();
        this._paksaNormal = nama;
        this._update();
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, ANIM_MS + 40, () => {
            tombol.menu.open();
            return GLib.SOURCE_REMOVE;
        });
    }

    // Jalur skrip di bin/ repo Memo.
    jalurBin(nama) {
        return jalurRepo('bin', nama);
    }

    bukaKalender() {
        this._bukaMenuSistem('dateMenu');
    }

    bukaPengaturanCepat() {
        this._bukaMenuSistem('quickSettings');
    }

    _adopt(indicator) {
        const container = indicator?.container;
        if (!container)
            return;
        const parent = container.get_parent();
        if (!parent)
            return;
        const index = parent.get_children().indexOf(container);
        this._adopted.push({ container, parent, index });
        parent.remove_child(container);
        this._normal.add_child(container);
    }

    _restoreAdopted() {
        for (const { container, parent, index } of this._adopted.reverse()) {
            container.get_parent()?.remove_child(container);
            parent.insert_child_at_index(container, index);
        }
        this._adopted = [];
    }

    _connectWindowSignals() {
        const add = (obj, signal) => this._signals.push([obj, obj.connect(signal, () => this._scheduleRecheck())]);
        add(global.display, 'notify::focus-window');
        add(global.window_manager, 'size-change');
        add(global.window_manager, 'map');
        add(global.window_manager, 'destroy');
        add(global.window_manager, 'minimize');
        add(global.window_manager, 'unminimize');
        add(global.workspace_manager, 'active-workspace-changed');
        add(Main.overview, 'showing');
        add(Main.overview, 'hidden');
    }

    // "Sedang dipakai" = ada jendela yang fokus, bukan sekadar yang maximize.
    // Pemicu maximize saja terlalu sempit: jendela biasa dan jendela setengah
    // layar tidak pernah memicunya, jadi pill-nya nyaris tidak pernah mengecil.
    _isWindowInUse(w) {
        return w && !w.minimized && !w.skip_taskbar && w.is_on_primary_monitor();
    }

    setService(service) {
        this._service = service;
    }

    bukaMenu() {
        if (this.menu && !this.menu.isOpen)
            this.menu.open();
    }

    setExpression(name, durationMs = 0) {
        if (this._tidur && name !== 'tidur') {
            this._tidur = false;
            this._aktifTerakhir = Date.now();
            this._gerak.bangunkan();
        }
        if (!this._face.setExpression(name))
            return;

        this._panel?.sync(name);

        if (this._expressionHoldId) {
            GLib.source_remove(this._expressionHoldId);
            this._expressionHoldId = null;
        }

        this._service?.notifyExpressionChanged(name);

        if (durationMs > 0) {
            this._expressionHoldId = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT, durationMs, () => {
                    this._expressionHoldId = null;
                    this.setExpression('netral');
                    return GLib.SOURCE_REMOVE;
                });
        }
    }

    // Satu emote untuk island DAN Memo di desktop, supaya keduanya sama.
    // opsi: kali, antre, partikel (nama sprite), jumlah, diam (gerak iseng:
    // tidak dihitung sebagai aktivitas, jadi tidak menunda tidur).
    gerak(nama, opsi = {}) {
        if (!opsi.diam) {
            this._aktifTerakhir = Date.now();
            if (this._tidur)
                this.setExpression('netral');
        }
        if (nama)
            this._gerak.main(nama, opsi);
        if (opsi.partikel)
            this._gerak.partikel(opsi.partikel, opsi.jumlah ?? 1);
        this._hidup?.gerak(nama, opsi);
        this._panel?.gerak(nama, opsi);
    }

    _acakIseng() {
        return ISENG_MIN_S + Math.floor(Math.random() * (ISENG_MAKS_S - ISENG_MIN_S + 1));
    }

    // Gerak berulang, satu detak per detik: z saat tidur, gemetar saat izin
    // menunggu, oleng saat agen bekerja, dan sesekali gerak iseng saat diam.
    _detakGerak() {
        this._detik++;
        if (this._gerak.emoteAktif)
            return;
        if (this._tidur) {
            if (this._detik % 3 === 0)
                this.gerak(null, { partikel: 'z', diam: true });
        } else if (this._izinTampil) {
            if (this._detik % 6 === 0)
                this.gerak('getar', { partikel: 'tanya', diam: true });
        } else if (this._agenBekerja) {
            if (this._detik % 8 === 0)
                this.gerak('oleng', { diam: true });
        } else if (--this._isengBerikut <= 0) {
            this._isengBerikut = this._acakIseng();
            this.gerak(ISENG[Math.floor(Math.random() * ISENG.length)], { diam: true });
        }
    }

    _tidurkan() {
        this._tidur = true;
        this.setExpression('tidur');
        this._gerak.tidurkan();
    }

    _cekTidur(pointerX, pointerY) {
        const titik = [this._pill];
        if (this._hidup?.actor.visible)
            titik.push(this._hidup.actor);
        let jarak = Infinity;
        for (const a of titik) {
            const [x, y] = a.get_transformed_position();
            jarak = Math.min(jarak, Math.hypot(pointerX - (x + a.width / 2), pointerY - (y + a.height / 2)));
        }
        if (jarak <= JARAK_BANGUN) {
            this._aktifTerakhir = Date.now();
            if (this._tidur)
                this.setExpression('netral');
            return;
        }
        if (!this._tidur && bolehTidur({
            diamMs: Date.now() - this._aktifTerakhir,
            jarakKursor: jarak,
            adaIzin: !!this._izinTampil,
            adaAktivitas: !!this._aktivitas || this._eventActive,
            ekspresi: this.expression,
        }, this._detikTidur))
            this._tidurkan();
    }

    // Kabar dari LebihTeratur ikut menggerakkan Memo: pembayaran = lompat.
    reaksiNotifikasi(aplikasi, judul) {
        if (!/lebihteratur/i.test(aplikasi ?? ''))
            return;
        if (/bayar|pembayaran|payment|lunas/i.test(judul ?? ''))
            this.gerak('dansa', { partikel: 'koin', jumlah: 4 });
        else if (/chat|pesan/i.test(judul ?? ''))
            this.gerak('kaget', { partikel: 'pesan' });
        else
            this.gerak('sapa', { partikel: 'bintang', jumlah: 2 });
    }

    resetExpression() {
        this.setExpression('netral');
    }

    setTint(hue, glowBoost = 0) {
        const h = hue < 0 ? null : hue;
        this._tintHue = h;
        this._tintGlow = glowBoost;
        this._face.setTint(h, glowBoost);
        this._hidup?.setTint(h, glowBoost);
        this._panel?.setTint(h, glowBoost);
    }

    get expression() {
        return this._face.expression;
    }

    _computeCovered() {
        if (Main.overview.visible)
            return false;

        if (this._isWindowInUse(global.display.focus_window))
            return true;

        const workspace = global.workspace_manager.get_active_workspace();
        return workspace.list_windows().some(w =>
            this._isWindowInUse(w) && (w.fullscreen || w.is_maximized()));
    }

    _scheduleRecheck() {
        if (this._recheckId)
            GLib.source_remove(this._recheckId);
        this._recheckId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, RECHECK_MS, () => {
            this._recheckId = null;
            this._covered = this._computeCovered();
            this._update();
            return GLib.SOURCE_REMOVE;
        });
    }

    trigger(iconName, text, holdMs = 3500) {
        this._aktifTerakhir = Date.now();
        this._queue.push({ iconName, text, holdMs });
        if (!this._eventActive)
            this._nextEvent();
    }

    _nextEvent() {
        if (this._queue.length === 0) {
            this._eventActive = false;
            this._renderEvent();
            this._update();
            return;
        }

        const { iconName, text, holdMs } = this._queue.shift();
        this._eventActive = true;
        this._eventIsi = { iconName, text };
        this._renderEvent();
        this._update();

        if (this._holdId)
            GLib.source_remove(this._holdId);
        this._holdId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, holdMs, () => {
            this._holdId = null;
            this._nextEvent();
            return GLib.SOURCE_REMOVE;
        });
    }

    _resolveTarget() {
        if (this._paksaNormal)
            return this._normal;
        if (this._eventActive || this._izinTampil)
            return this._event;
        if (!this._covered || this._pointerNear)
            return this._aktivitas ? this._event : this._normal;
        return this._dot;
    }

    _update() {
        this._show(this._resolveTarget());
        this._syncPolling();
    }

    // Clutter does not tween size changes caused by swapping children, so both
    // ends are measured first and the pill is tweened between them by hand.
    _show(box) {
        if (this._current === box)
            return;

        const first = this._current === null;
        const fromWidth = this._pill.width;
        const fromHeight = this._pill.height;

        if (this._current)
            this._current.visible = false;
        this._current = box;
        box.visible = true;
        this._mini.visible = box !== this._dot && this._mini.get_n_children() > 0;

        this._pill.set_width(-1);
        this._pill.set_height(-1);
        if (first)
            return;

        const [, toWidth] = this._pill.get_preferred_width(-1);
        const [, toHeight] = this._pill.get_preferred_height(-1);

        box.opacity = 0;
        box.ease({
            opacity: 255,
            duration: ANIM_MS,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });

        this._pill.set_width(fromWidth);
        this._pill.set_height(fromHeight);
        this._pill.ease({
            width: toWidth,
            height: toHeight,
            duration: ANIM_MS,
            mode: Clutter.AnimationMode.EASE_OUT_EXPO,
            onComplete: () => {
                this._pill.set_width(-1);
                this._pill.set_height(-1);
            },
        });

        this._pill.set_scale(0.94, 0.94);
        this._pill.ease({
            scale_x: 1,
            scale_y: 1,
            duration: ANIM_MS,
            mode: Clutter.AnimationMode.EASE_OUT_BACK,
        });
    }

    // Mata selalu terlihat sekarang, jadi pelacakan kursor juga selalu jalan.
    // Ongkosnya ditekan lewat laju adaptif di _pollTick: 100ms saat kursor di
    // dekat atas layar, 400ms saat jauh.
    _syncPolling() {
        const want = true;
        if (want === this._pollActive)
            return;
        this._pollActive = want;
        if (want) {
            this._pollTick();
        } else {
            if (this._pollId) {
                GLib.source_remove(this._pollId);
                this._pollId = null;
            }
            this._pointerNear = false;
        }
    }

    _pollTick() {
        const [pointerX, pointerY] = global.get_pointer();
        const [pillX, pillY] = this._pill.get_transformed_position();
        const near =
            pointerX >= pillX - HOVER_PAD &&
            pointerX <= pillX + this._pill.width + HOVER_PAD &&
            pointerY >= pillY - HOVER_PAD &&
            pointerY <= pillY + this._pill.height + HOVER_PAD;

        if (near !== this._pointerNear) {
            this._pointerNear = near;
            this._update();
        }

        this._aimEyes(pointerX, pointerY);
        this._cekTidur(pointerX, pointerY);

        if (!this._pollActive)
            return;

        const delay = pointerY < POINTER_NEAR_Y ? POLL_NEAR_MS : POLL_FAR_MS;
        this._pollId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
            this._pollId = null;
            this._pollTick();
            return GLib.SOURCE_REMOVE;
        });
    }

    _aimEyes(pointerX, pointerY) {
        const [faceX, faceY] = this._face.actor.get_transformed_position();
        const centerX = faceX + this._face.actor.width / 2;
        const centerY = faceY + this._face.actor.height / 2;
        this._face.setGaze((pointerX - centerX) / 500, (pointerY - centerY) / 350);
    }

    
        destroy() {
        if (this._chatId) {
            GLib.source_remove(this._chatId);
            this._chatId = null;
        }
        this._agen?.stop();
        this._agen = null;
        for (const id of [this._detakGerakId, this._sapaId]) {
            if (id)
                GLib.source_remove(id);
        }
        this._detakGerakId = this._sapaId = null;
        for (const [menu, id] of this._sistemId.values())
            menu.disconnect(id);
        this._sistemId.clear();
        this._panel?.destroy();
        this._panel = null;
        if (this.menu) {
            this.menu.destroy();
            this.menuManager.removeMenu(this.menu);
        }

        this._pollActive = false;
        for (const id of [this._holdId, this._recheckId, this._pollId,
                          this._expressionHoldId]) {
            if (id)
                GLib.source_remove(id);
        }
        this._holdId = this._recheckId = this._pollId = null;
        this._expressionHoldId = null;

        for (const [obj, id] of this._signals)
            obj.disconnect(id);
        this._signals = [];

        Main.panel.remove_style_class_name('dynamic-island-panel');
        this._restoreAdopted();
        this._hidup?.destroy();
        this._hidup = null;
        this._gerak.destroy();
        this._face.destroy();
        this._pill.destroy();
    }
}

class NotificationSource {
    constructor(island) {
        this._island = island;
        this._sourceIds = new Map();
        this._addedId = Main.messageTray.connect(
            'source-added', (tray, source) => this._watchSource(source));
        Main.messageTray.getSources().forEach(s => this._watchSource(s));
    }

    _watchSource(source) {
        if (this._sourceIds.has(source))
            return;
        const notifId = source.connect(
            'notification-added', (src, notification) => this._onNotification(src, notification));
        const destroyId = source.connect('destroy', () => this._sourceIds.delete(source));
        this._sourceIds.set(source, [notifId, destroyId]);
    }

    _onNotification(source, notification) {
        try {
            if (notification.urgency !== MessageTray.Urgency.CRITICAL)
                notification.acknowledged = true;
            const title = notification.title || source.title || 'Notifikasi';
            this._island.trigger('preferences-system-notifications-symbolic', title, 3500);
            this._island.reaksiNotifikasi(source.title, title);
            this._island.kabarDatang();
        } catch (e) {
            console.error(`[dynamic-island] notification handler error: ${e}`);
        }
    }

    destroy() {
        Main.messageTray.disconnect(this._addedId);
        for (const [source, [notifId, destroyId]] of this._sourceIds) {
            source.disconnect(notifId);
            source.disconnect(destroyId);
        }
        this._sourceIds.clear();
    }
}

class BatterySource {
    constructor(island) {
        this._island = island;
        this._lastCharging = null;
        this._lastLow = false;

        Gio.DBusProxy.new(
            Gio.DBus.system, Gio.DBusProxyFlags.NONE, null,
            'org.freedesktop.UPower', '/org/freedesktop/UPower/devices/DisplayDevice',
            'org.freedesktop.UPower.Device', null,
            (source, res) => {
                try {
                    this._proxy = Gio.DBusProxy.new_finish(res);
                    this._proxy.connect('g-properties-changed', () => {
                        try {
                            this._check();
                        } catch (e) {
                            console.error(`[dynamic-island] upower properties: ${e}`);
                        }
                    });
                    this._check(true);
                } catch (e) {
                    console.error(`[dynamic-island] upower proxy failed: ${e}`);
                }
            });
    }

    _check(silent = false) {
        try {
            const percentage = this._proxy.get_cached_property('Percentage')?.deep_unpack();
            const state = this._proxy.get_cached_property('State')?.deep_unpack();
            if (percentage === undefined || state === undefined)
                return;

            const charging = state === 1;
            if (!silent && this._lastCharging !== null && charging !== this._lastCharging) {
                this._island.trigger(
                    charging ? 'battery-charging-symbolic' : 'battery-good-symbolic',
                    charging
                        ? `Mengisi daya · ${Math.round(percentage)}%`
                        : `Charger dicabut · ${Math.round(percentage)}%`,
                    3500);
                this._island.gerak(charging ? 'lompat' : 'kedip');
            }

            const low = percentage <= 20 && !charging;
            if (!silent && low && !this._lastLow) {
                this._island.trigger('battery-low-symbolic', `Baterai lemah · ${Math.round(percentage)}%`, 4000);
                this._island.gerak('getar', { partikel: 'seru' });
            }

            this._lastLow = low;
            this._lastCharging = charging;
        } catch (e) {
            console.error(`[dynamic-island] battery check failed: ${e}`);
        }
    }

    destroy() {}
}

class VolumeSource {
    constructor(island) {
        this._island = island;
        this._lastVolume = null;
        this._stream = null;
        this._streamVolumeId = null;
        this._streamMutedId = null;

        this._control = new Gvc.MixerControl({ name: 'Dynamic Island' });
        this._control.connect('default-sink-changed', (c, id) => this._onSinkChanged(id));
        this._control.connect('state-changed', () => {
            if (this._control.get_state() === Gvc.MixerControlState.READY) {
                const sink = this._control.get_default_sink();
                if (sink)
                    this._onSinkChanged(sink.get_id());
            }
        });
        this._control.open();
    }

    _onSinkChanged(id) {
        try {
            const stream = this._control.lookup_stream_id(id);
            if (!stream)
                return;
            if (this._stream) {
                this._stream.disconnect(this._streamVolumeId);
                this._stream.disconnect(this._streamMutedId);
            }
            this._stream = stream;
            this._streamVolumeId = stream.connect('notify::volume', () => this._check());
            this._streamMutedId = stream.connect('notify::is-muted', () => this._check());
            this._check(true);
        } catch (e) {
            console.error(`[dynamic-island] volume sink change failed: ${e}`);
        }
    }

    _check(silent = false) {
        if (!this._stream)
            return;
        const max = this._control.get_vol_max_norm();
        const pct = Math.round((this._stream.volume / max) * 100);
        if (!silent && this._lastVolume !== null && pct !== this._lastVolume) {
            const muted = this._stream.is_muted;
            this._island.trigger(
                muted ? 'audio-volume-muted-symbolic' : 'audio-volume-high-symbolic',
                muted ? 'Suara dimatikan' : `Volume ${pct}%`,
                2000);
        }
        this._lastVolume = pct;
    }

    destroy() {
        if (this._stream) {
            this._stream.disconnect(this._streamVolumeId);
            this._stream.disconnect(this._streamMutedId);
            this._stream = null;
        }
        this._control.close();
    }
}

class WifiSource {
    constructor(island) {
        this._island = island;
        this._lastState = null;

        Gio.DBusProxy.new(
            Gio.DBus.system, Gio.DBusProxyFlags.NONE, null,
            'org.freedesktop.NetworkManager', '/org/freedesktop/NetworkManager',
            'org.freedesktop.NetworkManager', null,
            (source, res) => {
                try {
                    this._proxy = Gio.DBusProxy.new_finish(res);
                    this._proxy.connect('g-properties-changed', (p, changed) => {
                        try {
                            const dict = changed?.deep_unpack?.();
                            if (dict && typeof dict === 'object' && 'State' in dict)
                                this._check(dict['State']);
                        } catch (e) {
                            console.error(`[dynamic-island] nm properties: ${e}`);
                        }
                    });
                    const state = this._proxy.get_cached_property('State')?.deep_unpack();
                    if (state !== undefined)
                        this._lastState = state;
                } catch (e) {
                    console.error(`[dynamic-island] networkmanager proxy failed: ${e}`);
                }
            });
    }

    _check(state) {
        if (this._lastState === state)
            return;
        const wasConnected = this._lastState !== null && this._lastState >= 60;
        const isConnected = state >= 60;
        if (this._lastState !== null && wasConnected !== isConnected) {
            this._island.trigger(
                isConnected ? 'network-wireless-symbolic' : 'network-wireless-offline-symbolic',
                isConnected ? 'Terhubung ke jaringan' : 'Koneksi terputus',
                3000);
        }
        this._lastState = state;
    }

    destroy() {}
}

// Memantau sinyal logind dan SessionManager supaya wajah robot berubah saat
// pengguna mulai mematikan/restart/logout — susah param perubahan mode sistem.
class SessionWatcher {
    constructor(island) {
        this._island = island;
        this._systemSubId = null;
        this._sessionSubId = null;

        try {
            this._systemSubId = Gio.DBus.system.signal_subscribe(
                'org.freedesktop.login1',
                'org.freedesktop.login1.Manager',
                'PrepareForShutdownWithMetadata',
                '/org/freedesktop/login1',
                null,
                Gio.DBusSignalFlags.NONE,
                (_conn, _sender, _path, _iface, _signal, params) => {
                    try {
                        const [start, metadata] = params.deep_unpack();
                        if (!start)
                            return;
                        const type = metadata?.type;
                        if (type === 'reboot' || type === 'soft-reboot')
                            this._island.setExpression('restart');
                        else
                            this._island.setExpression('shutdown');
                    } catch (e) {
                        console.error(`[dynamic-island] logind signal: ${e}`);
                    }
                });
        } catch (e) {
            console.error(`[dynamic-island] logind subscribe failed: ${e}`);
        }

        try {
            this._sessionSubId = Gio.DBus.session.signal_subscribe(
                'org.gnome.SessionManager',
                'org.freedesktop.DBus.Properties',
                'PropertiesChanged',
                '/org/gnome/SessionManager',
                'org.gnome.SessionManager',
                Gio.DBusSignalFlags.NONE,
                (_conn, _sender, _path, _iface, _signal, params) => {
                    try {
                        const [, changed] = params.deep_unpack();
                        if (changed?.SessionIsActive === false)
                            this._island.setExpression('logout');
                    } catch (e) {
                        console.error(`[dynamic-island] session signal: ${e}`);
                    }
                });
        } catch (e) {
            console.error(`[dynamic-island] session subscribe failed: ${e}`);
        }
    }

    destroy() {
        if (this._systemSubId !== null) {
            Gio.DBus.system.signal_unsubscribe(this._systemSubId);
            this._systemSubId = null;
        }
        if (this._sessionSubId !== null) {
            Gio.DBus.session.signal_unsubscribe(this._sessionSubId);
            this._sessionSubId = null;
        }
    }
}

export default class DynamicIslandExtension extends Extension {
    enable() {
        this._island = new Island();
        this._service = new RobotService(this._island);
        this._island.setService(this._service);
        this._sources = [];

        const trySource = (Cls) => {
            try {
                this._sources.push(new Cls(this._island));
            } catch (e) {
                console.error(`[dynamic-island] failed to start ${Cls.name}: ${e}`);
            }
        };

        trySource(NotificationSource);
        trySource(BatterySource);
        trySource(VolumeSource);
        trySource(WifiSource);

        try {
            this._sessionWatcher = new SessionWatcher(this._island);
        } catch (e) {
            console.error(`[dynamic-island] SessionWatcher failed: ${e}`);
        }

        try {
            let settings = null;
            try {
                settings = this.getSettings();
            } catch (e) {
                console.error(`[dynamic-island] skema pengaturan: ${e}`);
            }
            this._shortcuts = new MemoShortcuts(this._island, settings);
            this._shortcuts.enable();
        } catch (e) {
            console.error(`[dynamic-island] shortcuts failed: ${e}`);
        }

        try {
            this._sambutan = new SambutanSistem();
            this._sambutan.enable();
        } catch (e) {
            console.error(`[dynamic-island] sambutan menu daya: ${e}`);
        }

        console.log(`[dynamic-island] enabled, ${this._sources.length}/4 sources, adopted ${this._island._adopted.length} panel items`);
    }

    disable() {
        this._sambutan?.disable();
        this._sambutan = null;
        this._shortcuts?.disable();
        this._shortcuts = null;
        this._sources?.forEach(s => s.destroy());
        this._sources = null;
        this._service?.destroy();
        this._service = null;
        this._sessionWatcher?.destroy();
        this._sessionWatcher = null;
        this._island?.destroy();
        this._island = null;
    }
}
