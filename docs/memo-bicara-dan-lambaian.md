# Memo — Ekspresi & Kendali Isyarat

Tanggal: 2026-09-20
Status: sedang dikerjakan

Maskot robot resmi dinamai **Memo**.

## Kedudukan dalam rencana

Ini bukan Fase 2 yang utuh. Fase 2 yang direncanakan di
[arsitektur.md](arsitektur.md) memakai daemon + `claude -p` supaya Memo bisa
menjawab. Yang dikerjakan di sini jauh lebih sempit tapi bisa dipakai hari ini:
Memo mengucapkan kalimat yang **sudah ditentukan**, belum menjawab apa pun.

Dua bagian ini tetap jadi pondasi Fase 2 — daemon nanti memanggil jalur suara
dan pemicu yang sama.

## Suara: dimatikan

Memo tidak bersuara lagi. Semua responsnya lewat ekspresi mata. Bagian suara
di bawah ini disimpan sebagai catatan dan berkasnya masih ada, tapi tidak
dipanggil oleh apa pun.

## Bagian 1: Memo bersuara (`bin/memo`) — TIDAK DIPAKAI LAGI

```
memo "Halo Baban"
MEMO_VOICE="Indonesian+Alicia" memo "coba suara lain"
```

Alurnya: ekspresi mata pindah ke `bicara` lewat D-Bus → kalimat diucapkan →
ekspresi kembali ke `netral`. Pemulihan ekspresi dipasang lewat `trap` supaya
mata tidak tersangkut di `bicara` kalau perintahnya dihentikan di tengah jalan.

Kalau extension Dynamic Island sedang mati, suaranya tetap keluar dan skrip
hanya memberi peringatan — Memo tidak lumpuh hanya karena matanya tidak ada.

### Catatan mesin suara

espeak-ng (bawaan sistem, dipakai versi pertama) terdengar terlalu kaku.
Penggantinya **edge-tts**: suara neural, bahasa Indonesia jauh lebih natural
(`id-ID-ArdiNeural` pria, `id-ID-GadisNeural` wanita).

Di atas suara natural itu ditumpuk **efek robot** lewat ffmpeg: nada
diturunkan, diberi getaran khas robot, gema metalik tipis, lalu dipangkas
seperti keluar dari speaker kecil. Urutannya penting — robot yang disengaja
terdengar keren, TTS murahan terdengar rusak, dan keduanya tidak sama.

### Latensi dan cache

Sintesis edge-tts makan **~11 detik** di jaringan ini padahal berkasnya hanya
~30 KB. Itu latensi bolak-balik, bukan lebar pita, jadi tidak bisa diperbaiki
dengan koneksi yang lebih cepat saja.

Karena kalimat pemicu isyarat sudah ditentukan dari awal, hasilnya disimpan di
`~/.cache/memo-tts/` dan dipanaskan lebih dulu dengan `bin/memo-panaskan`.
Pemutaran dari cache mulai seketika. Efek robot juga dipasang sebelum masuk
cache, jadi tidak menambah jeda saat dipakai.

Berkas cache dipindahkan ke tempatnya hanya setelah utuh, supaya sintesis yang
terputus di tengah tidak meninggalkan berkas rusak yang lalu dipakai selamanya.

Konsekuensi yang perlu disadari: edge-tts berjalan lewat internet, jadi
**kalimat yang diucapkan Memo dikirim ke server Microsoft**. Itu pilihan sadar,
bukan kelalaian. Kalau suatu saat ingin sepenuhnya offline, Piper adalah
gantinya — kualitasnya di bawah edge-tts tapi tidak ada teks yang keluar dari
laptop.

Dua hal kecil yang sempat menjebak pada espeak-ng, dicatat supaya tidak
terulang:

- `-t` itu **tipe** suara (`male1`, `female2`), sedangkan nama seperti `Andy`
  harus lewat `-y`. Salah pakai menghasilkan `Invalid voice`.
- `spd-say` tetap mengembalikan **exit code 0** walau suaranya ditolak, jadi
  keberhasilan harus diperiksa dari stderr, bukan dari exit code.

## Bagian 2: Kendali isyarat tangan (`bin/memo-tangan.py`) — utama

### Dua keadaan, dan kenapa harus ada

| Keadaan | Perilaku |
|---|---|
| SIAGA | hanya menonton; tangan yang bergerak saat mengobrol tidak mengubah apa pun |
| AKTIF | dibuka dengan telapak terbuka, berlaku 5 detik, mata Memo jadi `mendengar` |

