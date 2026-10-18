# Island & Panel Gaya CRT — Desain

Tanggal: 2026-10-18 · Status: desain disetujui (mockup di sesi rancang), belum ada kode.

Island Memo dan tampilan penuhnya (panel) dirombak ke **gaya C: layar mini
CRT** — layar retro kecil bersudut bertangga piksel, garis scanline tipis,
pendar fosfor berwarna menurut keadaan, teks huruf piksel yang menyala.
Panel sekaligus dibuat lebih berfungsi: status Memo hidup, riwayat kabar &
agen, pintasan cepat, dan chat yang lengkap.

## Keputusan

| Topik | Keputusan |
|---|---|
| Gaya | C — layar mini CRT, untuk island **dan** panel |
| Teknik gambar | Cairo (St.DrawingArea), sama dengan mesin piksel sambutan. Bukan shader GPU (berisiko di Iris Xe), bukan CSS biasa (tidak bisa scanline/sudut bertangga) |
| Huruf | Huruf piksel Memo untuk judul, status, tab, tombol, teks berjalan island; huruf biasa untuk teks panjang (jawaban chat, isi kabar). Teks yang memuat huruf di luar huruf piksel jatuh ke huruf biasa, bukan tanda tanya |
| Warna keadaan | diam = rona wardrobe (bawaan hijau fosfor) · agen bekerja = biru · izin menunggu = kuning · galat = merah |
| Tab panel | Beranda · Riwayat · Chat · Atur (tab "+" lama dilebur ke Chat & pintasan) |
| Fungsi baru | status Memo hidup, riwayat kabar & agen hari ini, pintasan cepat, chat lengkap |

## Island

- Bentuk tetap menempel di tepi atas; sudut bawah bertangga piksel (4 anak
  tangga × 2 px), latar hitam fosfor `#050608`, scanline tiap 4 px, pendar
  dalam berwarna keadaan.
- Teks berjalan (`claude · toko — checkout.js +2 −1`, kabar, izin) dalam huruf
  piksel bercahaya.
- Gerak: diam → statis (tanpa timer); agen bekerja → satu garis terang
  menyapu turun 12×/dtk; izin menunggu → pendar berdenyut 2×/dtk.
- Memo sedang keluar (Memo hidup) → mata redup seperti sekarang.
- Perbaikan sekalian: timer island berhenti saat aktor dihancurkan (shell
  dimatikan tanpa `disable()` sekarang memunculkan puluhan `Gjs-CRITICAL`).

## Panel (640 px, turun dari island)

Latar seluruh panel = layar CRT yang sama (sudut bawah bertangga, scanline,
pendar keadaan). Baris atas: tab piksel kiri, jam di tengah (klik = kalender
bawaan), ikon sistem (klik = Pengaturan Cepat) & sakelar suara di kanan.

**Beranda**
- Kiri — *Memo*: wajah Memo besar, "memo: sedang apa" (kegiatan Memo hidup,
  atau "di island" / "jalan-jalan mati"), empat batang kebutuhan piksel
  (energi, bosan, penasaran, rindu), tombol Panggil · Pulang · Jalan-jalan.
- Kanan — *perhatian*: kartu yang ada sekarang (izin agen, sesi berjalan,
  selesai, layanan) + kisi pill sesi/layanan.
- Bawah — *pintasan*: sampai 5 tombol + "tambah". Bawaan: YouTube, Obsidian,
  proyek memo, terminal, Unduhan. Disimpan di `~/.config/memo/pintasan.json`
  (`[{nama, jenis: url|aplikasi|folder|terminal, target}]`), dibuka lewat
  `bukaLaptop.buka()` yang sudah memvalidasi. "Tambah" membuka berkas itu di
  penyunting bawaan.

**Riwayat**
- Semua yang lewat hari ini, terbaru di atas, bisa digulir; saringan Semua /
  Agen / Kabar / Notifikasi.
- Dicatat: notifikasi (LebihTeratur = kabar), agen selesai/galat, izin baru &
  jawabannya. Volume/baterai/Wi-Fi tidak dicatat.
- Baris agen bisa membuka folder proyeknya; kabar ber-URL membuka tautannya.
- Disimpan di `~/.cache/memo/riwayat.json` (maks 200, hanya hari ini yang
  ditampilkan), ditulis tertunda 5 dtk sesudah berubah.

**Chat**
- Gelembung kamu/Memo yang bisa digulir (50 terakhir), otomatis ke bawah.
- Baris status: Memo sedang apa · otak AI.
- Masukan: kotak tanya, Lampirkan (zenity, seperti tab "+" lama, dengan tanda
  lampiran aktif), mikrofon, kirim; tindakan cepat lama jadi tombol kecil.

**Atur** — isi sama dengan sekarang, ikut bergaya CRT.

## Komponen

| Berkas | Isi |
|---|---|
| `extension/hurufPiksel.js` | dipindah dari `sambutan/` (extension dimuat lewat symlink, jadi tidak bisa mengimpor `../sambutan`); tambah tanda baca yang sering muncul |
| `extension/crt.js` | murni Cairo: jalur bersudut tangga, latar CRT, teks piksel bercahaya, normalisasi teks |
| `extension/widgetCrt.js` | St: `LatarCrt`, `LabelPiksel` (punya `.text`), `BatangPiksel` |
| `extension/riwayatPola.js` | murni: catatan riwayat (tambah, saring, hari ini, simpan/muat) |
| `extension/extension.js` | island memakai `LatarCrt` + `LabelPiksel`; catat riwayat; timer aman |
| `extension/panel.js` | tab baru, Beranda/Riwayat/Chat baru, latar CRT |
| `extension/hidup/memoHidup.js` | getter `kegiatan`, `kebutuhan` untuk Beranda |
| `extension/stylesheet.css` | gaya CRT untuk panel |

## Pengujian

- gjs murni: `test-crt.js` (sudut tangga transparan, latar hitam, pendar
  berwarna, scanline, teks piksel, normalisasi), `test-riwayat.js` (urutan,
  saring, batas 200, hari berganti, simpan/muat, duplikat beruntun).
- `sambutan/tests/test-layar.js` tetap lolos sesudah huruf piksel dipindah.
- GNOME headless: semua uji lama tetap lolos; baru: tab Riwayat menampilkan
  notifikasi & agen selesai, pintasan membuka lewat pembuka palsu, Beranda
  menampilkan kegiatan Memo hidup, chat menampilkan > 4 pesan; tangkapan
  layar island (diam/bekerja/izin) & tiap tab diperiksa mata.
