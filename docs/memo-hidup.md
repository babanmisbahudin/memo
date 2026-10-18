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

## Berkas & privasi

- `~/.config/memo/hidup.json`: sakelar, sifat, kebutuhan terakhir (supaya
  Memo berlanjut sesudah login ulang). `companion.json` lama tidak dipakai lagi.
- Judul jendela hanya dipakai di dalam extension untuk menebak jenis jendela;
  tidak disimpan dan tidak dikirim ke mana pun. Tidak ada AI di bagian ini.

## Bagian

| Berkas | Isi |
|---|---|
| `extension/hidup/kenalAplikasi.js` | jendela → kategori |
| `extension/hidup/dunia.js` | lantai, tepi ngintip, zona larangan |
| `extension/hidup/fisika.js` | lompat, jatuh, lempar, rute antar lantai |
| `extension/hidup/pikiran.js` | kebutuhan, sifat, pemilihan kegiatan |
| `extension/hidup/memoHidup.js` | badan di GNOME Shell |

## Uji & bila bermasalah

- `tests/semua.sh` menjalankan tes murni (dunia, fisika, pikiran — termasuk
  simulasi berjam-jam); `tests/gnome/uji-island.sh` menguji Memo hidup di
  GNOME Shell headless dengan jendela uji.
- Perubahan extension baru termuat sesudah logout/login.
- Tiga galat beruntun → Memo pulang dan jalan-jalan mati sampai login
  berikutnya. Cek: `journalctl --user -b | grep "dynamic-island] hidup"`.