Tanpa pemisahan itu, mengarahkan kendali sistem ke detektor yang sifatnya
probabilistik berarti tab dan volume bisa berubah sendiri tanpa diminta.

### Perintah

| Pose | Aksi | Catatan |
|---|---|---|
| Telapak terbuka | aktifkan / perpanjang | |
| Jempol | volume naik | berulang selagi ditahan |
| Telunjuk | volume turun | berulang selagi ditahan |
| Dua jari | tab berikutnya | |
| Tiga jari | tab sebelumnya | |
| Kepalan | tutup tab | harus ditahan 1,5 detik |

Kepalan sengaja jauh lebih lama daripada yang lain: menutup tab adalah
satu-satunya aksi di sini yang menghilangkan sesuatu, jadi tidak boleh mungkin
terpicu tanpa sengaja. Setelahnya kendali langsung ditutup.

### Kenapa pose, bukan geseran tangan

Rancangan awalnya memakai geseran kiri/kanan/atas/bawah. Rekaman kamera
sungguhan membatalkannya: perpindahan telapak yang terukur hanya **0,02–0,11**
dan tidak konsisten antar percobaan, sementara ambang yang dibutuhkan agar
tidak salah picu ada di sekitar 0,18. Webcam laptop bersudut sempit dan
pengguna duduk dekat, jadi tangan yang digeser cepat keluar bingkai atau
gambarnya kabur sebelum lintasannya sempat terkumpul.

Pose sebaliknya terbaca **12 dari 12 frame**. Perintahnya dibuat mengikuti apa
yang memang dikuasai MediaPipe, bukan memaksakan bentuk interaksi yang
kelihatan bagus di atas kertas.

Satu bug nyata ikut ketemu saat itu: jejak telapak dihapus setiap kali satu
frame meleset, padahal justru saat tangan bergerak cepat MediaPipe kehilangan
jejak sesaat — jadi geserannya tidak pernah sempat terkumpul.

### Mencoba tanpa mengubah apa pun

```
~/Projects/asisten-robot/bin/memo-coba
```

Menampilkan pose yang terbaca dan aksi yang akan diambil, tanpa benar-benar
mengubah volume atau tab.

### Bagian lama: pemicu isyarat sederhana

Memakai landmark tangan MediaPipe (API Tasks, model `model/hand_landmarker.task`
7,5 MB), jadi yang dibaca adalah **bentuk tangan sungguhan**, bukan sekadar
piksel yang berubah.

Catatan versi: MediaPipe 1.0 **menghapus API lama `mp.solutions`**. Kode harus
memakai `mediapipe.tasks.python.vision.HandLandmarker`, dan modelnya tidak ikut
dalam paket pip — harus diunduh terpisah. Tirai bergoyang, orang lewat,
dan lampu menyala tidak pernah terbaca sebagai tangan — kekhawatiran salah
picu pada pendekatan gerakan sebagian besar hilang dengan sendirinya.

### Menentukan jari terangkat

Dinilai dari **jarak ujung jari ke pergelangan** dibanding jarak sendi
tengahnya ke pergelangan. Bukan dari perbandingan sumbu Y: cara itu hanya benar
saat tangan tegak, dan langsung salah hitung begitu tangan dimiringkan atau
menghadap ke samping.

Isyarat yang dikenali: telapak terbuka, kepalan, tanda damai, jempol, telunjuk.

### Syarat sebelum memicu

- Isyarat harus bertahan **5 frame berturut-turut** (~0,6 detik pada 8 fps),
  supaya tangan yang kebetulan lewat tidak menyalakan Memo.
- Jeda 8 detik setelah terpicu.
- Kamera 320×240 pada 8 fps — MediaPipe butuh gambar lebih besar daripada
  pendeteksi gerakan, tapi ini masih jauh dari beban penuh.

### Catatan pengujian

Saat menguji penghitung jari, tiga kasus sempat gagal dan ternyata **fixture
tesnya yang keliru, bukan algoritmanya**: jari tertekuk dimodelkan bergeser ke
samping, padahal jari yang menekuk sungguhan melipat ke arah telapak sehingga
ujungnya jadi lebih dekat ke pergelangan daripada sendinya — justru itu yang
dibaca algoritmanya. Dicatat supaya tidak ada yang "memperbaiki" algoritmanya
di kemudian hari padahal yang salah fixture-nya.

## Bagian 3: Pemicu gerakan (`bin/memo-lambaian.py`) — TIDAK DIPAKAI, alternatif

