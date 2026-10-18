# Sambutan Memo

Layar sambutan untuk login dan menu daya, menggantikan `hallo-baban`
(`~/.local/share/hallo-baban/` + extension `baban-power-greeting@local`).

Layar penuh dan bergaya piksel. Island hitam di tepi atas layar membesar
sampai memenuhi layar (Memo ikut membesar di dalamnya), lalu menyala jadi
adegan: langit ber-dither menurut jam, bintang berkelip, bulan/matahari,
siluet kota yang lampunya menyala atau padam, Memo besar di tengah, judul
huruf piksel yang diketik, dan batang hitung mundur. Semua melangkah 12 kali
per detik dan terkunci ke petak (±108 petak setinggi layar), gradasinya pakai
dither Bayer — sama dengan aturan gerak piksel island.

| Berkas | Isi |
|---|---|
| `sambutan/sambutan.js` | jendela GTK layar penuh transparan, input, aksi gnome-session |
| `sambutan/layar.js` | adegan: murni Cairo + GdkPixbuf, bisa direkam tanpa GNOME |
| `sambutan/hurufPiksel.js` | huruf piksel 5×7 |

Wajah Memo memakai langsung `extension/face.js` dan gerak
`extension/gerakPola.js` (tidak disalin). Wajah dirender halus lalu dicuplik
di tengah tiap petak, jadi LED mata tetap kotak tajam (bukan abu-abu belang
hasil antialias yang diperbesar).

| Jenis | Kapan | Adegan | Penutup | Aksi gnome-session |
|---|---|---|---|---|
| `masuk` | autostart setelah login | langit menurut jam (pagi fajar, siang biru berawan, sore matahari synthwave, malam bulan), Memo bangun, konfeti, jam & tanggal | mengecil kembali jadi island | — |
| `keluar` | Log Out | ikon logout di mata Memo, Memo melambai, hati melayang | iris menutup ke Memo, Memo berkedip | `Logout(1)` (tanpa dialog) |
| `restart` | Restart | ikon restart, cincin berputar, Memo oleng lalu pusing, lampu kota berkedip | glitch lalu layar CRT padam | `RequestReboot()` |
| `matikan` | Power Off | ikon daya, Memo mengantuk lalu tidur, Z, bintang jatuh, lampu kota padam satu per satu | layar CRT padam: pita → garis → titik | `RequestShutdown()` |
| `tidur` | Suspend | Memo tertidur, Z, lampu kota meredup | larut ke gelap, mata Memo terakhir | `Suspend()` |

Esc membatalkan — juga selagi animasi penutup belum selesai (penutup apa pun
berganti jadi island yang mengecil, desktop kembali). Klik atau tombol lain
melanjutkan lebih cepat, dan tanpa apa-apa aksi berjalan sendiri setelah
±3–4 detik. Sesudah Log Out / Restart / Power Off berhasil diminta, layar
dibiarkan hitam (paling lama 8 detik, klik/tombol menutupnya) supaya desktop
tidak sempat muncul lagi sebelum sesi padam. Suspend tidak ditahan, supaya
sesudah bangun tidak ada layar hitam tersisa.

## Kenapa lewat D-Bus gnome-session

Sambutan lama memanggil `gnome-session-quit --power-off --no-prompt`, padahal
`--no-prompt` hanya berlaku untuk `--logout`; Power Off dan Restart masih bisa
memunculkan dialog hitung mundur GNOME sesudah sambutan. `RequestShutdown` /
`RequestReboot` adalah varian tanpa dialog, dan sesi tetap menutup aplikasi
dengan rapi (beda dengan `systemctl poweroff`).

## Menu daya

`extension/sambutanSistem.js` mengganti `activateLogout`, `activateRestart`,
`activatePowerOff`, dan `activateSuspend` milik `SystemActions` (yang dipanggil
menu Pengaturan Cepat) supaya membuka sambutan dulu. Pengamannya:

- `sambutan/sambutan.js` tidak ada, gagal dijalankan, atau keluar dengan galat
  → aksi bawaan GNOME (dengan dialognya) yang dipanggil. Tombol daya tidak
  pernah diam saja.
- Penanda `~/.config/memo/tanpa-sambutan` → aksi bawaan. Dicek tiap klik, jadi
  berlaku tanpa login ulang.
- `disable()` mengembalikan metode asli.

## Pasang / lepas

```
bin/memo-pasang.py sambutan          # tampilkan diff, minta konfirmasi
bin/memo-pasang.py sambutan --lepas  # kembali ke bawaan GNOME
bin/memo-pasang.py status
```

Pasang menulis `~/.config/autostart/memo-sambutan.desktop`, menambah
`Hidden=true` ke `hallo-baban.desktop` (cadangan `*.memo-*.bak`, berkas tidak
dihapus), dan menonaktifkan `baban-power-greeting@local` agar dua extension
tidak sama-sama mengganti menu daya. Extension Memo yang baru termuat setelah
logout/login. `--lepas` menghapus autostart Memo, membuang `Hidden=true`, dan
menulis penanda `tanpa-sambutan`.

## Coba

```
gjs -m sambutan/sambutan.js matikan --uji   # tampil, tapi tidak mematikan apa pun
gjs -m sambutan/tests/test-layar.js         # rekam bingkai tanpa GNOME & periksa
```

`test-layar.js` (ikut `tests/semua.sh`) merekam tiap jenis bingkai demi
bingkai: island kecil di awal lalu layar penuh tanpa celah, langit terkunci ke
petak, penutup berakhir hitam (atau kosong untuk login dan batal), Esc menyela
penutup, dan semua teks untuk tiap jam/hari/bulan tertulis dengan huruf piksel.

`tests/gnome/uji-island.sh` menjalankan kelima jenis di GNOME Shell headless,
menekan Esc lewat keyboard virtual, dan memanggil `SystemActions` sungguhan
(shell uji memakai `MEMO_SAMBUTAN_UJI=1`, jadi sambutan selalu `--uji`).
