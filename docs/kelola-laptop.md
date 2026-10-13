# Memo mengelola laptop

Ketik di tab Chat island (atau ucapkan lewat Super+Shift+M):

| Kalimat | Yang terjadi |
|---|---|
| `buka youtube`, `bukain gmail dong`, `buka github.com/anthropics` | situs dibuka di browser bawaan |
| `putar lofi di youtube`, `buka youtube tutorial flutter` | pencarian YouTube |
| `cari resep rendang di google`, `googling harga ram` | pencarian Google |
| `buka terminal`, `buka vs code`, `buka pengaturan`, `buka spotify` | aplikasi dibuka (nama lain dicari lewat pencarian aplikasi GNOME) |
| `buka folder memo`, `buka downloads`, `buka folder ~/Pictures` | folder dibuka di Berkas |
| `buka terminal di folder memo` | terminal baru di folder itu |

Nama folder dicari di home, `~/Projects`, Dokumen, Desktop, dan Unduhan (huruf
besar dan tanda hubung tidak dipersoalkan: `lebihteratur api` →
`~/Projects/lebihteratur-api`). Folder umum mengikuti `~/.config/user-dirs.dirs`.

## Dua jalur, dua aturan

1. **Kalimat yang dikenali langsung** (`bin/aksi_pola.py`, tanpa AI): instan
   dan langsung dijalankan, sama seperti mengklik peluncur — ini perintah
   pengguna sendiri, dipetakan tanpa tebakan.
2. **Usulan AI** (field `aksi` di jawaban `otak.py`) untuk kalimat lain ("aku
   pengen nonton video kucing lucu"): divalidasi (`aksi_pola.dari_ai`: situs
   hanya `https?://`, folder harus ada, nama aplikasi tanpa karakter aneh),
   lalu **baru jalan setelah diklik Izinkan** di kartu izin island — aturan
   yang sama dengan perintah shell usulan AI.

Nama aplikasi tebakan dari jalur 1 yang tidak ketemu (`buka puasa`)
diserahkan ke AI, bukan dijawab "tidak ketemu".

## Peluncuran

`bin/aksi_laptop.py` memanggil `org.himisbah.Robot.Buka(jenis, target)` di
extension (`extension/bukaLaptop.js`). Dari dalam GNOME Shell, konteks
peluncurannya memberi token aktivasi, jadi jendela baru langsung tampil di
depan dan panel Memo ditutup. Extension memvalidasi ulang semuanya.

Bila extension belum memuat metode itu (versi lama sampai logout/login),
dipakai cadangan `gio open` / `gtk-launch` / `ptyxis -d` dari `memo-suara`:
tetap terbuka, hanya mungkin muncul sebagai notifikasi "… siap".

Coba dari terminal: `bin/aksi_laptop.py buka folder memo`.

## Uji

- `tests/test_aksi.py`: pengenal kalimat, validasi usulan AI, pelaksana
  (gdbus/gio dipalsukan), dan alur `memo-suara` (langsung vs kartu izin).
- `tests/gnome/uji-island.sh`: `Buka` sungguhan di GNOME Shell headless dengan
  aplikasi pembuka palsu sebagai bawaan http/https/folder, plus penolakan
  `file://`, `javascript:`, folder yang tidak ada, dan jenis asing.
