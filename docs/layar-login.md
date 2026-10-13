# Layar login & layar kunci Memo

Dua layar yang berbeda sumbernya, satu desain (`login/stylesheet.css`):

| Layar | Kapan terlihat | Dari mana gayanya | Pasang |
|---|---|---|---|
| Layar kunci | setelah 15 menit diam, Super+L | extension `memo-kunci@local` (folder `login/`) | `bin/memo-pasang.py kunci`, tanpa sudo |
| Layar login GDM | setelah Log Out (login otomatis aktif, jadi tidak saat boot) | `gdm-theme.gresource` = Yaru + stylesheet Memo | `login/bangun-gdm.sh` lalu `sudo login/pasang-gdm.sh` |

Gaya ala Coucou: latar hitam, kartu `#16171b` berbingkai tipis, kolom sandi
dan tombol berbentuk pil, tanpa aksen oranye Yaru. Avatar bawaan (akun ini
tidak punya foto profil) diganti wajah Memo piksel; foto profil, bila kelak
dipasang, tetap menang karena GNOME memasangnya sebagai gaya inline. Di
layar kunci, Memo tidur di atas jam.

## Layar kunci

`login/` sekaligus folder extension `memo-kunci@local` dengan
`session-modes: ["user", "unlock-dialog"]`, jadi stylesheet-nya tetap dimuat
saat terkunci. Dua hal tidak bisa lewat CSS, jadi `extension.js` menambah
aktor saat dialog kunci dibuat:

- peredup hitam 60% di atas latar blur (latar blur adalah aktor anak yang
  menutupi warna latar dialog);
- wajah Memo tidur di atas jam (St hanya menerima `background-position`
  dalam piksel, tidak bisa memusatkan gambar).

Keduanya tidak reaktif; extension ini tidak menambah tombol atau aksi apa pun
ke layar kunci (yang tampil di sana bisa disentuh siapa saja).

## Layar login GDM

```
login/bangun-gdm.sh            # -> login/build/gdm-theme.gresource
sudo login/pasang-gdm.sh       # update-alternatives --set ke tema Memo
sudo login/pasang-gdm.sh --lepas
```

`bangun-gdm.sh` membongkar gresource Yaru asli, menempelkan stylesheet Memo
di belakang `gdm.css`, dan menyertakan `memo-*.png`. Selalu dari berkas Yaru
asli, bukan dari alternatif yang sedang aktif. Butuh `glib-compile-resources`
(`sudo apt install libgio-2.0-dev-bin`). Bangun ulang setelah pembaruan besar
GNOME/Yaru, karena isi Yaru ikut tersalin.

`pasang-gdm.sh` memasang ke `/usr/local/share/gnome-shell/theme/memo/` dan
mendaftarkannya ke `update-alternatives` dengan prioritas 0 (mode otomatis
tetap memilih Yaru), lalu memilihnya manual. Berkas Yaru tidak disentuh.

Bila layar login rusak: Ctrl+Alt+F3, masuk, lalu

```
sudo update-alternatives --auto gdm-theme.gresource
```

## Gambar

`login/gambar-memo.js` menggambar wajah dengan `extension/face.js` yang sama
dengan island (kanvas 44×26, diperbesar ×6 dengan filter *nearest*):

```
gjs -m login/gambar-memo.js senang login/memo-avatar.png 28 18   # dipotong: mata lebih besar
gjs -m login/gambar-memo.js tidur  login/memo-tidur.png
```

`tests/test_login.py` memastikan PNG yang di-commit sama dengan keluarannya.

## Uji

```
tests/gnome/uji-login.sh       # ±1 menit; UJI_SIMPAN=1 menyimpan tangkapan layar
```

Dua shell headless, keduanya di bus sistem palsu (`dbus-daemon` privat +
`tests/gnome/sistem_palsu.py` berisi GDM dan AccountsService tiruan), jadi
GDM, logind, dan AccountsService sungguhan tidak pernah dihubungi:

1. mode turunan `gdm` (dari `XDG_DATA_DIRS` uji) dengan `GNOME_SHELL_DATADIR`
   menunjuk salinan berisi tema hasil bangun — layar login asli GNOME,
   daftar pengguna dan prompt sandi;
2. mode `user` dengan `memo-kunci`: dikunci, dibangunkan, prompt sandi,
   `disable()`/`enable()`, lalu dibuka.

Protokol greeter GDM tidak ditiru, jadi daftar pengguna dan prompt sandi
digerakkan lewat metode internal dialog; yang diuji tampilannya, bukan logika
login.
