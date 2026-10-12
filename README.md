# Memo

Asisten desktop GNOME berwujud robot bermata ekspresif yang menempel di
Dynamic Island (`dynamic-island@local`). Meniru
[Coucou](https://github.com/Louis-CFM/coucou): memantau agen coding, memberi
kartu izin di island, chat ke beberapa otak AI, dan mengabarkan kejadian
LebihTeratur ke laptop.

## Bagian

| Bagian | Isi | Dokumen |
|---|---|---|
| Wajah + island | `extension/` (GNOME Shell), wajah Cairo, gerak piksel ala Mochi, D-Bus `org.himisbah.Robot` | [arsitektur.md](docs/arsitektur.md), [fase-1-wajah-ekspresif.md](docs/fase-1-wajah-ekspresif.md) |
| Sesi agen & izin | hook Claude Code/OpenCode → `memo-agen` → island | [coucou-ala-memo.md](docs/coucou-ala-memo.md) |
| Kabar LebihTeratur | vendor daftar, chat, pembayaran → notifikasi laptop | [coucou-ala-memo.md](docs/coucou-ala-memo.md#kabar-lebihteratur) |
| Ngobrol | `memo-suara` (whisper + otak.py: opencode/claude/gemini/ollama, suara lewat `bin/memo`) | [arsitektur.md](docs/arsitektur.md) |

## Mulai cepat

```
bin/memo-pasang.py extension   # tautkan extension/ ke GNOME Shell
bin/memo-pasang.py layanan     # jalankan memo-agen + memo-integrasi
bin/memo-pasang.py claude      # sambungkan Claude Code (diff ditampilkan dulu)
bin/memo-pasang.py status
tests/semua.sh                 # semua tes, tanpa GNOME/kamera/jaringan
tests/gnome/uji-island.sh      # extension di GNOME Shell headless (±1 menit)
```

Semuanya satu folder dan satu repo: extension ada di `extension/` dan
dimuat GNOME lewat symlink `~/.local/share/gnome-shell/extensions/dynamic-island@local`.
Perubahan extension termuat setelah logout/login.

Pintasan: Super+M menu · Super+Shift+M bicara · Super+Y izinkan ·
Super+Shift+Y tolak.
