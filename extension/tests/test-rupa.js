// Jalankan: gjs -m extension/tests/test-rupa.js
import { RUPA_BARIS, RUPA_KOLOM, pikselRupa } from '../hidup/rupa.js';
import { TAHAP } from '../hidup/hayat.js';

let gagal = 0;
let lolos = 0;
const cek = (label, syarat) => {
    if (syarat) {
        lolos++;
    } else {
        gagal++;
        console.log(`GAGAL: ${label}`);
    }
};

const tahapan = ['telur', ...TAHAP.map(([n]) => n)];
const warnaDi = (d, rgb) => d.filter(([, , w]) => w.join() === rgb.join()).length;
for (const kelamin of ['laki-laki', 'perempuan', null]) {
    for (const tahap of tahapan) {
        const d = pikselRupa({ kelamin, tahap });
        cek(`${kelamin}/${tahap}: piksel bilangan bulat di batas`, d.every(([x, y, w]) => Number.isInteger(x) && Number.isInteger(y) &&
            x >= RUPA_KOLOM[0] && x <= RUPA_KOLOM[1] && y >= RUPA_BARIS[0] && y <= RUPA_BARIS[1] && w.length === 3));
        cek(`${kelamin}/${tahap}: tanpa piksel ganda`, new Set(d.map(([x, y]) => `${x},${y}`)).size === d.length);
    }
}
const ada = (o, rgb) => warnaDi(pikselRupa(o), rgb) > 0;
cek('telur tanpa aksesori', pikselRupa({ kelamin: 'perempuan', tahap: 'telur' }).length === 0);
cek('belum memilih jenis kelamin & dewasa: tanpa aksesori', pikselRupa({ kelamin: null, tahap: 'dewasa' }).length === 0);
cek('laki-laki bertopi merah, perempuan berpita', ada({ kelamin: 'laki-laki' }, [225, 60, 60]) && ada({ kelamin: 'perempuan' }, [255, 90, 140]) &&
    !ada({ kelamin: 'perempuan' }, [225, 60, 60]));
cek('topi biru di badan pink/kuning', ada({ kelamin: 'laki-laki', warna: 'pink' }, [70, 120, 230]) && ada({ kelamin: 'laki-laki', warna: 'kuning' }, [70, 120, 230]));
cek('pita di badan pink jadi merah tua', ada({ kelamin: 'perempuan', warna: 'pink' }, [200, 50, 100]) &&
    !ada({ kelamin: 'perempuan', warna: 'pink' }, [255, 90, 140]));
cek('bayi berempeng', ada({ tahap: 'bayi' }, [120, 200, 255]) && !ada({ tahap: 'anak' }, [120, 200, 255]));
cek('remaja ber-headphone', ada({ tahap: 'remaja' }, [70, 72, 82]));
cek('tua: alis putih & tongkat', ada({ tahap: 'tua' }, [235, 235, 230]) && ada({ tahap: 'tua' }, [140, 95, 55]));
cek('tua laki-laki berjanggut, perempuan berkacamata', ada({ kelamin: 'laki-laki', tahap: 'tua' }, [240, 240, 235]) &&
    ada({ kelamin: 'perempuan', tahap: 'tua' }, [200, 170, 90]) && !ada({ kelamin: 'perempuan', tahap: 'tua' }, [240, 240, 235]));
for (const kepala of ['tanpa', 'antena', 'mahkota', 'tanduk', 'daun', 'bandoKucing']) {
    for (const ekstra of ['tanpa', 'syal', 'dasi', 'kalung', 'sayap', 'ekor']) {
        const d = pikselRupa({ kelamin: 'perempuan', tahap: 'dewasa', kepala, ekstra });
        cek(`studio ${kepala}/${ekstra}: di batas`, d.every(([x, y]) => x >= RUPA_KOLOM[0] && x <= RUPA_KOLOM[1] && y >= RUPA_BARIS[0] && y <= RUPA_BARIS[1]));
    }
}
cek('kepala pilihan menggantikan topi/pita bawaan', !ada({ kelamin: 'perempuan', kepala: 'mahkota' }, [255, 90, 140]) &&
    ada({ kelamin: 'perempuan', kepala: 'mahkota' }, [255, 200, 60]) && pikselRupa({ kelamin: 'laki-laki', kepala: 'tanpa' }).length === 0);
cek('ekstra tergambar', ['syal', 'dasi', 'kalung', 'sayap', 'ekor'].every(e => pikselRupa({ ekstra: e }).length > 4));
// Aksesori tidak menutupi mata (kolom 11-16 & 24-29, baris 10-14), kecuali bingkai kacamata di sekelilingnya.
const tutupMata = d => d.some(([x, y]) => y >= 10 && y <= 14 && ((x >= 11 && x <= 16) || (x >= 24 && x <= 29)));
cek('aksesori tidak menutupi mata', tahapan.every(t => ['laki-laki', 'perempuan', null].every(k => !tutupMata(pikselRupa({ kelamin: k, tahap: t })))));

console.log(`\n${lolos} lolos, ${gagal} gagal`);
if (gagal)
    throw new Error(`${gagal} gagal`);
