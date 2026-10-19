# Layar login & layar kunci Memo

Dua layar yang berbeda sumbernya, satu desain (`login/stylesheet.css`):
pemandangan piksel yang berganti menurut jam, dan kartu sandi bergaya layar
mini CRT seperti island & panel Memo. Desain:
[spec](superpowers/specs/2026-10-19-login-piksel-design.md).

| Layar | Kapan terlihat | Dari mana gayanya | Pasang |
|---|---|---|---|
| Layar kunci | setelah 15 menit diam, Super+L | extension `memo-kunci@local` (folder `login/`) | `bin/memo-pasang.py kunci`, tanpa sudo |
| Layar login GDM | setelah Log Out (login otomatis aktif, jadi tidak saat boot) | `gdm-theme.gresource` = Yaru + stylesheet Memo + latar menurut jam | `login/bangun-gdm.sh` lalu `sudo login/pasang-gdm.sh` |

## Pemandangan menurut jam

| Bagian | Jam | Langit | Memo |
|---|---|---|---|
| pagi | 04.00–10.59 | fajar ungu-jingga, matahari, awan | bangun |
| siang | 11.00–14.59 | biru, matahari, awan putih | bangun |
| sore | 15.00–17.59 | senja, matahari synthwave di balik kota | bangun |
| malam | 18.00–03.59 | bulan, bintang, lampu kota | tidur |

Batas jamnya satu sumber: `extension/waktuPola.js` (dipakai juga animasi
sambutan); `login/latar-login.sh` memakai batas yang sama dan
`tests/test_login.py` mencocokkan keduanya untuk tiap jam.

Gambar `login/latar-<bagian>.png` (1920×1080 = layar fisik laptop ini, skala
1,25, jadi tampil 1:1 tanpa kabur) dirender `login/gambar-latar.js` dari mesin
adegan sambutan: adegan "masuk" dibekukan tanpa teks, Memo di seperempat atas
layar supaya jam dan kartu sandi (mulai sepertiga tinggi) ada di bawahnya.

```
gjs -m login/gambar-latar.js malam login/latar-malam.png    # [lebar tinggi]
```

## Layar kunci

`login/` sekaligus folder extension `memo-kunci@local` dengan
`session-modes: ["user", "unlock-dialog"]`, jadi stylesheet-nya tetap dimuat
saat terkunci. `extension.js` menambah aktor saat dialog kunci dibuat:

- pemandangan bagian hari sekarang, menutupi latar blur bawaan; diperiksa
  ulang tiap menit, jadi berganti sendiri pada pergantian bagian hari;
- animasi 12 fps di kisi piksel latarnya (`login/kunciPola.js`): bintang
  berkelip (pagi sedikit, malam banyak), bintang jatuh (sore & malam), burung
  lewat (pagi & siang). Bintang menjauhi wajah Memo dan kolom jam;
- jam & tanggal huruf piksel Memo (tanggal berbahasa Indonesia, mis.
  "senin, 19 oktober") menggantikan label jam bawaan, berwarna cahaya langit;
- kelas `memo-<bagian>` pada dialog, yang mewarnai bingkai & teks kartu sandi
  menurut langit (jingga, biru, merah muda, ungu).

Semuanya tidak reaktif; extension ini tidak menambah tombol atau aksi apa pun
ke layar kunci (yang tampil di sana bisa disentuh siapa saja). Timer animasi
berhenti saat layar dibuka atau extension dimatikan.

Huruf piksel diambil dari `extension/widgetCrt.js`. Karena folder ini
dipasang sebagai symlink ke `repo/login`, `extension.js` membaca jalur asli
symlink-nya lalu mengimpor modul `extension/` secara dinamis; memasang
`login/` dengan disalin (bukan `memo-pasang.py kunci`) membuat layar kunci
kembali ke tampilan bawaan.

## Layar login GDM

```
login/bangun-gdm.sh            # -> login/build/gdm-theme.gresource
sudo login/pasang-gdm.sh       # tema + latar menurut jam
sudo login/pasang-gdm.sh --lepas
```

