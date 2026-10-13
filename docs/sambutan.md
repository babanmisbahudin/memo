# Sambutan Memo

Layar sambutan untuk login dan menu daya, menggantikan `hallo-baban`
(`~/.local/share/hallo-baban/` + extension `baban-power-greeting@local`).

Bentuknya sama dengan island Memo yang membesar: kartu hitam turun dari tepi
atas layar, isinya Memo piksel besar dengan gerak dan partikel yang sama
persis dengan di island. `sambutan/sambutan.js` memakai langsung
`extension/face.js` dan `extension/gerakPola.js` (tidak disalin), wajah
dirender 44×26 lalu diperbesar ×6 dengan filter *nearest*, jadi tetap pecah
piksel.

| Jenis | Kapan | Aksi gnome-session |
|---|---|---|
| `masuk` | autostart setelah login | — |
| `keluar` | Log Out | `Logout(1)` (tanpa dialog) |
| `restart` | Restart | `RequestReboot()` |
| `matikan` | Power Off | `RequestShutdown()` |
| `tidur` | Suspend | `Suspend()` |

Esc membatalkan, klik atau tombol lain melanjutkan lebih cepat, dan tanpa
apa-apa aksi berjalan sendiri setelah ±3 detik.

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
```

`tests/gnome/uji-island.sh` menjalankan kelima jenis di GNOME Shell headless,
menekan Esc lewat keyboard virtual, dan memanggil `SystemActions` sungguhan
(shell uji memakai `MEMO_SAMBUTAN_UJI=1`, jadi sambutan selalu `--uji`).
