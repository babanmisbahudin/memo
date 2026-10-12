"""Katalog pill ala Coucou: satu sumber kebenaran untuk semua pill.

Setara dengan PillCatalog.swift di Coucou: tiap pill (alat coding, agen AI,
penyedia chat, layanan) dideklarasikan di sini dengan id, warna, dan
kategorinya. Extension (agenStore.js) dan poller integrasi membaca modul ini
melewati berkas JSON, jadi tidak ada daftar pill ganda yang bisa berbeda
pendapat.

Murni: tidak menyentuh jaringan, D-Bus, maupun berkas.
"""

KATEGORI_SAH = ("alat", "agen", "penyedia", "layanan", "sistem")

KATALOG = [
    # Alat workspace utama (pilih satu sebagai utama, maks 4 tambahan)
    {"id": "vscode", "nama": "VS Code", "warna": "#007ACC", "kategori": "alat"},
    {"id": "cursor", "nama": "Cursor", "warna": "#7C3AED", "kategori": "alat"},
    {"id": "antigravity", "nama": "Antigravity", "warna": "#00D4FF", "kategori": "alat"},
    # Agen coding hidup
    {"id": "claude", "nama": "Claude Code", "warna": "#D97757", "kategori": "agen"},
    {"id": "codex", "nama": "Codex", "warna": "#10A37F", "kategori": "agen"},
    {"id": "gemini", "nama": "Gemini CLI", "warna": "#4285F4", "kategori": "agen"},
    {"id": "opencode", "nama": "OpenCode", "warna": "#F5F5F5", "kategori": "agen"},
    {"id": "copilot", "nama": "Copilot CLI", "warna": "#6E40C9", "kategori": "agen"},
    {"id": "amp", "nama": "Amp", "warna": "#FFAA00", "kategori": "agen"},
    # Penyedia chat
    {"id": "anthropic", "nama": "Anthropic", "warna": "#D97757", "kategori": "penyedia"},
    {"id": "openai", "nama": "OpenAI", "warna": "#10A37F", "kategori": "penyedia"},
    {"id": "google", "nama": "Google AI", "warna": "#4285F4", "kategori": "penyedia"},
    {"id": "ollama", "nama": "Ollama", "warna": "#000000", "kategori": "penyedia"},
    {"id": "lmstudio", "nama": "LM Studio", "warna": "#6B7280", "kategori": "penyedia"},
    # Layanan (tiap satu dapat Mochi berwarna sendiri ala Coucou)
    {"id": "github", "nama": "GitHub", "warna": "#24292F", "kategori": "layanan"},
    {"id": "vercel", "nama": "Vercel", "warna": "#000000", "kategori": "layanan"},
    {"id": "lebihteratur", "nama": "LebihTeratur", "warna": "#19266E", "kategori": "layanan"},
    {"id": "n8n", "nama": "n8n", "warna": "#EA4B71", "kategori": "layanan"},
    {"id": "notion", "nama": "Notion", "warna": "#111111", "kategori": "layanan"},
    {"id": "resend", "nama": "Resend", "warna": "#000000", "kategori": "layanan"},
    {"id": "musik", "nama": "Musik", "warna": "#FA243C", "kategori": "layanan"},
    # Sistem Memo sendiri
    {"id": "memo", "nama": "Memo", "warna": "#00C853", "kategori": "sistem"},
]


def daftar():
    return [dict(p) for p in KATALOG]


def cari(id_pill):
    for p in KATALOG:
        if p["id"] == id_pill:
            return dict(p)
    return None


def warna(id_pill, bawaan="#888888"):
    p = cari(id_pill)
    return p["warna"] if p else bawaan


def aktif_bawaan():
    """Pill yang aktif tanpa konfigurasi apa pun."""
    return ["memo", "claude", "opencode", "github"]
