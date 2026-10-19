# Memo hidup di desktop

Memo keluar dari Dynamic Island dan hidup di desktop seperti NPC: melompat
di atas jendela, mengintip dari balik jendela dan pinggir layar, menonton
saat YouTube terbuka, menemani saat kamu ngoding, tidur kalau kamu pergi.
Desain: [spec](superpowers/specs/2026-10-18-memo-hidup-design.md).

## Menyalakan

Panel Memo (Super+M) → **Pengaturan** → **Jalan-jalan: mati** (klik untuk
menyalakan). Memo keluar dari island sesudah ±20 detik tanpa izin/kabar baru.

| Tombol / sentuhan | Yang terjadi |
|---|---|
| Klik Memo | dielus: mata senang, hati piksel |
| Seret Memo | diangkat; lepas sambil bergerak cepat = dilempar, memantul |
| Klik dua kali | panel Memo terbuka (Memo pulang dulu) |
| Panggil ke sini | Memo datang ke dekat kursor |
| Pulang | Memo kembali ke island |
| Slider sifat | cuek↔penasaran, malas↔aktif, kalem↔iseng, pemalu↔manja |

Memo pulang sendiri saat ada izin agen, notifikasi (termasuk kabar
LebihTeratur), atau panel dibuka, lalu keluar lagi saat sepi. Ia tidak masuk
ke isi jendela yang sedang kamu pakai, menjauh dari kursor, menempel di tepi
layar saat jendela aktif dimaksimalkan, dan menghilang saat ada aplikasi
layar penuh, Activities, atau layar terkunci.

## Siklus hidup & perawatan

Memo tumbuh: **telur → bayi → balita → anak → remaja → dewasa → tua**
(±5 bulan kalender; desain: [spec](superpowers/specs/2026-10-19-siklus-hidup-design.md)).
Bayi 60% ukuran, balita 70%, anak 85%. Bayi lebih sering tidur; bayi, balita,
dan Memo tua tidak main atraksi.

| Kebutuhan | Tanda | Rawat (panel → Beranda) |
|---|---|---|
| Lapar (penuh ±6 jam; bayi & balita 1,5× lebih cepat) | ikon mangkuk, kabar "lapar" di island | **makan** (bergantian nasi, kue, buah — makanan jatuh di samping Memo, Memo mengunyah) |
| Pup (40–90 menit sesudah makan) | 1–3 gumpal kotoran **berserakan** di lantai, kabar "pup!" | **klik tiap kotoran**, lalu **cebok** (gulungan tisu, tisu mengusap, kilau bersih) |
| Kotor / bau (lebih cepat bila kotoran dibiarkan atau belum dicebok) | noda di badan makin banyak, garis bau, **lalat** berdengung bila parah | **mandi** (pancuran, tetesan air, busa, lalu Memo mengibaskan badan) |
| Capek | — | **tidur** (kasur, bantal, selimut, napas, Z melayang ±1 menit) |
| Sakit (lapar atau kotor penuh 3 jam) | wajah lesu, kabar di island | **obat**, lalu penuhi yang menyebabkannya |

Tidur, mandi, dan cebok dimainkan di desktop (panel menutup sendiri); bila
Memo sedang di island, cukup efeknya saja.

Sakit yang dibiarkan **24 jam** membuat Memo meninggal (peringatan saat 12
dan 2 jam tersisa); di akhir masa tua Memo meninggal dengan tenang. Memo
"kembali ke bintang", tercatat di album kenangan, lalu **telur baru** muncul.

**Adil:** kebutuhan & sakit hanya berjalan selama kamu login **dan**
jalan-jalan nyala. Laptop mati, tidur, atau jalan-jalan dimatikan = Memo
berhenti lapar. Umur tetap berjalan menurut kalender.

**Memo baru** (pemasangan baru / sesudah meninggal): Beranda menampilkan
wizard — nama (bawaan "Memo"), jenis kelamin, warna badan (6), bentuk mata
(kotak, bulat, sipit) → **tetaskan** → telur muncul di desktop → klik untuk
menetas. Jenis kelamin & rupa **hanya dipilih di awal ini**, bukan di
pengaturan; **atur → Nama Memo** hanya untuk mengganti nama. Suara ikut
jenis kelamin (laki-laki Ardi, perempuan Gadis, efek tiny robot sama).
Memo yang sudah ada sebelum fitur ini dianggap baru menjadi dewasa hari
ini, dan sekali menampilkan wizard "kenalan" (tanpa jadi telur) supaya
jenis kelamin & rupanya bisa dipilih.

## Atraksi

Atraksi adalah perilaku **bawaan** Memo, tanpa tombol atau pengaturan: saat
bosan (makin sering bila slider iseng & aktif tinggi), Memo memilih sendiri
satu atraksi yang muat di layar, berganti-ganti, tidak mengulang yang
terakhir bila ada pilihan lain.

Aturannya:

- tidak dimainkan di atas jendela yang sedang kamu pakai, tidak di dekat
  kursor, dan tidak saat jendela aktif dimaksimalkan atau layar penuh;
