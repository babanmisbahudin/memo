# Siklus Hidup Memo — Desain

Tanggal: 2026-10-19 · Status: tahap 1, 2, dan 3 diimplementasikan (pemakaian di [docs/memo-hidup.md](../../memo-hidup.md)); tahap 2b dst. belum.

Memo hidup (extension/hidup/) dikembangkan jadi makhluk dengan siklus hidup
ala Tamagotchi: lahir dari telur, tumbuh dari bayi sampai tua, punya
kebutuhan tubuh (lapar, pup, mandi), bisa sakit dan mati bila ditelantarkan,
punya nama & jenis kelamin & avatar, dan bisa berteman, menikah, serta punya
anak dengan Memo di laptop lain.

## Keputusan

| Topik | Keputusan |
|---|---|
| Platform | **Linux (GNOME) dulu**, di extension yang sekarang. Mac/Windows menyusul sesudah ini beres, sebagai aplikasi tersendiri; karena itu semua logika baru ditulis sebagai modul murni yang bisa dibawa |
| Lama hidup | **±5 bulan** waktu kalender dari telur sampai tua |
| Umur | berjalan menurut **kalender** (laptop mati pun Memo tetap bertambah umur) |
| Kematian | **bisa mati karena tua, dan karena ditelantarkan** |
| Keadilan penelantaran | lapar/kotor/sakit **hanya bertambah selama kamu login**; laptop mati atau tidur tidak dihitung. Sebelum mati selalu ada tahap **sakit** yang jelas terlihat + peringatan di island |
| Sambungan antar-laptop | **Wi-Fi yang sama dulu** (deteksi otomatis di jaringan lokal), kode pertemanan lewat internet menyusul |
| Jenis kelamin | laki-laki / perempuan, dipilih saat Memo lahir; membedakan suara (Ardi / Gadis, efek tiny robot sama) dan aksesori, bukan perilaku |
| Nama | bawaan **"Memo"**, bisa diganti kapan saja |

## Tahap hidup

