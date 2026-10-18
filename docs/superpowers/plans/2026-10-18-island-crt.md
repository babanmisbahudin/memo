# Island & Panel Gaya CRT — Rencana

> Dikerjakan langsung di sesi yang sama dengan TDD per tugas (pengguna minta
> cepat), jadi rencana ini daftar tugas + verifikasi, bukan salinan kode.

**Spec:** `docs/superpowers/specs/2026-10-18-island-crt-design.md`

**Batasan bersama:** bahasa Indonesia; modul `crt.js`, `riwayatPola.js`,
`hurufPiksel.js` murni (tanpa St/Clutter/Meta/Main); tiap tugas diakhiri
`tests/semua.sh` hijau, tugas 3–6 juga `tests/gnome/uji-island.sh` hijau +
tangkapan layar diperiksa; commit diakhiri `Co-Authored-By: Claude Opus 5.5
<noreply@anthropic.com>`.

| # | Tugas | Berkas | Verifikasi |
|---|---|---|---|
| 1 | Pindah huruf piksel ke `extension/`, tambah tanda baca; `crt.js` (jalur tangga, latar CRT, teks bercahaya, normalisasi) | `extension/hurufPiksel.js`, `extension/crt.js`, `sambutan/layar.js`, tes | `test-crt.js`, `test-layar.js` |
| 2 | `riwayatPola.js` | `extension/riwayatPola.js`, tes | `test-riwayat.js` |
| 3 | Widget St (`LatarCrt`, `LabelPiksel`, `BatangPiksel`) + island gaya CRT + timer island aman | `extension/widgetCrt.js`, `extension/extension.js`, css | headless: uji lama + tangkapan island 3 keadaan; tidak ada `Gjs-CRITICAL` dari island saat shell mati |
| 4 | Panel CRT: latar, tab Beranda/Riwayat/Chat/Atur, Beranda baru (Memo hidup + perhatian + pintasan) | `extension/panel.js`, `extension/hidup/memoHidup.js`, css | headless: Beranda menampilkan kegiatan Memo; pintasan membuka lewat pembuka palsu |
| 5 | Riwayat: pencatatan di island + tab Riwayat | `extension/extension.js`, `extension/panel.js` | headless: notifikasi & agen selesai muncul di tab Riwayat; saringan |
| 6 | Chat lengkap: gelembung bergulir, lampiran, tindakan cepat | `extension/panel.js`, css | headless: > 4 pesan tampil, lampiran terlihat |
| 7 | Dokumentasi & verifikasi akhir | `docs/`, `README.md` | semua tes hijau |
