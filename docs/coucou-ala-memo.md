# Memo ala Coucou

Diperbarui 2026-10-12. Acuan: [Louis-CFM/coucou](https://github.com/Louis-CFM/coucou)
(versi Linux/Tauri di `windows/`, relay di `windows/hook/`). Animasi dikunci:
`face.js` + `robotFace.js` tidak diubah.

## Yang ditiru

- **Pill hidup per sesi agen** — apa yang dibaca, diedit (+N −M), dijalankan;
  ticker langsung di island selagi agen bekerja, "selesai +N −M" 5 detik.
- **Kartu izin Izinkan / Tolak / Selalu** — perintah persis ditampilkan, bukan
  ringkasan. Dialog terminal tetap muncul bersamaan; siapa pun yang menjawab
  duluan menang.
- **Aturan relay Coucou** (`reply.rs`): tidak ada yang diizinkan tanpa klik
  manusia; Memo mati = hook keluar seketika tanpa pendapat; hook selalu exit 0.
- **Pasang hook dengan sopan** — cadangan bertanggal, digabung, diff
  ditampilkan, ditulis setelah dikonfirmasi.
- Chat multi-penyedia, katalog pill tunggal, wardrobe, suara kustom,
  companion desktop, rekap mingguan, mode demo, tanpa telemetri.
- **Integrasi layanan** — untuk Memo, pengganti Stripe adalah **LebihTeratur**:
  semua kabar admin (vendor daftar, chat vendor, pembayaran Midtrans/manual,
  alert penting) masuk ke laptop.

## Yang tidak ditiru

iPhone / Live Activity / CloudKit / Android, MPRIS (pernah membuat
gnome-shell abort — lihat komentar di `extension.js`), Stripe.

## Arsitektur

```
Claude Code / OpenCode / Gemini --hook--> bin/memo-hook.py
        |  satu baris JSON lewat soket $XDG_RUNTIME_DIR/memo-agen.sock (0600)
        v
bin/memo-agen.py  (registri sesi + koneksi izin yang menunggu)
        |-- /dev/shm/memo-agen.json -----------> extension: agenStore.js -> island + menu
        |<- /dev/shm/memo-agen.keputusan.json -- klik Izinkan/Tolak/Selalu, Super+Y
        |-- jawaban lewat soket --> memo-hook.py --> hookSpecificOutput ke Claude Code
        '-- gdbus SetExpression --> wajah Memo (bingung/berpikir/senang/error)

API LebihTeratur  GET /api/kabar-admin  (token KABAR_ADMIN_TOKEN)
        ^ tiap 30 detik
bin/memo-integrasi.py --> notify-send (island ikut menampilkan) + bunyi
                      --> /dev/shm/memo-pills.json --> menu: pill + 5 kabar terakhir
```

Kenapa soket, bukan berkas antrean seperti versi sebelumnya: relay harus tahu
dalam 0,3 detik apakah Memo hidup (kalau tidak, agen tidak boleh menunggu),
dan jawaban izin harus sampai ke proses hook yang tepat. Berkas antrean tidak
bisa memberi keduanya.

## Berkas

| Berkas | Peran |
|---|---|
| `bin/hook_pola.py` | murni: normalisasi event tiap agen, hitung +N −M, aturan balasan |
| `bin/agen_pola.py` | murni: registri sesi dan perpindahan statusnya |
| `bin/memo-hook.py` | relay yang dipanggil agen; hanya `PermissionRequest` yang menunggu (maks 110 dtk) |
| `bin/memo-agen.py` | daemon soket; `--demo` mengisi island dengan contoh 60 detik |
| `bin/memo-pasang.py` | pasang/lepas hook Claude Code, plugin OpenCode, service systemd |
| `bin/lebihteratur_pola.py` | murni: parse feed kabar, bunyi, pill |
| `bin/integrasi.py` | pill GitHub/git, LebihTeratur, Vercel, Notion (HTTPS stdlib) |
| `bin/memo-integrasi.py` | daemon pill + notifikasi kabar LebihTeratur |
| `extension/agenStore.js` | baca JSON tiap detik, tulis keputusan |
| `extension/extension.js` | island (ticker, izin menempel, avatar mini), gerak, tidur |
| `extension/panel.js` | panel ala Coucou: tab Beranda/Chat/+/Pengaturan, kartu izin/selesai/sesi/layanan, kisi pill |
| `bin/izin_klien.py` | chat Memo sebagai sesi "memo"; perintah usulan AI lewat kartu izin |
| `extension/shortcut.js` | Super+M menu, Super+Shift+M bicara, Super+Y / Super+Shift+Y izinkan / tolak |
| `extension/gerakPola.js` | murni: emote, penguncian piksel, sprite partikel, aturan tidur |
| `extension/gerak.js` | penggerak 12 fps + partikel, dipakai island dan Memo desktop |

(`extension/` di repo ini; GNOME memuatnya lewat symlink
`~/.local/share/gnome-shell/extensions/dynamic-island@local`, dipasang oleh
`memo-pasang.py extension`.)

## Tampilan ala Coucou

Island hitam pekat menempel di tepi atas (sudut bawah membulat), berisi
wajah Memo, jam/indikator sistem, dan avatar pill mini untuk sesi yang
berjalan. Diklik (atau Super+M) ia melebar jadi panel 640 px yang menyatu
dengan island — tanpa panah, tanpa celah:

- **Baris atas:** tab Beranda / Chat / + di kiri; "N berjalan", suara Memo
  hidup/mati, dan Pengaturan di kanan.
- **Beranda:** kartu utama dengan Memo piksel besar — sesi aktif (proyek,
  agen, tiga langkah terakhir, +N −M), atau kartu izin selebar penuh
  (perintah persis, Tolak / **Izinkan** / Selalu, cahaya jingga), atau kartu
  selesai (ringkasan, OK, cahaya hijau), atau detail layanan (kabar
  LebihTeratur yang bisa diklik). Di kanan kisi pill berwarna dengan avatar
  piksel; klik pill untuk melihatnya di kartu utama.
- **Chat:** riwayat percakapan terakhir, kolom ketik, mikrofon, kirim.
  Mengetik saat panel terbuka langsung pindah ke tab ini.
- **+:** tindakan cepat (dikirim ke chat) dan Lampirkan berkas… (zenity).
- **Pengaturan:** Otak AI, Wardrobe, Memo desktop, demo, folder suara.

### Perintah dari chat butuh izin

Otak AI bisa mengusulkan perintah shell (`command` di jawabannya). Dulu
perintah itu langsung dijalankan; kini selalu lewat kartu izin yang sama
dengan Claude Code (`bin/izin_klien.py` → memo-agen). Tanpa klik Izinkan —
ditolak, habis waktu, atau memo-agen mati — perintahnya tidak jalan. Isi
lampiran ikut dikirim ke AI, jadi tanpa gerbang ini teks di sebuah berkas
bisa "menyuruh" Memo menjalankan perintah.

## Gerak ala Mochi, bergaya piksel

Mata tetap digambar `face.js`; yang bergerak adalah aktornya, dengan tabel
keyframe yang diporting dari `BotEngine.swift` Coucou. Island dan Memo
desktop memakai gerak yang sama. Gaya piksel: 12 langkah per detik seperti
sprite, posisi dan ukuran terkunci ke petak piksel wajah, putaran per 10°,
partikel berupa pixel-art. Timer hanya hidup selama ada gerak — saat diam
bebannya nol.

| Kejadian | Gerak | Partikel |
|---|---|---|
| Memo muncul | sapa | ✦ |
| Agen mulai berpikir | angguk | |
| Agen bekerja (tiap 8 dtk) | oleng | |
| Kartu izin muncul / masih menunggu (tiap 6 dtk) | kaget / getar | ? |
| Izinkan, Selalu / Tolak | angguk / geleng | ✓ / ✕ |
| Agen selesai | lompat lalu putar | ✦ ×5 |
| Agen galat | geleng | ✕ |
| Pembayaran LebihTeratur | dansa | koin ×4 |
| Chat LebihTeratur / kabar lain | kaget / sapa | ✉ / ✦ |
| Klik / tiga klik cepat | tepuk / pusing | ✦ |
| Charger dicolok / dicabut, baterai lemah | lompat / kedip, getar | ! |
| Diam lama | lirik, kedip, angguk acak (25–50 dtk) | |
| 2 menit sepi + kursor jauh | tidur (kepala miring) | z tiap 3 dtk |

## Memasang

```
bin/memo-pasang.py extension    # tautkan extension/ ke GNOME Shell
bin/memo-pasang.py layanan      # memo-agen + memo-integrasi (systemd --user)
bin/memo-pasang.py claude       # tampilkan diff ~/.claude/settings.json, tanya dulu
bin/memo-pasang.py opencode     # plugin ~/.config/opencode/plugins/memo.js
bin/memo-pasang.py status
```

Lepas dengan `--lepas`. Perubahan extension baru termuat setelah logout/login
(Wayland tidak bisa memuat ulang extension).

### Kabar LebihTeratur

1. Merge branch `feat/kabar-admin-memo` di repo lebihteratur (endpoint
   `/api/kabar-admin` + pencatat di `socketEmitter`/`externalNotify`).
2. `bin/memo-integrasi.py --buat-token` — token tersimpan di
   `~/.config/memo/integrasi.json` (0600) dan dicetak sekali.
3. Pasang nilai yang sama di Render → lebihteratur-api → Environment sebagai
   `KABAR_ADMIN_TOKEN`. Tanpa variabel itu server tidak mencatat apa pun dan
   endpoint-nya 404.
4. `bin/memo-integrasi.py --status` untuk cek, `--uji-notif` untuk melihat
   bentuk notifikasinya.

Pemasangan pertama hanya menandai titik awal (5 kabar terakhir masuk riwayat
tanpa bunyi), jadi tidak ada banjir notifikasi lama.

## Uji

```
tests/semua.sh
```

`tests/test_agen.py` menjalankan rantai nyata (daemon + relay sebagai proses
terpisah). Selain itu sudah dibuktikan dengan perangkat sungguhan pada
2026-10-12:

- Claude Code asli di pty dengan hook ini: kartu muncul di island bersamaan
  dengan dialog terminal; klik Izinkan → perintah jalan 0,46 detik kemudian,
  dialog terminal tertutup sendiri; keluar dari Claude → sesi hilang.
- GNOME Shell 50 headless (D-Bus, dconf, dan `/dev/shm` terpisah dari sesi
  utama), `tests/gnome/uji-island.sh`: 59 skenario — panel 640 px menyatu
  dengan island, kartu izin dan klik tombol sungguhan sampai ke agen, kartu
  selesai, detail layanan + tautan aman, tab Chat terkirim, Pengaturan
  (Otak AI, bisu), gerak piksel, Memo desktop, tidur, dan panel tertutup
  tidak tergambar.
