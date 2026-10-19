# Studio Memo — Desain

Tanggal: 2026-10-20 · Status: diimplementasikan (koin menunggu tahap 2b) — pemakaian di [docs/memo-hidup.md](../../memo-hidup.md).

Penyesuaian rupa Memo bergaya layar karakter game, menggantikan pilihan
warna & mata sederhana di wizard Memo baru (siklus hidup tahap 2).

## Keputusan

| Topik | Keputusan |
|---|---|
| Kapan | **hanya saat Memo lahir** (pemasangan baru & telur baru sesudah meninggal) — bagian dari wizard, rupa terkunci sesudah menetas. Memo lama sekali lewat wizard "kenalan" |
| Jenis kelamin | dipilih di layar pertama Studio, terkunci seumur hidup |
| Mulut | **opsional, bawaan tanpa mulut** (dua mata LED tetap ciri khas); bila dipilih, mulut ikut ekspresi |
| Item istimewa | dibuka dengan **koin** (dari target/habit, tahap 2b). Item dasar gratis. Yang sudah terbuka diwariskan ke Memo berikutnya. Sebelum tahap 2b ada, item istimewa tampil terkunci |

## Tampilan

Popup bergaya CRT piksel seperti panel, dibuka dari Beranda saat wizard:

```
┌─ STUDIO MEMO ─────────────────────────────────┐
│ [badan] [mata] [mulut] [kepala] [ekstra]      │
│ ┌───────────────┐  ◀  bentuk: pil      ▶      │
│ │               │  ■■■■■■■■■■■■  warna        │
│ │  Memo besar,  │  ◀  pola: polos      ▶      │
│ │  berkedip,    │                             │
│ │  lompat kecil │  [acak]        [tetaskan]   │
│ └───────────────┘  nama: [Memo        ]       │
└────────────────────────────────────────────────┘
```

- Pilihan diganti dengan ◀ ▶ dan kotak warna; pratinjau Memo melompat
  kecil tiap ada yang berubah. Tombol **acak**. Klik berbunyi tiny robot.
- Item terkunci tampil abu-abu dengan gembok + harga koin.

## Pilihan

| Kategori | Dasar (gratis) | Istimewa (koin) |
|---|---|---|
| Bentuk badan | pil, bulat, kotak membulat | tetes air, awan, kucing (telinga) |
| Warna badan | 12 warna; warna mata ikut supaya terbaca | — |
| Pola badan | polos, belang, totol | gradasi bawah, bintang kecil |
| Mata | kotak LED, bulat, sipit | besar berkilau, mata kucing, hati |
| Warna mata | putih, biru muda, hijau fosfor, kuning, pink | — |
| Mulut | tanpa, senyum kecil, "w" | taring, "o" |
| Pipi | tanpa, merona | bintik |
| Kepala | topi / pita (bawaan jenis kelamin), antena | mahkota, tanduk kecil, daun, bando kucing |
| Ekstra | tanpa, syal | dasi kupu-kupu, kalung, sayap kecil, ekor |

Aksesori umur (empeng bayi, headphone remaja, alis/janggut/kacamata/tongkat
tua) tetap otomatis dari `rupa.js`, ditumpuk di atas pilihan Studio.

## Mulut & ekspresi

| Ekspresi | Mulut |
|---|---|
| netral | bentuk pilihan |
| senang | melengkung lebih lebar |
| kaget / mendengar | "o" |
| bicara | buka-tutup tiap bingkai |
| tidur | garis kecil |
| sakit | bergelombang |
| makan (rawat) | mengunyah buka-tutup |

## Bagian

| Berkas | Isi |
|---|---|
| `extension/hidup/studio.js` (murni) | katalog pilihan, harga, `rapikanRupa()`, `acakRupa()`, item terbuka/terkunci |
| `extension/face.js` | bentuk mata baru, mulut per ekspresi, pipi |
| `extension/hidup/gambarMemo.js` | bentuk badan, pola, kepala & ekstra (pixel-art) |
| `extension/hidup/memoHidup.js` | badan desktop memakai bentuk (St: kanvas badan menggantikan CSS pil) |
| `extension/panel.js` | popup Studio di wizard |
| `extension/hidup/hayat.js` | `avatar` diperluas; `itemTerbuka` diwariskan lewat telur baru |
| `pratinjau/` | lembar semua pilihan untuk dilihat di browser |

## Pengujian

- gjs murni: katalog lengkap & tanpa id ganda, `rapikanRupa` menolak item
  terkunci/asing, acak hanya memilih item terbuka, pewarisan item terbuka,
  mulut per ekspresi menggambar piksel berbeda, tiap bentuk badan/pola
  menggambar di dalam batas.
- GNOME headless: wizard membuka Studio, ganti pilihan memperbarui
  pratinjau, tetaskan menyimpan rupa, rupa terkunci sesudahnya.
