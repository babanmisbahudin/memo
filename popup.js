// Menu yang muncul saat mata Memo diklik.
//
// Isinya sengaja hal-hal yang tidak disediakan menu panel lain: sakelar
// kamera, tugas hari ini dari vault Obsidian, dan contekan isyarat tangan.

import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import * as Vault from './vault.js';

const LAYANAN = 'memo-tangan.service';

// Pratinjau kamera. Pendeteksi menulis piksel RGBA mentah ke /dev/shm; tidak
// ada encode/decode PNG di kedua sisi, dan tidak menyentuh disk sama sekali.
const PRATINJAU_LEBAR = 240;
const PRATINJAU_TINGGI = 180;
const PRATINJAU_BERKAS = '/dev/shm/memo-pratinjau.rgba';
const PRATINJAU_MINTA = '/dev/shm/memo-pratinjau.minta';
const PRATINJAU_JEDA_MS = 200;

// Tombol ngobrol memicu layanan suara lewat berkas, pola yang sama dengan
// pratinjau: sederhana, dan sudah terbukti jalan.
const NGOBROL_PICU = '/dev/shm/memo-ngobrol.minta';
const NGOBROL_STATUS = '/dev/shm/memo-ngobrol.status';
const NGOBROL_TEKS = '/dev/shm/memo-ngobrol.teks';
const LAYANAN_SUARA = 'memo-suara.service';

// Contekan isyarat dibaca dari berkas pemetaan yang sama dengan yang dipakai
// pendeteksi, jadi tidak mungkin melenceng dari yang sebenarnya berlaku.
const ISYARAT_JUDUL = {
    telapak_terbuka: 'Telapak terbuka',
    jempol: 'Jempol',
    telunjuk: 'Telunjuk',
    damai: 'Dua jari',
    tiga: 'Tiga jari',
    kepalan: 'Kepalan',
};

function petaIsyarat() {
    try {
        const jalur = GLib.build_filenamev(
            [GLib.get_user_config_dir(), 'memo', 'isyarat.json']);
        const [ok, isi] = GLib.file_get_contents(jalur);
        if (ok)
            return JSON.parse(new TextDecoder().decode(isi))?.isyarat ?? {};
    } catch (e) {
        // Berkas belum ada atau rusak — contekannya saja yang kosong.
    }
    return {};
}

function ringkasAksi(entri) {
    if (!entri)
        return '—';
    switch (entri.jenis) {
    case 'nonaktif': return '—';
    case 'aktifkan': return entri.buka_menu ? 'buka menu + kendali' : 'aktifkan kendali';
    case 'volume': return `volume ${entri.arah ?? ''}`.trim();
    case 'aplikasi': return (entri.target ?? '').replace(/\.desktop$/, '');
    case 'tombol': return entri.target ?? '';
    case 'perintah': return entri.target ?? '';
    case 'ekspresi': return `ekspresi ${entri.target ?? ''}`;
    default: return entri.jenis;
    }
}

// systemctl dipanggil sebagai subproses asinkron. Menunggu proses secara
// sinkron di dalam gnome-shell akan membekukan desktop.
function systemctl(argumen, selesai = null) {
    try {
        const proc = Gio.Subprocess.new(
            ['systemctl', '--user', ...argumen],
            Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE);
        proc.communicate_utf8_async(null, null, (p, res) => {
            try {
                const [, keluaran] = p.communicate_utf8_finish(res);
                selesai?.((keluaran ?? '').trim());
            } catch (e) {
                console.error(`[dynamic-island] systemctl gagal: ${e}`);
                selesai?.(null);
            }
        });
    } catch (e) {
        console.error(`[dynamic-island] systemctl tidak bisa dijalankan: ${e}`);
        selesai?.(null);
    }
}