Versi pertama, berbasis selisih piksel. Tidak butuh MediaPipe sama sekali, jadi
jauh lebih ringan, tapi tidak bisa membedakan tangan dari benda bergerak lain.
Disimpan sebagai pilihan kalau MediaPipe terasa berat di mesin ini.

### Cara membedakan lambaian dari gerakan biasa

Yang dinilai adalah **pola**, bukan banyaknya gerakan. Titik berat gerakan
harus bolak-balik arah horizontal. Hasilnya:

| Kejadian | Balikan arah | Memicu |
|---|---|---|
| Melambai kanan-kiri-kanan | 2 | ya |
| Orang lewat di depan kamera | 0 | tidak |
| Tirai bergoyang | 0 | tidak |
| Ruangan diam | 0 | tidak |

Ambangnya **2 balikan**, bukan 3. Lambaian alami (kanan-kiri-kanan) hanya
menghasilkan 2; menuntut 3 berarti pengguna harus melambai empat ayunan penuh
sebelum Memo bereaksi. Angka 2 tetap aman karena semua kasus negatif
menghasilkan 0 — jaraknya masih lebar.

### Penghematan

- Kamera dibuka pada 160×120 piksel, 8 frame per detik. Yang dibutuhkan hanya
  arah gerakan, bukan gambar tajam.
- Ada jeda 8 detik setelah terpicu, supaya tidak beruntun.
- Gerakan yang memenuhi hampir seluruh bingkai diabaikan — itu tandanya lampu
  menyala atau kamera tergeser, bukan lambaian.

## Berlaku untuk kedua pendeteksi

**Lampu kamera akan menyala selama pendeteksi berjalan.** Itu bukan efek
samping yang perlu disembunyikan; justru itu satu-satunya petunjuk kasat mata
bahwa kamera sedang aktif.

## Pemisahan supaya bisa diuji

`bin/lambaian_pola.py` dan `bin/jari_pola.py` sengaja **tidak mengimpor cv2,
numpy, maupun mediapipe** — persis alasan yang sama dengan `face.js` yang tidak
mengimpor St. Logikanya bisa diuji dengan python biasa tanpa kamera dan tanpa
pustaka berat apa pun, memakai landmark buatan.

```
python3 tests/test_lambaian.py
python3 tests/test_jari.py
```

## Menjalankan otomatis saat login

Unit systemd pengguna: `~/.config/systemd/user/memo-tangan.service`

```
systemctl --user status memo-tangan.service     # lihat keadaan
systemctl --user restart memo-tangan.service    # muat ulang setelah kode diubah
systemctl --user disable --now memo-tangan.service   # matikan total
journalctl --user -u memo-tangan.service -f     # pantau isyarat yang terbaca
```

Tiga keputusan di unit itu:

- `PartOf=graphical-session.target` — Memo ikut mati saat logout, tidak pernah
  jalan diam-diam di sesi teks.
- `ExecStartPre=sleep 8` — memberi waktu extension Dynamic Island siap, supaya
  mata Memo ikut bergerak sejak sapaan pertama.
- `Restart=on-failure` dengan jeda 30 detik — kamera bisa sedang dipakai
  panggilan video; Memo mundur teratur lalu mencoba lagi sampai kameranya bebas,
  bukan mati selamanya.

**Konsekuensi yang harus disadari:** kamera kini menyala setiap kali login.
Lampu kamera yang ikut menyala adalah satu-satunya tanda kasat mata soal itu.

## Sudah diuji dengan perangkat sungguhan

- Kamera → MediaPipe → penghitung jari: telapak terbuka terbaca 5 jari dengan
  benar di 12 frame berturut-turut.
- Rantai penuh dari terminal: isyarat terdeteksi → Memo bicara dengan suara
  robot → ekspresi mata kembali ke `netral`.
- Rantai penuh sebagai service systemd: isyarat terdeteksi, tanpa galat suara
  maupun D-Bus, dan ekspresi kembali ke `netral` — membuktikan service tetap
  punya akses ke bus sesi dan ke audio.

## Yang belum dikerjakan

- Memo belum bisa **menjawab** — itu Fase 2 (daemon + `claude -p`).
- Belum ada pengenalan wajah ("kamu siapa, kok bukan Baban") — itu fase kamera
  tersendiri.
- Pendeteksi belum dijalankan otomatis saat login; masih harus dinyalakan
  manual.
- (tidak ada lagi — pendeteksi sudah otomatis, lihat bagian service di bawah)
