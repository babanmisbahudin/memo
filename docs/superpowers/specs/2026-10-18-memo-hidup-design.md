# Memo Hidup — Desain Bagian A + B

Tanggal: 2026-10-18 · Status: desain disetujui per bagian, belum ada kode.

Memo keluar dari Dynamic Island dan hidup di desktop seperti NPC: melompat
di atas jendela, mengintip sana-sini, punya kebutuhan, sifat, dan ritme
harian sendiri. Dokumen ini hanya mencakup **A (tubuh & jelajah)** dan
**B (pikiran lokal, tanpa AI)**. Bagian C–E dirancang terpisah sesudahnya
(lihat [Bagian berikutnya](#bagian-berikutnya)).

## Keputusan

| Topik | Keputusan |
|---|---|
| Urutan | A + B tipis dulu; C, D, E menyusul dengan desain sendiri |
| Badan | **Mochi**: island hitam bulat yang sekarang (mata LED face.js), tanpa kaki; bergerak dengan melompat & gepeng-melar (gerakPola.js) |
| Cara gerak | **Gravitasi + lompat**: berdiri di lantai (dasar layar, tepi atas jendela), melompat antar lantai, jatuh bila lantainya hilang |
| Island | **Satu Memo**: keluar dari island untuk jalan-jalan, pulang bila ada izin/kabar/panel dibuka, lalu keluar lagi |
| Ngintip | Menyembul dari balik jendela / pinggir layar, **dan** tahu nama aplikasi + judul jendela. Semua tetap di laptop |
| Sopan santun | **Sopan, sedikit iseng**: tidak menutupi isi jendela aktif atau sekitar kursor, menyingkir bila kursor datang, tenang saat kamu mengetik, menghilang saat aplikasi layar penuh |
| Jendela aktif dimaksimalkan | **Ngintip dari pinggir**: separuh badan menyembul di tepi layar, pindah tepi bila kursor mendekat |
| Sifat | **Slider** yang bisa diatur: cuek↔penasaran, malas↔aktif, kalem↔iseng, pemalu↔manja |
| Interaksi | Klik = dielus · seret = diangkat & dilempar · klik dua kali = buka panel · tombol "Panggil ke sini" & "Pulang" |
| Pendekatan teknis | **Semua di extension**, pikiran sebagai modul murni (pendekatan 1) |

## Arsitektur

Semuanya di dalam extension `dynamic-island@local`, folder baru
`extension/hidup/`. Hanya dari dalam GNOME Shell Memo bisa tahu posisi semua
jendela dan bisa diselipkan di antara tumpukan jendela (Wayland tidak
mengizinkan aplikasi biasa melakukan keduanya).

Aturan `docs/arsitektur.md` tetap berlaku: tidak ada yang berat di
gnome-shell. Pikiran di sini hanya hitungan kecil sekali per detik — tanpa
AI, tanpa berkas, tanpa jaringan di jalur langkah.

```
sinyal jendela · fokus · kursor · idle · layar penuh
        │
        ▼
   persepsi ──► dunia.js ──► peta ──► pikiran.js (1×/dtk) ──► niat
                                                                │
                       aktor Memo ◄── fisika.js (12×/dtk) ◄── memoHidup.js
```

| Berkas | Jenis | Tanggung jawab |
|---|---|---|
| `hidup/dunia.js` | murni | persepsi → peta: lantai, tepi ngintip, zona larangan |
| `hidup/fisika.js` | murni | badan: gravitasi, busur lompat, rute antar lantai, jatuh, lempar, pantul |
| `hidup/pikiran.js` | murni | kebutuhan, sifat, ritme harian, pemilihan kegiatan → niat |
| `hidup/kenalAplikasi.js` | murni | jendela → kategori (kode, video, terminal, …) |
| `hidup/memoHidup.js` | shell | aktor, sinyal jendela, penempatan di tumpukan, input, serah-terima island |
| `extension.js` | shell, diubah | memanggil Memo pulang/keluar; island menampilkan "· ·" saat Memo di luar |
| `panel.js` | shell, diubah | tab Pengaturan: sakelar, slider, tombol panggil |
| `companion.js` | dipensiunkan | fiturnya (seret, klik buka panel, mata mengikuti kursor) diserap `memoHidup.js` |

"Murni" = tanpa St/Clutter/Meta/Main, bisa dijalankan `gjs` polos dan diuji di
luar GNOME — pola yang sama dengan `gerakPola.js` dan `face.js`.

### Bentuk data antar modul

```js
// persepsi — dikumpulkan memoHidup.js dari GNOME Shell
{ areaKerja: {x, y, lebar, tinggi},           // monitor utama, tanpa panel/dock
  jendela: [{ id, x, y, lebar, tinggi,         // frame rect, urut bawah → atas
              aktif, maksimal, layarPenuh, aplikasi, judul }],
  kursor: {x, y}, mengetikMs, diamMs,          // ms sejak ketik terakhir / input terakhir
  jam }                                        // 0–23

// peta — dunia.petaDari(persepsi, ukuranMemo)
{ lantai: [{ x1, x2, y, jendelaId /* null = dasar layar */ }],
  tepi:   [{ jenis: 'layar' | 'jendela', sisi: 'kiri'|'kanan'|'bawah'|'atas', x, y, jendelaId }],
  larangan: { kotak: [{x, y, lebar, tinggi}], kursor: {x, y, r} },
  hanyaTepi: bool,    // jendela aktif memenuhi area kerja
  sembunyi: bool }    // aplikasi layar penuh

// niat — pikiran.langkah(keadaan, persepsi, peta, dtMs, acak)
{ kegiatan, tujuan: { jenis: 'lantai'|'tepi'|'kursor'|'island'|'diam', ... },
  ekspresi, emote, ikon, lamaMs }
```

## Dunia (`dunia.js`)

- **Lantai** = dasar area kerja + tepi atas tiap jendela, **hanya bagian yang
  terlihat** (tidak tertutup jendela di atasnya) dan punya ruang di atasnya
  setinggi badan Memo. Tepi atas jendela aktif boleh: Memo berdiri di luar
  jendelanya, jadi isinya tidak tertutup.
- **Tepi ngintip** = pinggir kiri/kanan/bawah layar, dan sisi/atas jendela
  yang tidak aktif (Memo diselipkan di belakang jendela itu, mata menyembul
  melewati tepinya). Yang terlihat ±40% badan.
- **Zona larangan** = isi jendela aktif + lingkar ±160 px di sekitar kursor.
  Tujuan di dalam zona ini tidak pernah dipilih.
- **Jendela aktif memenuhi area kerja** (maximize) → `hanyaTepi`: tidak ada
  lantai yang boleh, Memo hanya boleh di tepi layar. Ini satu-satunya
  pengecualian zona larangan: separuh badan di tepi layar memang menimpa
  pinggir jendela aktif, tapi lingkar kursor tetap berlaku.
- **Aplikasi layar penuh** (video, game, presentasi) → `sembunyi`.
- Peta dibangun ulang dari sinyal (jendela dibuka/ditutup/digeser/diubah
  ukuran, fokus, workspace), ditunda ±100 ms supaya geseran beruntun tidak
  membangun ulang berkali-kali. Bukan polling.
- Satu monitor (layar laptop). Multi-monitor di luar lingkup.

## Fisika (`fisika.js`)

- Langkah tetap 12×/detik (sama dengan gaya piksel island), posisi dibulatkan
  ke piksel. Timer fisika hanya hidup saat Memo bergerak.
- **"Jalan"** = rangkaian lompatan kecil (±24 px) dengan gepeng saat menolak &
  mendarat.
- **Pindah lantai** = busur lompat yang direncanakan; bila tujuan di luar
  jangkauan satu lompatan, rute dicari di graf lantai (simpul = lantai, sisi =
  lompatan yang mungkin).
- **Lantai bergerak**: jendela tempat Memo berdiri digeser → Memo ikut
  terbawa; digeser lebih cepat dari ambang → Memo terjatuh.
- **Lantai hilang** (jendela ditutup, diperkecil, pindah workspace) → jatuh ke
  lantai di bawahnya, mendarat dengan emote `kaget`.
- **Dilempar**: kecepatan diambil dari gerak kursor ±100 ms terakhir sebelum
  dilepas; memantul di tepi layar dengan redaman, mendarat, emote `pusing`.
- Angka awal (akan disetel saat implementasi): jangkauan satu lompatan ±480 px
  mendatar & ±320 px naik, gravitasi dipilih supaya lompatan sedang ±0,6 dtk.

## Pikiran (`pikiran.js`)

**Kebutuhan** (0–1, berubah sendiri tiap detik):

| Kebutuhan | Naik | Turun |
|---|---|---|
| energi | tidur | bergerak; lebih cepat 22:00–05:00 dan sedikit di 13:00–14:00 |
| bosan | diam tanpa kejadian | jalan-jalan, hal baru |
| penasaran | jendela baru, judul berubah, aplikasi yang belum pernah dilihat | sesudah diintip |
| rindu | lama tidak disapa | dielus, kursor lama di dekatnya |

**Sifat** (slider 0–1, bawaan): penasaran 0,7 · aktif 0,5 · iseng 0,4 ·
manja 0,6. Sifat mengubah laju kebutuhan dan bobot kegiatan (pemalu → kabur
lebih cepat & lebih sering ngintip dari tepi; manja → mendekat, melirik
kursor, minta dielus). Iseng tetap tunduk zona larangan.

**Kegiatan** — dipilih tiap detik dengan skor (kebutuhan × sifat × persepsi ×
sedikit acak); kegiatan yang sedang berjalan mendapat bonus bertahan supaya
Memo tidak gonta-ganti:

| Kegiatan | Muncul saat | Yang terlihat |
|---|---|---|
| jelajah | bosan, energi cukup, aktif | melompat ke lantai jauh, singgah di beberapa jendela |
| ngintip | penasaran, jendela baru/berubah | menyembul dari balik jendela itu, ikon ❓/❗ |
| nonton | ada jendela video | duduk di atas jendelanya, mata menatap isinya |
| temani | kamu ngoding/menulis, rindu/manja | duduk dekat (di luar lingkar kursor), sesekali melirik |
| joget | jendela musik | emote `dansa` + not musik |
| iseng | iseng, energi tinggi | loncat-loncat, berguling di tepi jendela tak terpakai, pura-pura jatuh |
| tidur | energi rendah, malam, atau kamu pergi (aturan tidur island `bolehTidur`: diam ≥ 2 menit & kursor jauh) | pindah ke pojok tenang, mata terpejam, Z |
| sambut | kamu kembali sesudah pergi | bangun, melompat, ♥ |
| melamun | tidak ada yang mendesak | gerak iseng kecil (lirik, kedip) seperti sekarang |

**Penyela** selalu menang atas kegiatan: dipanggil island → pulang; kursor
masuk lingkar → menyingkir; dielus/diseret/dilempar → bereaksi dulu.

**Ucapan** di bagian B hanya ikon piksel (❓ ❗ ♥ ♪ z ✓) memakai sprite
partikel yang sudah ada. Kata-kata dari AI ada di bagian C.

**Berlanjut**: kebutuhan & waktu simpan disimpan; saat dimuat ulang,
kebutuhan dimajukan sesuai waktu yang lewat (laptop mati semalam → pagi
energi penuh).

## Kenal aplikasi (`kenalAplikasi.js`)

Kategori dari `wm_class`/app id, dibantu judul jendela untuk browser:

| Kategori | Contoh |
|---|---|
| kode | VS Code, VSCodium, JetBrains, GNOME Builder |
| video | VLC, mpv, Celluloid, Totem; browser dengan judul "YouTube" |
| terminal | Ptyxis, GNOME Terminal, Kitty, Alacritty |
| chat | Telegram, Discord, Slack; browser dengan judul "WhatsApp" |
| musik | Spotify, Rhythmbox; browser dengan judul "YouTube Music" |
| dokumen | LibreOffice, Obsidian, Papers/Evince |
| lain | selebihnya |

Judul hanya dipakai di dalam extension untuk kategori dan rasa "baru/berubah";
tidak disimpan ke berkas dan tidak dikirim ke mana pun.

## Badan di GNOME Shell (`memoHidup.js`)

- Aktor = pill hitam + `RobotFace` + `Gerak` yang sudah ada (seukuran Memo
  desktop/companion sekarang, skala 2,6×), gerak tetap gaya piksel.
- **Penempatan di tumpukan**: saat berdiri di atas jendela B, aktor
  diselipkan tepat di atas B di `global.window_group`, jadi jendela yang lebih
  atas bisa menutupinya. Saat ngintip dari balik B, aktor tepat di bawah B. Di
  dasar layar dan tepi layar, aktor di lapisan atas. Jendela acuan hilang →
  kembali ke lapisan atas, lalu jatuh.
- **Input**: klik = dielus; seret = diangkat (emote `kaget`, badan melar);
  lepas sambil bergerak cepat = dilempar; klik dua kali = buka panel. Mata
  mengikuti kursor seperti companion sekarang.
- **Sembunyi sementara** saat aplikasi layar penuh, Activities/overview
  terbuka, atau layar terkunci. ❓ Saat berbagi layar (rapat) — perlu dicek
  apakah GNOME Shell 50 memberi sinyal yang bisa dipakai extension.
- **Lama diam** dibaca lewat idle monitor Mutter dan diteruskan ke pikiran;
  keputusan "kamu pergi" memakai `bolehTidur` yang sudah dipakai island, jadi
  tetap satu aturan tidur.

## Serah-terima dengan island

- **Keluar** bila: jalan-jalan aktif, tidak ada izin/kabar menunggu, panel
  tertutup, dan sepi ±20 dtk. Memo melompat keluar dari island lalu mendarat di
  lantai terdekat. Island menampilkan "· ·" (Memo sedang keluar).
- **Pulang** bila: izin agen baru (`_segarkanAgen`), kabar LebihTeratur atau
  notifikasi (`trigger`), panel dibuka (Super+M atau klik dua kali), atau
  tombol "Pulang". Busur lompat ke island; hanya di sini Memo boleh melintasi
  zona larangan sebentar. Masuk island → kartu tampil seperti sekarang.
- Sedang diseret → panggilan pulang ditunda sampai dilepas.

## Pengaturan & berkas

Tab Pengaturan di panel Memo: sakelar **Memo jalan-jalan**, empat slider sifat,
tombol **Panggil ke sini** dan **Pulang**. Menggantikan tombol "Lepas ke
desktop / Kembalikan ke island" milik companion.

`~/.config/memo/hidup.json` (menggantikan `companion.json`):

```json
{ "aktif": true,
  "sifat": { "penasaran": 0.7, "aktif": 0.5, "iseng": 0.4, "manja": 0.6 },
  "kebutuhan": { "energi": 0.8, "bosan": 0.2, "penasaran": 0.5, "rindu": 0.3 },
  "disimpan": "2026-10-18T21:40:00+07:00" }
```

Disimpan tiap beberapa menit dan saat extension dimatikan — tidak di jalur
langkah.

## Keselamatan & kinerja

- Semua berjalan di proses gnome-shell (yang juga compositor), jadi tiap
  langkah dibungkus `try/catch`. Tiga galat beruntun → Memo pulang, jalan-jalan
  mati untuk sesi itu, galat dicatat `[dynamic-island] hidup:`.
- Tidak ada akses berkas, jaringan, atau AI di jalur langkah.
- Fisika 12×/dtk hanya saat bergerak; saat duduk/tidur hanya pikiran 1×/dtk.
  Target: CPU nyaris nol saat Memo diam.

## Pengujian

- **Tanpa GNOME** (`gjs`, ikut `tests/semua.sh`):
  - `test-dunia.js`: lantai dari susunan jendela, bagian tertutup tidak jadi
    lantai, maximize → `hanyaTepi`, layar penuh → `sembunyi`, zona larangan.
  - `test-fisika.js`: busur sampai tujuan, rute lewat lantai perantara, jatuh
    saat lantai hilang, ikut jendela bergerak, lempar & pantul, posisi selalu
    piksel bulat.
  - `test-pikiran.js`: simulasi sehari dipercepat — sifat malas lebih banyak
    tidur, penasaran mendatangi jendela baru, tujuan tidak pernah di zona
    larangan, penyela selalu menang, kebutuhan berlanjut sesudah dimuat ulang.
- **GNOME headless** (`tests/gnome/uji-island.sh`): jendela uji → Memo keluar &
  berdiri di atasnya; jendela dimaksimalkan → pindah ke tepi; izin agen →
  pulang; kursor didekatkan → menyingkir; tangkapan layar tiap keadaan; tidak
  ada JS ERROR di log shell.

## Pertanyaan terbuka

- ❓ Apakah GNOME Shell 50 punya sinyal "sedang berbagi layar" untuk
  extension? Bila tidak ada, Memo tidak bisa otomatis sembunyi saat rapat
  (cadangan: tombol "Pulang").
- ❓ Rupa island saat Memo keluar ("· ·" redup) — dicoba dengan tangkapan
  layar saat implementasi.
- ❓ Angka fisika (jangkauan, gravitasi) dan laju kebutuhan disetel dengan
  simulasi + dicoba langsung.

## Bagian berikutnya

| Bagian | Isi | Catatan |
|---|---|---|
| C — Ingatan & kesadaran | kebiasaanmu dipelajari, ucapan/pikiran dari AI lewat `otak.py`, **vault otak kedua** (`~/Documents/himisbah`, 57 catatan) sebagai ingatan jangka panjang | Usul: Memo hanya **membaca** vault, tidak menulis (sejalan dengan dibuangnya pencatat kegiatan ke vault pada 2026-10-12). Perlu diputuskan: ❓ `05-Pribadi` ikut atau tidak; ❓ isi vault boleh dikirim ke AI awan (Claude/Gemini) atau hanya Ollama lokal |
| D — Pengaturan lanjutan | area boleh jelajah, jam tenang, profil sifat | |
| E — Mode Jarvis layar penuh | menu Memo layar penuh (gaya `sambutan/layar.js`), ngobrol suara terus-menerus, menjalankan perintah ("buka YouTube"), **suara Memo ala "tiny robot"** — imut, tidak kaku seperti robot (permintaan pengguna 2026-10-18) | Pondasi sudah ada: `memo-suara` (Super+Shift+M) dan `aksi_pola.py`. ❓ "Aplikasi desktop YouTube" belum terpasang di laptop ini; sekarang YouTube dibuka di browser |
