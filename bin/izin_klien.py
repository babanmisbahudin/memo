"""Klien memo-agen untuk program Memo sendiri (chat), bukan untuk hook agen.

Chat Memo memakai jalur yang sama dengan Claude Code: tampil sebagai sesi
"memo" di island, dan perintah shell yang diusulkan AI baru jalan setelah
diklik Izinkan di kartu izin. Tanpa klik — memo-agen mati, ditolak, atau
habis waktu — perintahnya tidak dijalankan (gagal tertutup).
"""

import json
import socket

import hook_pola

SESI = "memo-ngobrol"
AGEN = "memo"
BATAS_SAMBUNG = 0.3


def kirim(ev, tunggu=0.0):
    """Kirim satu event; bila `tunggu` > 0, kembalikan baris jawaban."""
    ev = {"session_id": SESI, "memo_agen": AGEN, "cwd": "ngobrol", **ev}
    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    try:
        s.settimeout(BATAS_SAMBUNG)
        s.connect(hook_pola.jalur_soket())
        s.settimeout(2.0)
        s.sendall((json.dumps(ev, ensure_ascii=False) + "\n").encode("utf-8"))
        if tunggu <= 0:
            return None
        s.settimeout(tunggu)
        buf = b""
        while b"\n" not in buf:
            potong = s.recv(4096)
            if not potong:
                break
            buf += potong
        return buf.decode("utf-8", "replace").strip() or None
    except OSError:
        return None
    finally:
        s.close()


def mulai(prompt):
    kirim({"hook_event_name": "UserPromptSubmit", "prompt": str(prompt)[:500]})


def langkah(ringkasan):
    kirim({"hook_event_name": "PreToolUse", "tool_name": "Bash", "tool_input": {"command": ringkasan}})


def selesai(berhasil=True):
    kirim({"hook_event_name": "Stop" if berhasil else "StopFailure"})


def minta_izin(perintah, batas=hook_pola.BATAS_TUNGGU_DETIK):
    """True hanya bila pengguna mengklik Izinkan/Selalu untuk perintah ini."""
    jawab = kirim({"hook_event_name": "PermissionRequest", "tool_name": "Bash",
                   "tool_input": {"command": perintah, "description": "usulan dari chat Memo"}},
                  tunggu=batas)
    return jawab in ("allow", "always")


def tambah_riwayat(riwayat, peran, teks, batas=20):
    """Daftar percakapan baru dengan satu giliran ditambahkan (murni)."""
    teks = " ".join(str(teks or "").split())
    if not teks:
        return list(riwayat or [])
    baru = list(riwayat or []) + [{"peran": peran, "teks": teks[:1000]}]
    return baru[-batas:]