export class MemoMenu {
    constructor(sourceActor, island) {
        this._island = island;

        this.menu = new PopupMenu.PopupMenu(sourceActor, 0.5, St.Side.TOP);
        this.menu.actor.add_style_class_name('memo-menu');
        Main.uiGroup.add_child(this.menu.actor);
        this.menu.actor.hide();
        Main.panel.menuManager.addMenu(this.menu);

        this._bangunNgobrol();
        this._bangunKamera();
        this._bangunPratinjau();
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._bangunTugas();
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._bangunIsyarat();

        this._bukaId = this.menu.connect('open-state-changed', (m, terbuka) => {
            if (terbuka) {
                this._segarkanKamera();
                this._segarkanTugas();
                this._mulaiPratinjau();
                this._pantauStatus();
            } else {
                this._hentikanPratinjau();
                this._hentikanPantauStatus();
            }
        });
    }

    toggle() {
        this.menu.toggle();
    }

    // --- ngobrol ---

    // Mengetik jadi jalur utama: mikrofon internal laptop ini terpotong di
    // puncak dan pengenalannya tidak bisa diandalkan. Tombol suara tetap ada
    // sebagai pelengkap, bukan sebagai cara utama.
    _bangunNgobrol() {
        const kotak = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
        });
        this._entriTanya = new St.Entry({
            hint_text: 'Tanya Memo…',
            can_focus: true,
            x_expand: true,
            style_class: 'memo-entri',
        });
        this._entriTanya.clutter_text.connect('activate', () => {
            const teks = this._entriTanya.get_text();
            this._entriTanya.set_text('');
            if (teks.trim())
                this._kirimTanya(teks.trim());
        });
        kotak.add_child(this._entriTanya);
        this.menu.addMenuItem(kotak);

        this._tombolNgobrol = new PopupMenu.PopupImageMenuItem(
            'Atau bicara lewat mikrofon', 'audio-input-microphone-symbolic');
        this._tombolNgobrol.label.add_style_class_name('memo-sekunder');
        this._tombolNgobrol.connect('activate', () => this._mulaiNgobrol());
        this.menu.addMenuItem(this._tombolNgobrol);

        this._labelStatus = new PopupMenu.PopupMenuItem('', { reactive: false });
        this._labelStatus.label.add_style_class_name('memo-status');
        this._labelStatus.label.clutter_text.line_wrap = true;
        this._labelStatus.visible = false;
        this.menu.addMenuItem(this._labelStatus);
    }

    _kirimTanya(teks) {
        this._pastikanLayanan(() => {
            try {
                GLib.file_set_contents(NGOBROL_TEKS, teks);
                this._tampilkanStatus('Memo sedang berpikir…');
            } catch (e) {
                this._tampilkanStatus('Gagal mengirim pertanyaan');
            }
        });
    }

    _pastikanLayanan(lanjut) {
        systemctl(['is-active', LAYANAN_SUARA], hasil => {
            if (hasil !== 'active') {
                this._tampilkanStatus('Menyalakan Memo…');
                systemctl(['start', LAYANAN_SUARA], lanjut);
                return;
            }
            lanjut();
        });
    }

    _mulaiNgobrol() {
        this._pastikanLayanan(() => this._picuNgobrol());
    }

    _picuNgobrol() {
        try {
            GLib.file_set_contents(NGOBROL_PICU, '1');
            this._tampilkanStatus('Silakan bicara…');
        } catch (e) {
            this._tampilkanStatus('Gagal memicu layanan suara');
        }
    }

    _tampilkanStatus(teks) {
        this._labelStatus.label.text = teks;
        this._labelStatus.visible = !!teks;
    }

    // Layanan suara menulis tahapannya ke berkas; popup membacanya supaya
    // kamu tahu Memo sedang mendengar, berpikir, atau bicara.
    _pantauStatus() {
        if (this._statusId)
            return;
        this._statusId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 400, () => {
            let teks = '';
            try {
                const [ok, isi] = GLib.file_get_contents(NGOBROL_STATUS);
                if (ok)
                    teks = new TextDecoder().decode(isi).trim();
            } catch (e) {
                teks = '';
            }
            if (teks !== this._statusTerakhir) {
                this._statusTerakhir = teks;
                this._tampilkanStatus(teks);
            }
            return GLib.SOURCE_CONTINUE;
        });
    }

    _hentikanPantauStatus() {
        if (this._statusId) {
            GLib.source_remove(this._statusId);
            this._statusId = null;
        }
    }

    // --- kamera ---

    _bangunKamera() {
        this._sakelarKamera = new PopupMenu.PopupSwitchMenuItem('Kamera', false);
        this._sakelarKamera.connect('toggled', (item, nyala) => {
            systemctl([nyala ? 'start' : 'stop', LAYANAN], () => this._segarkanKamera());
        });
        this.menu.addMenuItem(this._sakelarKamera);
    }

    _segarkanKamera() {
        systemctl(['is-active', LAYANAN], hasil => {
            const nyala = hasil === 'active';
            // setToggleState tidak memancarkan 'toggled', jadi menyegarkan
            // tampilan di sini tidak memicu start/stop berulang.
            this._sakelarKamera.setToggleState(nyala);
            this._sakelarKamera.label.text = nyala ? 'Kamera menyala' : 'Kamera mati';
        });
    }

    // --- pratinjau kamera ---

    _bangunPratinjau() {
        this._isiPratinjau = St.ImageContent.new_with_preferred_size(
            PRATINJAU_LEBAR, PRATINJAU_TINGGI);

        this._gambarPratinjau = new St.Widget({
            style_class: 'memo-pratinjau',
            width: PRATINJAU_LEBAR,
            height: PRATINJAU_TINGGI,
            x_align: Clutter.ActorAlign.CENTER,
        });
        this._gambarPratinjau.set_content(this._isiPratinjau);

        this._wadahPratinjau = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
        });
        this._wadahPratinjau.add_child(this._gambarPratinjau);
        this.menu.addMenuItem(this._wadahPratinjau);
    }

    // Pendeteksi hanya menulis bingkai selagi berkas permintaan masih segar,
    // jadi menyentuhnya berkala di sini adalah cara popup bilang "saya sedang
    // melihat". Begitu popup ditutup, penulisan berhenti sendiri.
    _mulaiPratinjau() {
        if (this._pratinjauId)
            return;
        this._mintaPratinjau();
        this._muatBingkai();
        this._pratinjauId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT, PRATINJAU_JEDA_MS, () => {
                this._mintaPratinjau();
                this._muatBingkai();
                return GLib.SOURCE_CONTINUE;
            });
    }

    _hentikanPratinjau() {
        if (this._pratinjauId) {
            GLib.source_remove(this._pratinjauId);
            this._pratinjauId = null;
        }
    }

    _mintaPratinjau() {
        try {
            const berkas = Gio.File.new_for_path(PRATINJAU_MINTA);
            berkas.replace_contents(new TextEncoder().encode('1'), null, false,
                Gio.FileCreateFlags.REPLACE_DESTINATION, null);
        } catch (e) {
            // Gagal menulis permintaan bukan alasan menjatuhkan menu.
        }
    }

    _muatBingkai() {
        let data;
        try {
            const [ok, isi] = GLib.file_get_contents(PRATINJAU_BERKAS);
            if (!ok)
                return;
            data = isi;
        } catch (e) {
            return;
        }

        const diharapkan = PRATINJAU_LEBAR * PRATINJAU_TINGGI * 4;
        if (data.length !== diharapkan) {
            // Bingkai separuh tertulis; lewati saja, yang berikutnya utuh.
            return;
        }

        try {
            const coglContext = global.stage.context.get_backend().get_cogl_context();
            this._isiPratinjau.set_bytes(
                coglContext,
                new GLib.Bytes(data),
                Cogl.PixelFormat.RGBA_8888,
                PRATINJAU_LEBAR, PRATINJAU_TINGGI,
                PRATINJAU_LEBAR * 4);
        } catch (e) {
            console.error(`[dynamic-island] gagal memuat pratinjau: ${e}`);
            this._hentikanPratinjau();
        }
    }

    // --- tugas ---

    _bangunTugas() {
        this._bagianTugas = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._bagianTugas);

        const kotak = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
        });
        this._entri = new St.Entry({
            hint_text: 'Tambah tugas hari ini…',
            can_focus: true,
            x_expand: true,
            style_class: 'memo-entri',
        });
        this._entri.clutter_text.connect('activate', () => {
            const teks = this._entri.get_text();
            this._entri.set_text('');
            if (teks.trim())
                this._tambahTugas(teks);
        });
        kotak.add_child(this._entri);
        this.menu.addMenuItem(kotak);
    }

    _tambahTugas(teks) {
        Vault.tambah(teks)
            .then(daftar => this._tampilkanTugas(daftar))
            .catch(e => console.error(`[dynamic-island] gagal menambah tugas: ${e}`));
    }

    _segarkanTugas() {
        Vault.muatTugas()
            .then(daftar => this._tampilkanTugas(daftar))
            .catch(e => {
                console.error(`[dynamic-island] gagal memuat tugas: ${e}`);
                this._pesanTugas('Catatan harian tidak terbaca');
            });
    }

    _pesanTugas(pesan) {
        this._bagianTugas.removeAll();
        const item = new PopupMenu.PopupMenuItem(pesan, { reactive: false });
        item.label.add_style_class_name('memo-kosong');
        this._bagianTugas.addMenuItem(item);
    }

    _tampilkanTugas(daftar) {
        if (daftar === null) {
            this._pesanTugas('Vault Obsidian tidak ditemukan');
            return;
        }

        this._bagianTugas.removeAll();

        if (daftar.length === 0) {
            this._pesanTugas('Belum ada tugas hari ini');
        } else {
            for (const tugas of daftar) {
                const item = new PopupMenu.PopupMenuItem(tugas.teks);
                item.setOrnament(tugas.selesai
                    ? PopupMenu.Ornament.CHECK
                    : PopupMenu.Ornament.NO_DOT);
                if (tugas.selesai)
                    item.label.add_style_class_name('memo-tugas-selesai');
                item.connect('activate', () => {
                    Vault.centang(tugas.baris, !tugas.selesai)
                        .then(baru => this._tampilkanTugas(baru))
                        .catch(e => console.error(`[dynamic-island] gagal mencentang: ${e}`));
                });
                this._bagianTugas.addMenuItem(item);
            }
        }

        this._cerminkanKeEkspresi(daftar);
    }

    // Mata Memo ikut isi daftar tugas, supaya ekspresinya punya arti dan tidak
    // sekadar hiasan.
    _cerminkanKeEkspresi(daftar) {
        if (!daftar || daftar.length === 0)
            return;
        const tersisa = daftar.filter(t => !t.selesai).length;
        if (tersisa === 0)
            this._island?.setExpression('senang', 2500);
        else if (tersisa >= 5)
            this._island?.setExpression('bingung', 2500);
    }

    // --- isyarat ---

    _bangunIsyarat() {
        const judul = new PopupMenu.PopupMenuItem('Isyarat tangan', { reactive: false });
        judul.label.add_style_class_name('memo-judul');
        this.menu.addMenuItem(judul);

        const peta = petaIsyarat();
        const baris = Object.entries(ISYARAT_JUDUL).map(([kunci, judulIsyarat]) => {
            const entri = peta[kunci];
            const tahan = entri?.tahan ? ` ${entri.tahan}s` : '';
            return [judulIsyarat + tahan, ringkasAksi(entri)];
        }).filter(([, aksi]) => aksi !== '—');

        for (const [pose, aksi] of baris) {
            const item = new PopupMenu.PopupBaseMenuItem({
                reactive: false,
                can_focus: false,
            });
            const kiri = new St.Label({ text: pose, x_expand: true });
            const kanan = new St.Label({ text: aksi, style_class: 'memo-isyarat-aksi' });
            kiri.add_style_class_name('memo-isyarat-pose');
            item.add_child(kiri);
            item.add_child(kanan);
            this.menu.addMenuItem(item);
        }
    }

    destroy() {
        this._hentikanPratinjau();
        this._hentikanPantauStatus();
        if (this._bukaId) {
            this.menu.disconnect(this._bukaId);
            this._bukaId = null;
        }
        Main.panel.menuManager.removeMenu(this.menu);
        this.menu.destroy();
    }
}
