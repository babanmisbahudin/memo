# Fase 1 — Wajah Ekspresif

Tanggal: 2026-09-20
Status: menunggu review

## Tujuan

Maskot robot punya banyak ekspresi yang bisa dikendalikan dari luar lewat D-Bus,
tanpa AI apa pun. Setelah fase ini selesai, wajahnya sudah lengkap dan fase
berikutnya tinggal mengirim nama ekspresi.

## Lingkup

Termasuk:

- Mengganti dua kotak mata (`St.Widget`) dengan satu `St.DrawingArea` + Cairo
- Delapan ekspresi dengan transisi halus antar ekspresi
- Antarmuka D-Bus `org.himisbah.Robot` yang diekspor extension
- Perilaku "ekspresi sibuk memaksa mode DOT"

Tidak termasuk: AI, suara, hotkey, eksekusi perintah. Semua itu fase berikutnya.

## Wajah parametrik

Tiap ekspresi bukan gambar terpisah, melainkan satu set angka. Transisi antar
ekspresi = interpolasi tiap angka, jadi perubahan apa pun otomatis mulus tanpa
perlu menulis animasi khusus per pasangan ekspresi.

| Parameter | Rentang | Arti |
|---|---|---|
| `open` | 0–1 | Seberapa terbuka mata (0 = terpejam) |
| `curve` | −1–1 | Lengkung mata; positif = melengkung senang, negatif = sedih |
| `width` | 0.6–1.4 | Pengali lebar mata |
| `gazeX`, `gazeY` | −1–1 | Arah pandang, dipakai untuk mengikuti kursor |
| `tilt` | −1–1 | Kemiringan, satu mata naik satu turun (bingung) |
| `glow` | 0–1 | Kuat cahaya di sekitar mata |
| `hue` | 0–360 | Rona warna mata; 205 = biru-putih normal, 0 = merah error |
| `cross` | 0–1 | Kadar bentuk silang, dipakai ekspresi error |

Bentuk mata (bulat, busur, silang) tidak dipilih dengan percabangan keras,
melainkan digambar bertumpuk dengan alpha masing-masing dari `curve` dan `cross`.
Percabangan keras akan membuat bentuknya meloncat di tengah transisi; dengan cara
ini perpindahan bentuk apa pun tetap mulus.

## Daftar ekspresi

| Nama | Tampak | Animasi | Dipakai saat |
|---|---|---|---|
| `netral` | Dua bulatan, kedip acak | Mengikuti kursor | Diam (perilaku sekarang) |
| `mendengar` | Mata membesar, cahaya naik | Denyut lembut | Merekam suara pengguna |
| `berpikir` | Mata menyipit, pandangan ke atas | Pandangan berputar pelan | Menunggu jawaban Claude |
| `bicara` | Mata melengkung senang | Berkedip ringan seirama bicara | TTS sedang membaca |
| `senang` | Dua busur ke atas `^ ^` | Memantul sekali | Tugas berhasil |
| `bingung` | Satu mata lebih besar, kepala miring | Miring bolak-balik pelan | Tidak paham maksud |
| `error` | Dua silang, warna merah | Bergetar sekali | Perintah gagal |
| `tidur` | Dua garis datar | Naik-turun sangat pelan | Lama tidak dipakai |

## Cara menggambar

`St.DrawingArea` dengan sinyal `repaint`. Fungsi gambar dibuat murni:

```
drawFace(cr, lebar, tinggi, params)
```

Tidak membaca state apa pun dari luar — semua yang memengaruhi hasil masuk lewat
`params`. Ini membuatnya bisa diuji terpisah dan tidak bocor state antar frame.

**Menggambar ulang hanya saat perlu.** `queue_repaint()` dipanggil ketika ada
nilai parameter yang sedang berubah (transisi, kedip, denyut, atau kursor
bergeser). Saat ekspresi statis dan kursor diam, tidak ada repaint sama sekali —
penting supaya tidak membebani baterai, karena wajah ini tampil terus-menerus.

Ukuran titik dinaikkan sedikit dari 40×24 menjadi **44×26 px** supaya bentuk
silang dan busur masih terbaca.

## Antarmuka D-Bus

Nama `org.himisbah.Robot`, path `/org/himisbah/Robot`, dimiliki extension.

```
SetExpression(s nama, i durasiMs)   durasiMs = 0 berarti sampai diganti
Reset()                             kembali ke netral
property Expression (s, baca)
signal  ExpressionChanged(s nama)
```

Setelah `durasiMs` habis, wajah kembali ke `netral` — bukan ke ekspresi
sebelumnya. Panggilan `SetExpression` baru membatalkan hitungan mundur yang
sedang berjalan.

