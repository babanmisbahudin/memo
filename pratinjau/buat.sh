#!/usr/bin/env bash
# Galeri desain Memo untuk dilihat di browser (tanpa GNOME):
#
#   pratinjau/buat.sh          render ulang + buka di http://127.0.0.1:8765
#
# Bingkai dirender modul extension yang sama (render.js), dijadikan GIF
# 12 fps dengan Pillow, lalu disajikan python http.server hanya di
# 127.0.0.1. Hasil di pratinjau/hasil/ (tidak di-git).
set -euo pipefail
DI="$(cd "$(dirname "$0")" && pwd)"
HASIL="$DI/hasil"
rm -rf "$HASIL" && mkdir -p "$HASIL"
gjs -m "$DI/render.js" "$HASIL"
python3 - "$HASIL" <<'PY'
import pathlib, sys
from PIL import Image
h = pathlib.Path(sys.argv[1])
for d in sorted(p for p in h.iterdir() if p.is_dir()):
    bingkai = [Image.open(f).convert("RGB") for f in sorted(d.glob("*.png"))]
    bingkai[0].save(h / f"{d.name}.gif", save_all=True, append_images=bingkai[1:], duration=83, loop=0, optimize=True)
    for f in d.glob("*.png"):
        f.unlink()
    d.rmdir()
PY
cp "$DI/index.html" "$HASIL/"
echo "galeri: $HASIL/index.html"
if [ "${1:-}" != "--tanpa-server" ]; then
    pkill -f "http.server 8765 --bind 127.0.0.1" 2>/dev/null || true
    (cd "$HASIL" && setsid python3 -m http.server 8765 --bind 127.0.0.1 </dev/null >/dev/null 2>&1 &)
    echo "buka: http://127.0.0.1:8765"
fi