`bangun-gdm.sh` membongkar gresource Yaru asli, menempelkan
`stylesheet.css` dan `gdm-latar.css` di belakang `gdm.css`, dan menyertakan
`memo-*.png`. Selalu dari berkas Yaru asli, bukan dari alternatif yang
sedang aktif. Butuh `glib-compile-resources` (`sudo apt install
libgio-2.0-dev-bin`; bila tidak ada, salinan di snap core dipakai). Bangun
ulang setelah pembaruan besar GNOME/Yaru, karena isi Yaru ikut tersalin.

Tema GDM hanya CSS, tidak bisa membaca jam. Jadi `gdm-latar.css` memasang
satu berkas tetap, `/var/lib/memo/latar-login.png`, dan timer sistem
`memo-latar-login.timer` mengarahkan tautan itu ke `latar-<bagian>.png` saat
boot dan pada 04.00, 11.00, 15.00, 18.00 (juga yang terlewat saat laptop
mati atau tidur). Karena timer sistem, latarnya tetap benar walau tidak ada
yang login. Warna kartu di GDM fosfor netral (warna per bagian hanya di
layar kunci).

`pasang-gdm.sh`:

| Apa | Ke mana |
|---|---|
| tema | `/usr/local/share/gnome-shell/theme/memo/`, lewat `update-alternatives` prioritas 0 lalu dipilih manual (berkas Yaru tidak disentuh) |
| latar-*.png | `/usr/local/share/memo/login/` |
| latar-login.sh | `/usr/local/lib/memo/` |
| unit timer & layanan | `/etc/systemd/system/`, layanan hanya boleh menulis `/var/lib/memo` |

Tema yang dibangun untuk uji (`MEMO_LATAR` lain) ditolak. `--lepas`
mengembalikan Yaru dan menghapus semua yang di atas.

Bila layar login rusak: Ctrl+Alt+F3, masuk, lalu

```
sudo update-alternatives --auto gdm-theme.gresource
```

## Avatar

Avatar bawaan (akun ini tidak punya foto profil) diganti wajah Memo piksel di
layar mini; foto profil, bila kelak dipasang, tetap menang karena GNOME
memasangnya sebagai gaya inline. `login/gambar-memo.js` menggambarnya dengan
`extension/face.js` yang sama dengan island (kanvas 44×26, diperbesar ×6
dengan filter *nearest*):

```
gjs -m login/gambar-memo.js senang login/memo-avatar.png 28 18   # dipotong: mata lebih besar
```

`tests/test_login.py` memastikan semua PNG yang di-commit sama dengan
keluaran pembuatnya.

## Uji

```
tests/gnome/uji-login.sh       # ±2 menit; UJI_SIMPAN=1 menyimpan tangkapan layar
UJI_JAM=21 tests/gnome/uji-login.sh    # latar GDM jam tertentu
```

Dua shell headless, keduanya di bus sistem palsu (`dbus-daemon` privat +
`tests/gnome/sistem_palsu.py` berisi GDM dan AccountsService tiruan), jadi
GDM, logind, dan AccountsService sungguhan tidak pernah dihubungi:

1. mode turunan `gdm` (dari `XDG_DATA_DIRS` uji) dengan `GNOME_SHELL_DATADIR`
   menunjuk salinan berisi tema yang dibangun khusus uji: latarnya tautan di
   folder uji yang dibuat `latar-login.sh` (bukan `/var/lib/memo`;
   `login/build` tidak disentuh) — layar login asli GNOME, daftar pengguna
   dan prompt sandi;
2. mode `user` dengan `memo-kunci`: dikunci, langit & animasi & jam piksel
   diperiksa, keempat bagian hari dipotret, prompt sandi,
   `disable()`/`enable()`, lalu dibuka (timer animasi harus berhenti).

Protokol greeter GDM tidak ditiru, jadi daftar pengguna dan prompt sandi
digerakkan lewat metode internal dialog; yang diuji tampilannya, bukan logika
login.
