# Memo — Arsitektur

Tanggal: 2026-09-20

Asisten AI pribadi untuk desktop GNOME, diwakili maskot robot bermata ekspresif
yang menempel pada Dynamic Island (extension `dynamic-island@local`).

## Bentuk sistem

Tiga bagian yang sengaja dipisah:

| Bagian | Proses | Tanggung jawab |
|---|---|---|
| Extension | dalam `gnome-shell` | Menggambar wajah, menampilkan teks, menangkap hotkey |
| Daemon | proses sendiri (Node 22) | Rekam suara, whisper, `claude -p`, TTS, eksekusi aksi |
| D-Bus | — | Jembatan dua arah antara keduanya |

### Kenapa daemon harus proses terpisah

Whisper dan `claude` butuh beberapa detik per permintaan. Semua kode extension
berjalan di dalam proses `gnome-shell` yang juga compositor — satu operasi
lambat di sana membekukan seluruh desktop: mouse, animasi, semuanya. Karena itu
extension tidak boleh melakukan apa pun yang berat; ia hanya menggambar dan
mengirim pesan.

### Arah komunikasi

- `org.himisbah.Robot` — **dimiliki extension**. Daemon memanggilnya untuk
  mengubah ekspresi wajah dan menampilkan teks.
- `org.himisbah.RobotDaemon` — **dimiliki daemon**. Extension memanggilnya saat
  pengguna menekan hotkey atau membatalkan.

Pola D-Bus ini sama persis dengan yang sudah dipakai extension untuk UPower,
NetworkManager, dan MPRIS, jadi tidak ada mekanisme baru yang perlu dipelajari.

## Otak AI

Memakai `claude` CLI yang sudah terpasang di `~/.local/bin/claude`, dipanggil
non-interaktif (`claude -p`). Tidak perlu API key baru; memakai langganan yang
sudah ada.

Daemon mengirim prompt sistem yang memaksa balasan berbentuk JSON:

```json
{ "say": "kalimat yang dibacakan", "command": "perintah shell atau null" }
```

## Model keamanan

Aturan pokok: **Claude tidak pernah memutuskan apakah sesuatu aman.**

Kalau model ditanya "perintah ini berbahaya tidak?", suatu saat ia akan menjawab
"tidak" untuk sesuatu yang menghapus data. Jadi klasifikasi risiko dilakukan
daemon dengan aturan tetap:

1. Perintah cocok dengan daftar aman (read-only / mudah dibatalkan) → jalan
   langsung.
2. **Apa pun selain itu** → dialog konfirmasi + password, tanpa pengecualian.

Dialog konfirmasi wajib menampilkan dua hal:

- **Apa yang didengar** — hasil transkrip suara, karena salah dengar adalah
  sumber bahaya utama pada input suara.
- **Perintah persis yang akan dijalankan** — bukan ringkasan, bukan parafrasa.

Password diverifikasi lewat polkit dengan action kustom ber-`auth_self`
(password pengguna sendiri, bukan root). Polkit hanya mengembalikan izin
ya/tidak; perintahnya tetap dijalankan sebagai pengguna biasa, tidak di-`sudo`.

## Pembagian fase

| Fase | Isi | Berguna sendiri walau berhenti di sini |
|---|---|---|
| 1 | Wajah Cairo + mesin ekspresi + antarmuka D-Bus | Maskot punya banyak ekspresi, bisa dites tanpa AI |
| 2 | Daemon + `claude -p` + TTS + input ketik via hotkey | Sudah jadi asisten beneran, jawabannya bersuara |
| 3 | whisper.cpp + push-to-talk | Suara penuh |
| 4 | Eksekusi perintah + klasifikasi risiko + gerbang polkit | Bisa mengerjakan apa saja di laptop |

Tiap fase punya dokumen desain dan rencana implementasinya sendiri.

## Prasyarat yang butuh sudo (sekali saja)

Dikerjakan nanti saat fasenya tiba, bukan sekarang:

- Fase 3: `sudo apt install cmake` — untuk mengompilasi whisper.cpp
- Fase 4: memasang file `.policy` polkit ke `/usr/share/polkit-1/actions/`

## Keputusan yang sudah diambil

- **Push-to-talk, bukan wake word.** Wake word menuntut mikrofon menyala
  terus-menerus: boros baterai dan semua suara di ruangan ikut diproses.
- **Suara TTS espeak-ng bahasa Indonesia.** Sudah tersedia tanpa instalasi apa
  pun. Terdengar robotik — justru cocok untuk maskot robot. Bisa diganti Piper
  (kualitas jauh lebih baik) kalau nanti terasa kurang.
- **Wajah digambar Cairo, bukan disusun dari widget.** Dua kotak `St.Widget`
  tidak bisa jadi busur senyum, silang, atau garis tidur.