Nama ekspresi tidak dikenal → diabaikan, dicatat ke log, tidak melempar error.
Extension tidak boleh pernah crash gara-gara pemanggil yang salah.

## Hubungan dengan mode island yang sudah ada

Wajah hanya terlihat saat island dalam mode DOT. Aturannya:

- `mendengar`, `berpikir`, `bicara` — **memaksa** island ke mode DOT selama
  ekspresi aktif, supaya wajahnya kelihatan saat asisten sedang bekerja. Setelah
  selesai, island kembali mengikuti aturan normal.
- Ekspresi lain — hanya tampil kalau island memang sedang DOT. Kalau sedang PILL
  atau EVENT, ekspresi disimpan dan dipakai begitu kembali ke DOT.

Prioritas tampilan tetap: EVENT (notifikasi, media) menang atas wajah, karena
informasi itu lebih mendesak daripada ekspresi maskot.

## Pengujian

Tiga lapis, dari yang paling murah ke yang paling mahal.

**1. Tes unit logika parameter** — `gjs -m tests/test-face.js`, tanpa GNOME Shell
sama sekali. Menguji tabel ekspresi, interpolasi, penjepitan nilai, dan
penanganan nama tak dikenal. Hitungan detik per putaran.

**2. Verifikasi visual ke PNG** — `gjs -m tests/render-expressions.js` merender
kedelapan ekspresi ke berkas PNG memakai cairo langsung, tanpa GNOME Shell.
Bentuk tiap ekspresi bisa diperiksa dengan mata sebelum masuk ke shell sungguhan.
Ini yang menangkap "busurnya kebalik" atau "silangnya terlalu tipis".

**3. Tes integrasi di sesi headless** — `gnome-shell --headless --virtual-monitor`
seperti pengujian Dynamic Island sebelumnya, untuk hal yang hanya muncul di dalam
shell: alokasi widget di dalam panel, D-Bus, dan interaksi dengan mode island.

Tiap ekspresi dipicu manual tanpa perlu AI:

```
gdbus call --session --dest org.himisbah.Robot \
  --object-path /org/himisbah/Robot \
  --method org.himisbah.Robot.SetExpression "senang" 2000
```

Dijalankan di sesi headless terpisah (`gnome-shell --headless --virtual-monitor`)
seperti pengujian fase-fase Dynamic Island sebelumnya, supaya tidak perlu
logout tiap kali ada perubahan.

Yang diperiksa:

1. Kedelapan ekspresi tampil dan transisinya mulus, tanpa error di log
2. Ekspresi tidak dikenal tidak membuat shell error
3. `mendengar`/`berpikir`/`bicara` benar-benar memaksa mode DOT
4. Tidak ada repaint saat ekspresi statis dan kursor diam
5. Setelah extension dimatikan, panel kembali seperti semula

## Berkas yang disentuh

Semua di extension yang sudah ada,
`~/.local/share/gnome-shell/extensions/dynamic-island@local/`:

| Berkas | Status | Tanggung jawab |
|---|---|---|
| `face.js` | baru | Murni: tabel ekspresi, interpolasi, `drawFace()`. Tidak mengimpor St — inilah yang membuatnya bisa diuji tanpa GNOME Shell |
| `robotFace.js` | baru | Widget `St.DrawingArea` + penggerak animasi |
| `robotService.js` | baru | Ekspor D-Bus `org.himisbah.Robot` |
| `extension.js` | diubah | Island memakai `RobotFace` menggantikan dua kotak mata |
| `stylesheet.css` | diubah | Gaya `.dynamic-island-eye` dihapus, tidak dipakai lagi |
| `tests/test-face.js` | baru | Tes unit logika parameter |
| `tests/render-expressions.js` | baru | Merender 8 ekspresi ke PNG untuk diperiksa mata |

`extension.js` sekarang sudah ~590 baris; menumpuk wajah dan D-Bus di dalamnya
akan membuatnya sulit dibaca. Pemisahan ini juga yang memungkinkan lapis
pengujian 1 dan 2 — logika murni tidak boleh tercampur dengan kode yang butuh
GNOME Shell hidup.

Isi `~/Projects/asisten-robot/` selain `docs/` baru dibuat di Fase 2.

## Risiko

- **`St.DrawingArea` di dalam panel** belum pernah dicoba di setup ini. Kalau
  ukuran atau alokasinya bermasalah di dalam `St.BoxLayout`, rencana cadangannya
  adalah membungkusnya dengan lebar/tinggi tetap.
- **Waktu gambar** harus jauh di bawah satu frame. Pada kanvas 44×26 px ini
  seharusnya tidak jadi masalah, tapi tetap diukur saat pengujian.
