# Island & panel gaya layar mini CRT

Island Memo dan panelnya tampil sebagai layar retro kecil: hitam fosfor,
sudut bawah bertangga piksel, scanline tipis, pendar berwarna, dan teks huruf
piksel yang menyala. Desain: [spec](superpowers/specs/2026-10-18-island-crt-design.md).

## Warna island

| Keadaan | Warna | Gerak |
|---|---|---|
| Diam | rona wardrobe (bawaan hijau fosfor; "musiman" mengikuti bulan) | statis, tanpa timer |
| Agen bekerja | biru | garis terang menyapu turun |
| Izin menunggu | kuning | pendar berdenyut |
| Galat | merah | statis |

Teks berjalan memakai huruf piksel Memo; teks yang memuat emoji/aksara di luar
huruf piksel tampil dengan huruf biasa.

## Panel (Super+M)

| Tab | Isi |
|---|---|
| **beranda** | panggung Memo (badan utuh + animasi rawat), nama · tahap · kegiatan, batang lapar/kotor/energi/bosan, panggil · pulang · jalan, makan · tidur · mandi · cebok · obat; status agen + kartu izin/sesi/selesai/layanan + pill (hanya layanan yang aktif), pintasan cepat |
| **riwayat** | semua kabar & agen hari ini, terbaru di atas; saring semua/agen/kabar/notifikasi; tombol folder untuk sesi agen |
| **chat** | obrolan bergulir (50 terakhir), status & otak AI, tindakan cepat, lampiran, mikrofon, kirim |
| **atur** | otak AI, wardrobe, jalan-jalan, sifat Memo, demo, folder suara |

Jam (klik = kalender & notifikasi bawaan) dan ikon sistem (klik = Pengaturan
Cepat) ada di kanan baris atas.

## Pintasan

`~/.config/memo/pintasan.json` — tombol **+ tambah** membukanya (dibuat dari
bawaan bila belum ada). Paling banyak 5:

```json
[
  { "nama": "YouTube", "jenis": "url", "target": "https://www.youtube.com" },
  { "nama": "Admin LT", "jenis": "url", "target": "https://alamat-admin-anda" },
  { "nama": "Proyek Memo", "jenis": "folder", "target": "~/Projects/memo" },
  { "nama": "Terminal", "jenis": "terminal", "target": "~" },
  { "nama": "Obsidian", "jenis": "aplikasi", "target": "obsidian.desktop\n?obsidian" }
]
```

`jenis`: `url` (hanya http/https), `aplikasi`, `folder`, `terminal`. Dibuka
lewat `bukaLaptop.buka()` yang memvalidasi ulang. Berkas rusak → pintasan
bawaan; larik kosong → tanpa pintasan.

## Berkas

| Berkas | Isi |
|---|---|
| `extension/crt.js` | gambar latar CRT & teks piksel bercahaya (murni, `test-crt.js`) |
| `extension/widgetCrt.js` | `LatarCrt`, `LabelPiksel`, `BatangPiksel` |
| `extension/hurufPiksel.js` | huruf piksel 5×7 (dipakai juga animasi sambutan) |
| `extension/riwayatPola.js` | riwayat hari ini (murni, `test-riwayat.js`) → `~/.cache/memo/riwayat.json` |
| `extension/pintasanPola.js` | pintasan (murni, `test-pintasan.js`) |

Perubahan extension termuat sesudah logout/login. Uji tanpa logout:
`tests/gnome/uji-island.sh` (tangkapan layar island & tiap tab disimpan bila
`UJI_SIMPAN=1`).
