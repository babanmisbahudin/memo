# Layar Login & Kunci Piksel Menurut Waktu — Desain

Tanggal: 2026-10-19 · Status: diimplementasikan — pemakaian di [docs/layar-login.md](../../layar-login.md).

Layar login GDM dan layar kunci Memo memakai **gaya C**: pemandangan kota
piksel dari mesin sambutan + kartu sandi bergaya layar mini CRT (seperti
island & panel). Langitnya berganti menurut jam.

## Keputusan

| Topik | Keputusan |
|---|---|
| Bagian hari | pagi 04.00–10.59 · siang 11.00–14.59 · sore 15.00–17.59 · malam 18.00–03.59 (satu sumber: `extension/waktuPola.js`) |
| Gambar | 4 PNG 3072×1728 dirender sekali dari `sambutan/layar.js` (adegan "masuk" beku, tanpa teks/konfeti), di-commit, dicek ulang tes. Memo di 22% tinggi (di atas jam & kartu yang mulai di 1/3); malam Memo tidur + satu z |
| Layar kunci | extension `memo-kunci`: latar menurut jam sekarang (dicek tiap menit), animasi 12 fps (bintang berkelip, bintang jatuh, burung) sebagai aktor kecil di kisi latar, jam & tanggal huruf piksel, warna kartu per bagian. Tidak memakai `layar.js` langsung: modul itu memuat Gdk 4, yang tidak boleh dimuat gnome-shell |
| Layar login GDM | tema hanya CSS: `.login-dialog` memakai `file:///var/lib/memo/latar-login.png`; timer **sistem** (dipasang `pasang-gdm.sh`) mengarahkan tautan itu menurut jam saat boot dan pada 04/11/15/18 — timer sesi pengguna tidak cukup karena GDM tampil justru saat tidak ada yang login |
| Kartu | hitam fosfor, sudut siku, bingkai 2px, pendar dalam, huruf monospace. Kotak sandi = `login-dialog-prompt-layout` bagian dalam (kolom + pesan); avatar & nama di atasnya, avatar 96px |
| Warna kartu | GDM fosfor netral (CSS tidak tahu jam); layar kunci per bagian lewat kelas `memo-<bagian>` |
| Keamanan layar kunci | semua tambahan tidak reaktif, tanpa tombol/aksi |

## Komponen

| Berkas | Isi |
|---|---|
| `extension/waktuPola.js` | `bagianHari(jam)` (dipindah dari `sambutan/layar.js`, yang mengekspornya ulang) |
| `sambutan/layar.js` | opsi `tinggiMemo` |
| `login/gambar-latar.js` | render `latar-<bagian>.png` |
| `login/kunciPola.js` | murni: titik animasi per bingkai, warna per bagian, tanggal Indonesia |
| `login/extension.js` | aktor latar, animasi, jam piksel; impor dinamis `extension/` dari jalur asli symlink |
| `login/stylesheet.css` | kartu CRT, warna per bagian |
| `login/gdm-latar.css` | latar GDM (hanya tema GDM) |
| `login/latar-login.sh`, `memo-latar-login.{service,timer}` | pengganti tautan latar GDM |
| `login/bangun-gdm.sh`, `login/pasang-gdm.sh` | `MEMO_LATAR`/`MEMO_GDM_KELUAR`; pasang/lepas timer, tolak tema uji |
| `extension/crt.js` | huruf piksel menerima titik dua jam GNOME (U+2236) & spasi tipis |

## Pengujian

- gjs: `login/tests/test-kunci.js` (titik di kisi, bergerak, deterministik,
  jenis per bagian, bintang menjauhi Memo & jam, bintang jatuh & burung,
  tanggal); `test-crt.js` (jam GNOME); `test-layar.js` tetap lolos.
- `tests/test_login.py`: PNG = keluaran pembuatnya; `latar-login.sh` = 
  `waktuPola.js` untuk 24 jam, tautan dibuat, gagal aman bila gambar hilang;
  timer & layanan; CSS; aktor tidak reaktif; skrip bangun/pasang.
- GNOME headless (`uji-login.sh`): GDM memakai tautan latar dari
  `latar-login.sh`, kartu CRT; layar kunci: langit sesuai jam, urutan aktor,
  animasi ±12 bingkai/dtk, jam piksel = jam bawaan, tidak reaktif,
  disable/enable, timer berhenti saat dibuka; potret keempat bagian.
