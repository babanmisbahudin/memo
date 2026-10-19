# Suara Memo — tiny robot

`bin/memo "kalimat"` membuat Memo bicara: mata pindah ke ekspresi *bicara*,
suara diputar, lalu kembali *netral*. Dipakai `memo-suara` (jawaban chat &
suara) dan semua yang ingin Memo bersuara.

| | |
|---|---|
| Suara dasar | edge-tts `id-ID-GadisNeural` (neural; **butuh internet**, teksnya dikirim ke server Microsoft) |
| Efek | "tiny robot": nada ×1,2 beserta formannya (badan suara mengecil seperti robot mainan), chorus lembut, sedikit kresek digital 9-bit, speaker mungil (300–7000 Hz), kerasnya diratakan |
| Cache | `~/.cache/memo-tts/`, kuncinya suara + kecepatan + efek + teks: kalimat yang sama langsung diputar; mengganti efek otomatis membuat ulang |
| Cadangan | tanpa internet / edge-tts gagal → espeak-ng (`spd-say`), nada dinaikkan supaya tetap senada |

Efeknya dipilih dengan membandingkan beberapa contoh (2026-10-19): efek lama
(nada diturunkan, bergetar 22 Hz, bergema) terasa terlalu robot.

## Menyetel

```
MEMO_VOICE=id-ID-ArdiNeural memo "halo"     # suara laki-laki
MEMO_RATE=-10% memo "halo"                  # lebih pelan
MEMO_EFEK="rubberband=pitch=1.35:formant=shifted" memo "halo"   # efek ffmpeg sendiri
MEMO_EFEK= memo "halo"                      # tanpa efek
memo --hanya-cache "halo"                   # siapkan suaranya, jangan bunyikan
```

Efek memakai filter ffmpeg `rubberband`, `chorus`, `acrusher`, `loudnorm`.
Bila ffmpeg menolak efeknya, suara disimpan tanpa efek (Memo tetap bicara).

## edge-tts berhenti jalan?

Server Microsoft sesekali menolak versi edge-tts lama (galat `403 Invalid
response status`), dan Memo jatuh ke espeak yang kaku. Perbaiki dengan
memperbarui paketnya (7.3.1 jalan pada 2026-10-19):

```
.venv/bin/python -m pip install -U edge-tts
```

## Uji

`tests/test_suara_memo.py` — tanpa internet & tanpa speaker: edge-tts diganti
skrip palsu (`MEMO_EDGE_TTS`), efek bawaan diterima ffmpeg dan menaikkan nada
sinus 200 Hz → ±240 Hz, cache dipakai ulang, efek baru membuat ulang, efek
rusak tetap menghasilkan suara.
