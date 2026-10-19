// Gerak tubuh Memo ala Mochi (Coucou), bergaya piksel — murni, tanpa St/Clutter.
//
// Mata tetap digambar face.js; yang bergerak di sini adalah aktornya:
// melompat, gepeng-melar, menggeleng, berputar. Tabelnya diporting dari
// coucou/NotchBuddy/Sources/CoucouKit/BotEngine.swift (TweenKey: target,
// durasi ms, easing), dengan kanal:
//   oy  geser vertikal, pecahan tinggi wajah (negatif = naik)
//   ox  geser horizontal, pecahan lebar wajah
//   sx  skala horizontal (1 = normal)
//   sy  skala vertikal
//   rz  putaran (derajat)
//
// Gaya piksel: gerak melangkah 12 frame per detik seperti sprite, posisi dan
// ukuran dikunci ke petak piksel wajah, putaran per 10 derajat, dan partikel
// berupa pixel-art kecil. Dipakai bersama oleh island dan Memo di desktop.

export const DASAR = { oy: 0, ox: 0, sx: 1, sy: 1, rz: 0 };

// Pose saat tidur: merosot, sedikit gepeng, kepala miring.
export const POSE_TIDUR = { oy: 0.08, ox: 0, sx: 1.04, sy: 0.92, rz: -10 };

export const FPS_PIKSEL = 12;
export const LANGKAH_RZ = 10;

const c1 = 1.70158;
export const EASE = {
    lin: t => t,
    out: t => 1 - (1 - t) ** 3,
    inOut: t => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2),
    back: t => 1 + (c1 + 1) * (t - 1) ** 3 + c1 * (t - 1) ** 2,
};