| Tahap | Lama (kalender) | Badan | Bisa |
|---|---|---|---|
| Telur | sampai disentuh / ±1 menit | telur piksel bergoyang | menetas |
| Bayi | 2 hari | 60% ukuran, mata besar | tidur sering, merangkak (lompat kecil), sering lapar & pup |
| Balita | 6 hari | 70% | lompat, ngintip |
| Anak | 20 hari | 85% | semua kegiatan + atraksi |
| Remaja | 25 hari | 100% | kadang ngambek (menolak dipanggil sekali-sekali) |
| Dewasa | 60 hari | 100% | menikah, punya anak |
| Tua | 40 hari | 100%, sedikit merunduk, alis/janggut piksel | lebih lambat, lebih sering tidur, tanpa atraksi berat |
| Meninggal | — | "kembali ke bintang" | lihat [Kematian](#kematian) |

Total ±153 hari. Pergantian tahap dirayakan: animasi kecil + kabar di island
("Memo sekarang balita!").

## Kebutuhan tubuh

Ditambahkan ke kebutuhan yang sudah ada (energi, bosan, penasaran, rindu).
Laju di bawah = selama kamu login; bayi & balita 1,5× lebih cepat.

| Kebutuhan | Naik | Tanda di Memo | Cara memenuhi |
|---|---|---|---|
| **Lapar** | penuh dalam ±6 jam | mata sayu, ikon perut, pergi "mencari" ke dekat kursor | panel → **Makan** (nasi, buah, kue) — makanan piksel jatuh, Memo menghampiri & mengunyah |
| **Pup** | ±40–90 menit sesudah makan | gelisah sebentar, lalu kotoran piksel tertinggal di lantai | klik kotorannya untuk membersihkan |
| **Kotor / bau** | naik pelan, cepat bila ada kotoran yang tidak dibersihkan | garis bau piksel melayang, lalat kecil bila parah | panel → **Mandi**: busa & gelembung |
| **Sakit** | bila lapar penuh atau kotor penuh lebih dari 3 jam | wajah pucat, tidak mau main, island berkedip merah | panel → **Obat**, lalu kebutuhan yang menyebabkannya dipenuhi |

Kebahagiaan (dari elusan, main, ditemani, kebutuhan terpenuhi) memengaruhi
sifat yang tumbuh: Memo yang sering dielus cenderung manja, yang sering
dibiarkan main sendiri cenderung mandiri.

## Kematian

- **Karena ditelantarkan:** sakit dibiarkan **24 jam waktu login** →
  meninggal. Peringatan bertingkat sebelumnya: notifikasi saat mulai sakit,
  saat 12 jam, dan saat 2 jam tersisa.
- **Karena tua:** di akhir tahap Tua, dengan tenang (tidur lalu tidak bangun).
- Animasi "kembali ke bintang": Memo tertidur, cahaya naik ke tepi atas
  layar, jadi bintang kecil yang berkelip di island selama sehari.
- Sesudahnya: **Album kenangan** (nama, jenis kelamin, avatar, umur, sebab,
  tanggal) tetap tersimpan, lalu telur baru muncul untuk Memo berikutnya.
  Bila meninggal karena tua dan punya anak, anak itu yang melanjutkan.

## Lahir: wizard pertama

Muncul saat pertama kali dipasang (dan tiap telur baru), di panel:

1. **Nama** — bawaan "Memo".
2. **Jenis kelamin** — laki-laki / perempuan.
3. **Avatar** — 6 pilihan: warna badan (hitam klasik, putih, pink, biru,
   kuning, hijau) × bentuk mata (kotak LED klasik, bulat, sipit). Aksesori
   kecil per jenis kelamin (topi / pita), bisa dimatikan.
4. Telur muncul di desktop → klik untuk menetas.

Avatar tetap pixel-art dan memakai face.js; warna badan dan bentuk mata jadi
parameter baru wajah.

## Teman, menikah, anak (Wi-Fi yang sama)

Jaringan tidak boleh berjalan di proses gnome-shell (aturan arsitektur.md),
jadi dikerjakan layanan pengguna baru **`memo-teman`** (Python, seperti
memo-agen), yang bicara dengan extension lewat berkas di `/dev/shm` seperti
layanan lain.

- **Menemukan:** pengumuman UDP di jaringan lokal (port tetap), hanya berisi
  nama, jenis kelamin, tahap, avatar. Tidak ada judul jendela, nama
  aplikasi, atau data laptop apa pun.
- **Kenalan:** kamu klik Memo lain di panel → kedua laptop menampilkan kode 4
  angka yang sama → keduanya harus menyetujui. Tanpa persetujuan dua pihak
  tidak ada yang tersambung. Teman disimpan di `~/.config/memo/teman.json`.
- **Berkunjung:** Memo teman bisa muncul sebagai tamu di layarmu (NPC kedua,
  hanya jalan-jalan & main bersama, tidak mengintip jendela), lalu pulang.
- **Menikah:** keduanya dewasa, sudah berteman ≥ 7 hari, kedua pemilik
  setuju. Animasi pernikahan kecil (hati, konfeti).
- **Anak:** sesudah menikah, sesekali telur muncul (keduanya setuju dulu).
  Warna & sifat anak campuran kedua induk, jenis kelamin acak; telur menetas
  di salah satu laptop yang dipilih bersama.
- Internet (kode pertemanan untuk teman jauh) menyusul di tahap terpisah.

## Produktivitas: Journey, Habits, Ceklis

Memo juga jadi teman produktif. Popup **Target** bergaya CRT yang sama
dengan panel: tab baru `target` di panel (beranda · riwayat · chat · target ·
atur), dibuka juga dengan **Super+J** atau tombol papan klip kecil yang
dipegang Memo saat ada yang jatuh tempo.

| Bagian | Isi |
|---|---|
| **Journey** (target pokok) | target besar, mis. "Rilis onlineshop", "Lulus sertifikasi": judul, alasan singkat, tenggat (boleh kosong), dan langkah-langkah (milestone) dengan batang kemajuan piksel. Satu journey bisa ditandai **fokus** dan tampil di Beranda |
| **Habits** | kebiasaan harian/mingguan (mis. "olahraga 15 menit", "baca 10 halaman"), jam pengingat opsional, **streak** dan kalender titik 30 hari |
| **Ceklis** | daftar tugas hari ini; tiap tugas boleh ditautkan ke langkah sebuah journey. Yang belum selesai pindah ke besok |

- **Pengingat:** pada jam habit atau tenggat, Memo muncul membawa papan klip
  dan island menampilkan kabar singkat; tidak berbunyi saat kamu sedang
  layar penuh / rapat.
- **Ringkasan:** Beranda menampilkan journey fokus + kemajuannya, habit hari
  ini, dan sisa ceklis. Pagi pertama login: Memo menyapa dengan rencana hari
  ini; malam: rekap singkat.
- **Kaitan dengan Memo:** menyelesaikan ceklis/habit membuat Memo senang
  (emote, hati) dan memberi **koin**; koin untuk makanan spesial dan aksesori
  avatar. Streak 7/30/100 hari dirayakan. Sebaliknya, **target yang terlewat
  tidak membuat Memo lapar, sakit, atau mati** — produktivitas tidak boleh
  jadi rasa bersalah.
- **Grafik** (pixel-art, gaya CRT): habit = kalender titik 30 hari +
  batang mingguan per habit; ceklis = batang selesai per hari (7/30 hari);
  journey = batang kemajuan per langkah + garis kemajuan terhadap tenggat
  (di depan / tertinggal); ringkasan mingguan = persen habit terpenuhi &
  koin. Digambar Cairo seperti panel lain, datanya dari `targetPola.js`.
- **Data** sumbernya milik Memo sendiri: `~/.config/memo/target.json`
  (tidak dikirim ke mana pun, tidak dibagikan ke teman Memo). Bisa dipakai
  penuh tanpa aplikasi lain.

### Penyambung (opsional)

Sistem target berdiri sendiri; penyambung bisa dinyalakan satu per satu di
**atur → Penyambung**. Tiap penyambung modul kecil dengan bentuk yang sama
(`baca()`, `tulis()`), jadi yang lain mudah ditambah.

| Penyambung | Cara | Arah |
|---|---|---|
| **Obsidian** | satu folder pilihanmu di vault (bawaan `Memo/`): `Journey/<judul>.md` (tujuan, tenggat, langkah sebagai `- [ ]`), `Habits.md` (tabel streak), dan ceklis hari ini sebagai `- [ ]` di catatan harian `Memo/Harian/YYYY-MM-DD.md` | **dua arah**: mencentang `- [x]` di Obsidian ikut menandai selesai di Memo, dan sebaliknya. Memo hanya membaca/menulis folder itu, tidak menyentuh catatan lain |
| **Kalender (.ics)** | berkas `~/.local/share/memo/target.ics` berisi tenggat journey & jam habit | satu arah (Memo → aplikasi kalender apa pun yang bisa langganan berkas .ics, termasuk GNOME Calendar) |
| **Ekspor** | CSV / JSON riwayat habit & ceklis | satu arah, untuk spreadsheet |
| nanti | Google Calendar, Notion, Todoist | lewat internet, tahap terpisah |

Bentrok dua arah (diubah di dua tempat sebelum tersinkron): yang terakhir
diubah menang, dan perubahan yang kalah dicatat di riwayat supaya tidak
hilang diam-diam. Sinkron berjalan di layanan pengguna (bukan di
gnome-shell) tiap ada perubahan berkas + tiap 5 menit.
- Modul murni `extension/targetPola.js` (journey, langkah & kemajuan,
  streak, pergantian hari, pindah tugas ke besok, koin) diuji `test-target.js`.

## Bagian & urutan pengerjaan

| Tahap | Isi | Berkas |
|---|---|---|
| 1 | siklus & tahap umur, lapar/pup/kotor/sakit/mati, simpan & muat, album | `extension/hidup/hayat.js` (murni) + `pikiran.js` |
| 2 | wizard lahir (nama, jenis kelamin, avatar), telur, panel Makan/Mandi/Obat, kotoran & makanan di desktop | `memoHidup.js`, `panel.js`, `face.js` |
| 2b | tab **target**: journey, habits, ceklis, pengingat, koin, grafik | `extension/targetPola.js` (murni), `panel.js`, `extension.js` |
| 2c | penyambung: Obsidian (dua arah), .ics, ekspor CSV/JSON | `bin/memo-sambung.py` + `bin/sambung_obsidian.py` (murni, diuji) |
| 3 | tampilan per tahap (ukuran, alis tua, aksesori), animasi naik tahap & kembali ke bintang | `face.js`, `gerakPola.js`, `atraksi.js` |
| 4 | layanan `memo-teman`: menemukan, kenalan, berkunjung | `bin/memo-teman.py`, `memoHidup.js` |
| 5 | menikah & anak | `memo-teman.py`, `hayat.js` |
| nanti | kode pertemanan via internet; versi Mac/Windows | proyek terpisah |

## Data

`~/.config/memo/hidup.json` diperluas: `nama`, `kelamin`, `avatar`, `lahir`
(tanggal), `tahap`, kebutuhan tubuh, `sakitSejak`, `album` (Memo yang sudah
meninggal), `pasangan`. Data lama (tanpa field ini) dianggap Memo dewasa
yang baru lahir hari ini supaya Memo yang sekarang tidak mendadak jadi bayi.

## Pengujian

- gjs murni `test-hayat.js`: tahap per tanggal, laju kebutuhan, waktu
  laptop mati tidak menambah penelantaran, sakit → mati tepat 24 jam login,
  meninggal karena tua, pewarisan sifat & warna anak, muat data lama.
- `memo-teman`: dua layanan di satu mesin pada jaringan uji (loopback),
  kenalan butuh persetujuan dua pihak, pesan tidak memuat data jendela.
- GNOME headless: wizard, telur menetas, makan/pup/bersihkan/mandi, tamu
  muncul & pulang.