- kursor yang mendekat membuat Memo kaget dan melepas atraksinya;
- bayi, balita, Memo tua, dan Memo yang sakit tidak main atraksi;
- semua bergaya piksel: 12 langkah/detik, putaran per 10°, properti digambar
  per kotak 3 px (`extension/hidup/atraksi.js`, murni & diuji
  `test-atraksi.js`).

### Yang sudah ada

| Atraksi | Yang terjadi | Syarat tempat |
|---|---|---|
| **Ayunan** | ayunan kayu turun dari tepi atas layar, Memo duduk & berayun sampai ±30°, lalu loncat turun | tepi atas bebas selebar ±280 px |
| **Gelantungan** | dua tangan mencengkeram tepi atas, badan berayun pelan, dua kali pull-up, lalu lepas & jatuh | tepi atas bebas selebar ±140 px |
| **Terjun payung** | parasut merah-putih mengembang di atas, Memo melayang turun sambil bergoyang ke sebuah lantai, parasut kempis | jalur tegak dari atas ke lantai tujuan bebas |
| **Naik mobil** | mobil merah muncul dari kepulan asap, Memo naik & menyetir ke ujung lantai (roda berputar, asap knalpot), lalu turun | Memo berdiri di lantai yang panjangnya ≥ ±400 px |

### Catatan: atraksi berikutnya (belum dibuat)

Ide yang cocok dengan mesin yang sama (bingkai murni + properti piksel +
badan diserahkan ke fisika di akhir):

| Atraksi | Gambaran | Syarat / catatan |
|---|---|---|
| **Skateboard** | meluncur di lantai, ollie melompati celah antar jendela | lantai panjang; mirip mobil, tapi bisa melompat ke lantai berikutnya |
| **Balon** | memegang balon, melayang naik pelan dari lantai, balon meletus di atas lalu jatuh | jalur tegak ke atas bebas |
| **Trampolin** | trampolin muncul, Memo memantul makin tinggi, salto di pantulan terakhir | ruang di atas lantai ±300 px |
| **Pancing** | duduk di tepi atas jendela, melempar kail ke bawah, menarik ikan piksel (kadang sepatu) | lantai berupa tepi atas jendela dengan ruang di bawahnya |
| **Roket** | roket kardus, hitung mundur 3-2-1, meluncur ke atas keluar layar, kembali dengan parasut | gabungan dengan terjun payung |
| **Tali luncur (flying fox)** | tali dibentang antara dua jendela, Memo meluncur bergantung | dua lantai berbeda tinggi berjauhan |
| **Lompat tali** | tali diputar sendiri, Memo melompat berirama | lantai mana saja; cocok untuk anak & remaja |
| **Main bola** | bola memantul, Memo menyundul & menendang | lantai lebar |
| **Payung hujan** | hujan piksel turun sebentar, Memo membuka payung | hanya tampilan; cocok saat bosan di sore hari |
| **Sepeda roda satu** | menjaga keseimbangan, oleng, kadang jatuh lucu | lantai panjang |
| **Tidur di hammock** | hammock dibentang antara dua tepi, Memo bergoyang tidur | pengganti kegiatan tidur sesekali |

Atraksi baru ditambahkan ke `ATRAKSI` di `atraksi.js` dengan fungsi
`bingkai` & `rencanakan` sendiri, plus uji di `test-atraksi.js`. Tetap
tanpa tombol: Memo yang memilih.

## Berkas & privasi

- `~/.config/memo/hidup.json`: sakelar, sifat, kebutuhan terakhir, dan hayat
  (nama, jenis kelamin, avatar, tanggal lahir, lapar/kotor/sakit, album) supaya
  Memo berlanjut sesudah login ulang. `companion.json` lama tidak dipakai lagi.
- Judul jendela hanya dipakai di dalam extension untuk menebak jenis jendela;
  tidak disimpan dan tidak dikirim ke mana pun. Tidak ada AI di bagian ini.

## Bagian

| Berkas | Isi |
|---|---|
| `extension/hidup/kenalAplikasi.js` | jendela → kategori |
| `extension/hidup/dunia.js` | lantai, tepi ngintip, zona larangan |
| `extension/hidup/fisika.js` | lompat, jatuh, lempar, rute antar lantai |
| `extension/hidup/pikiran.js` | kebutuhan, sifat, pemilihan kegiatan |
| `extension/hidup/atraksi.js` | ayunan, gelantungan, terjun payung, naik mobil |
| `extension/hidup/hayat.js` | siklus hidup, lapar, pup, kotor, sakit, meninggal, identitas (murni, `test-hayat.js`) |
| `extension/hidup/memoHidup.js` | badan di GNOME Shell |

## Uji & bila bermasalah

- `tests/semua.sh` menjalankan tes murni (dunia, fisika, pikiran — termasuk
  simulasi berjam-jam); `tests/gnome/uji-island.sh` menguji Memo hidup di
  GNOME Shell headless dengan jendela uji.
- Perubahan extension baru termuat sesudah logout/login.
- Tiga galat beruntun → Memo pulang dan jalan-jalan mati sampai login
  berikutnya. Cek: `journalctl --user -b | grep "dynamic-island] hidup"`.