export const EMOTE = {
    // Coucou "happy": lompatan kecil + gepeng-melar.
    lompat: {
        oy: [[-0.30, 120, 'out'], [0.03, 200, 'inOut'], [0, 160, 'back']],
        sy: [[0.82, 80, 'out'], [1.18, 130, 'out'], [0.88, 160, 'inOut'], [1, 200, 'back']],
        sx: [[1.15, 80, 'out'], [0.88, 130, 'out'], [1.06, 160, 'inOut'], [1, 200, 'back']],
    },
    // Coucou "surprised": tersentak naik, badan memanjang.
    kaget: {
        oy: [[-0.20, 150, 'out'], [0, 300, 'back']],
        sy: [[1.16, 70, 'out'], [0.95, 130, 'out'], [1, 170, 'inOut']],
        sx: [[0.9, 70, 'out'], [1.04, 130, 'out'], [1, 170, 'inOut']],
    },
    // Coucou squash(): dipencet (klik).
    tepuk: {
        sy: [[0.78, 70, 'out'], [1.1, 130, 'out'], [1, 170, 'inOut']],
        sx: [[1.16, 70, 'out'], [0.95, 130, 'out'], [1, 170, 'inOut']],
    },
    // Coucou "annoyed": geleng cepat (ditolak, galat).
    geleng: {
        ox: [[-0.10, 50, 'out'], [0.10, 90, 'inOut'], [-0.08, 80, 'inOut'],
            [0.06, 75, 'inOut'], [-0.03, 70, 'inOut'], [0, 140, 'out']],
    },
    // Mengangguk: diizinkan, mulai berpikir.
    angguk: {
        oy: [[0.12, 90, 'out'], [-0.04, 120, 'inOut'], [0, 160, 'back']],
        sy: [[0.9, 90, 'out'], [1.04, 120, 'inOut'], [1, 160, 'back']],
    },
    // Coucou doRoll (agen selesai): satu putaran penuh sambil melambung.
    putar: {
        rz: [[360, 950, 'inOut']],
        oy: [[-0.18, 300, 'out'], [0, 650, 'back']],
    },
    // Joget kiri-kanan mengikuti ketukan (pembayaran masuk).
    dansa: {
        rz: [[-10, 180, 'inOut'], [10, 360, 'inOut'], [-10, 360, 'inOut'], [10, 360, 'inOut'], [0, 180, 'inOut']],
        oy: [[-0.10, 180, 'out'], [0, 180, 'inOut'], [-0.10, 180, 'out'], [0, 180, 'inOut'],
            [-0.10, 180, 'out'], [0, 180, 'inOut'], [-0.10, 180, 'out'], [0, 180, 'inOut']],
    },
    // Coucou dizzy: diklik tiga kali cepat -> sempoyongan.
    pusing: {
        rz: [[20, 120, 'out'], [-20, 200, 'inOut'], [10, 200, 'inOut'], [-10, 200, 'inOut'], [10, 180, 'inOut'], [0, 200, 'out']],
        ox: [[0.06, 300, 'inOut'], [-0.06, 400, 'inOut'], [0, 400, 'inOut']],
    },
    // Sapaan saat Memo muncul / vendor baru daftar.
    sapa: {
        oy: [[-0.25, 140, 'out'], [0, 260, 'back']],
        rz: [[-10, 140, 'out'], [10, 200, 'inOut'], [-10, 160, 'inOut'], [0, 180, 'out']],
    },
    // Coucou wink: kepala miring sebentar.
    kedip: {
        rz: [[10, 100, 'out'], [10, 320, 'lin'], [0, 200, 'inOut']],
    },
    // Melirik ke samping (gerak iseng saat diam).
    lirik: {
        ox: [[0.05, 200, 'inOut'], [0.05, 400, 'lin'], [-0.04, 300, 'inOut'], [0, 250, 'inOut']],
    },
    // Oleng pelan selagi agen bekerja ("sedang mikir").
    oleng: {
        rz: [[-10, 300, 'inOut'], [10, 600, 'inOut'], [0, 300, 'inOut']],
    },
    // Gemetar kecil: ada izin yang belum dijawab.
    getar: {
        ox: [[0.03, 40, 'lin'], [-0.03, 60, 'lin'], [0.03, 60, 'lin'], [-0.03, 60, 'lin'], [0, 40, 'lin']],
    },
    // Bangun dari tidur: meregang lalu kembali.
    bangun: {
        sy: [[1.12, 140, 'out'], [0.96, 120, 'inOut'], [1, 200, 'back']],
        sx: [[0.94, 140, 'out'], [1.02, 120, 'inOut'], [1, 200, 'back']],
    },
};

// Gerak iseng saat diam: dipilih acak, sesekali.
export const ISENG = ['lirik', 'kedip', 'lirik', 'angguk'];
export const ISENG_MIN_S = 25;
export const ISENG_MAKS_S = 50;

export function durasi(nama) {
    const e = EMOTE[nama];
    if (!e)
        return 0;
    return Math.max(...Object.values(e).map(keys => keys.reduce((n, k) => n + k[1], 0)));
}

// Nilai satu kanal pada waktu t (ms) sejak emote mulai, berangkat dari `awal`.
export function nilaiKanal(keys, t, awal) {
    let dari = awal;
    let mulai = 0;
    for (const [target, ms, ease] of keys) {
        if (t < mulai + ms) {
            const p = (EASE[ease] ?? EASE.lin)(Math.max(0, (t - mulai) / ms));
            return dari + (target - dari) * p;
        }
        dari = target;
        mulai += ms;
    }
    return dari;
}

// Pose lengkap sebuah emote pada waktu t; kanal yang tidak dipakai emote itu
// tetap di `pose` (pose dasar atau pose tidur).
export function poseEmote(nama, t, pose = DASAR) {
    const e = EMOTE[nama] ?? {};
    const hasil = { ...pose };
    for (const [kanal, keys] of Object.entries(e))
        hasil[kanal] = nilaiKanal(keys, t, DASAR[kanal]);
    return hasil;
}

