# Memo

Asisten desktop GNOME berwujud robot bermata ekspresif yang menempel di
Dynamic Island (`dynamic-island@local`). memantau agen coding, memberi
kartu izin di island, chat ke beberapa otak AI, dan mengabarkan kejadian
LebihTeratur ke laptop.

## Bagian

| Bagian | Isi | Dokumen |
|---|---|---|
| Wajah + island | `extension/` (GNOME Shell), wajah Cairo, gerak piksel ala Mochi, D-Bus `org.himisbah.Robot` | [arsitektur.md](docs/arsitektur.md), [fase-1-wajah-ekspresif.md](docs/fase-1-wajah-ekspresif.md) |
| Sesi agen & izin | hook Claude Code/OpenCode → `memo-agen` → island | [coucou-ala-memo.md](docs/coucou-ala-memo.md) |
| Kabar LebihTeratur | vendor daftar, chat, pembayaran → notifikasi laptop | [coucou-ala-memo.md](docs/coucou-ala-memo.md#kabar-lebihteratur) |
| Ngobrol | `memo-suara` (whisper + otak.py: opencode/claude/gemini/ollama, suara lewat `bin/memo`) | [arsitektur.md](docs/arsitektur.md) |
| Suara | `bin/memo` — edge-tts Gadis + efek "tiny robot" (imut, speaker mungil), cache, cadangan espeak | [suara-memo.md](docs/suara-memo.md) |
| Kelola laptop | "buka youtube / terminal / folder memo" dari chat & suara | [kelola-laptop.md](docs/kelola-laptop.md) |
| Sambutan | `sambutan/` — animasi piksel layar penuh saat login, Log Out, Restart, Power Off, Suspend | [sambutan.md](docs/sambutan.md) |
| Memo hidup | `extension/hidup/` — Memo keluar dari island, hidup di desktop ala NPC (lompat, ngintip, sifat; atraksi: ayunan, gelantungan, terjun payung, naik mobil) | [memo-hidup.md](docs/memo-hidup.md) |
| Island & panel CRT | `extension/crt.js`, `widgetCrt.js` — island & panel gaya layar mini CRT: beranda, riwayat, chat, atur, pintasan | [island-crt.md](docs/island-crt.md) |
| Layar login & kunci | `login/` — pemandangan piksel menurut jam (pagi/siang/sore/malam) + kartu sandi CRT; tema GDM + extension `memo-kunci@local` | [layar-login.md](docs/layar-login.md) |

## Mulai cepat

```
bin/memo-pasang.py extension   # tautkan extension/ ke GNOME Shell
bin/memo-pasang.py layanan     # jalankan memo-agen + memo-integrasi
bin/memo-pasang.py claude      # sambungkan Claude Code (diff ditampilkan dulu)
bin/memo-pasang.py sambutan    # sambutan Memo saat login + menu daya
bin/memo-pasang.py kunci       # layar kunci ala Memo (tema login GDM: docs/layar-login.md)
bin/memo-pasang.py status
tests/semua.sh                 # semua tes, tanpa GNOME/kamera/jaringan
tests/gnome/uji-island.sh      # extension + sambutan di GNOME Shell headless (±4 menit)
tests/gnome/uji-login.sh       # layar login GDM + layar kunci, bus sistem palsu (±2 menit)
pratinjau/buat.sh              # galeri desain Memo di browser: http://127.0.0.1:8765
```

Semuanya satu folder dan satu repo: extension ada di `extension/` dan
dimuat GNOME lewat symlink `~/.local/share/gnome-shell/extensions/dynamic-island@local`.
Perubahan extension termuat setelah logout/login.

Pintasan: Super+M menu · Super+Shift+M bicara · Super+Y izinkan ·
Super+Shift+Y tolak.