// Pose -> properti aktor, dikunci ke petak piksel. `lebar`/`tinggi` adalah
// ukuran wajah dalam piksel seni (44x26); `skala` = ukuran satu piksel seni
// di layar (island 1, Memo desktop 2,6).
export function keAktor(p, { lebar, tinggi, skala = 1, amplitudo = 1 }) {
    const kunci = v => Math.round(v / skala) * skala || 0;
    return {
        translation_x: kunci(p.ox * lebar * amplitudo * skala),
        translation_y: kunci(p.oy * tinggi * amplitudo * skala),
        scale_x: (Math.max(1, Math.round(p.sx * lebar)) / lebar) * skala,
        scale_y: (Math.max(1, Math.round(p.sy * tinggi)) / tinggi) * skala,
        rotation_angle_z: Math.round(p.rz / LANGKAH_RZ) * LANGKAH_RZ || 0,
    };
}

// Partikel pixel-art: '#' = piksel menyala. Warna per jenis.
export const SPRITE = {
    bintang: { warna: '#ffd54a', baris: ['.#.', '###', '.#.'] },
    z: { warna: '#c8dcff', baris: ['####', '..#.', '.#..', '####'] },
    ok: { warna: '#7ee787', baris: ['....#', '...#.', '#.#..', '.#...'] },
    tidak: { warna: '#ff7b72', baris: ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'] },
    tanya: { warna: '#ffcc66', baris: ['.##.', '#..#', '..#.', '....', '..#.'] },
    seru: { warna: '#ffcc66', baris: ['#', '#', '#', '.', '#'] },
    musik: { warna: '#d2a8ff', baris: ['..##', '..#.', '..#.', '##..', '##..'] },
    pesan: { warna: '#96d2ff', baris: ['#####', '##.##', '#.#.#', '#...#', '#####'] },
    hati: { warna: '#ff7eb6', baris: ['.#.#.', '#####', '#####', '.###.', '..#..'] },
    koin: { warna: '#ffd54a', baris: ['.###.', '#.#.#', '#.#.#', '#.#.#', '.###.'] },
    // Hayat (hidup/hayat.js): lapar, bau, mandi, obat.
    lapar: { warna: '#ffb347', baris: ['.#.#.', '#...#', '#####', '.###.'] },
    bau: { warna: '#9bc53d', baris: ['.#..#', '#..#.', '.#..#', '#..#.'] },
    gelembung: { warna: '#a8e6ff', baris: ['.##.', '#..#', '#..#', '.##.'] },
    obat: { warna: '#ff7b72', baris: ['.##.', '####', '####', '.##.'] },
    keringat: { warna: '#7cc8ff', baris: ['..#', '.##', '###', '###', '.#.'] },
};

export const LANGKAH_PARTIKEL = 10;

// Posisi partikel pada langkah ke-i (12 langkah per detik): melayang 2 petak
// per langkah ke arah `arah` (-1 naik, +1 turun), sedikit menyimpang tiap 3
// langkah, berkedip di akhir, lalu hilang.
export function langkahPartikel(i, { arah = -1, simpang = 0 } = {}) {
    if (i >= LANGKAH_PARTIKEL)
        return null;
    return {
        dx: Math.floor(i / 3) * simpang,
        dy: i * 2 * arah,
        tampak: !(i === 6 || i === 8),
    };
}

// Kapan Memo boleh tidur: lama tanpa aktivitas DAN kursor jauh (Coucou:
// 2 menit, 150 pt), dan tidak sedang ada yang perlu dilihat.
export const DETIK_TIDUR = 120;
export const JARAK_BANGUN = 150;

export function bolehTidur({ diamMs, jarakKursor, adaIzin, adaAktivitas, ekspresi }, detikTidur = DETIK_TIDUR) {
    return diamMs >= detikTidur * 1000 && jarakKursor > JARAK_BANGUN &&
        !adaIzin && !adaAktivitas && (ekspresi === 'netral' || ekspresi === 'tidur');
}
