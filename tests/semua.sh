#!/usr/bin/env bash
# Jalankan semua tes Memo. Keluar 1 bila ada yang gagal.
cd "$(dirname "$0")/.." || exit 1
gagal=0
for t in tests/test_*.py; do
    if keluar=$(timeout 180 python3 "$t" </dev/null 2>&1); then
        printf '  ok     %-28s %s\n' "$(basename "$t")" "$(tail -1 <<<"$keluar")"
    else
        gagal=1
        printf '  GAGAL  %s\n' "$(basename "$t")"
        grep -E 'GAGAL|Error|Traceback' <<<"$keluar" | head -10 | sed 's/^/         /'
    fi
done
exit $gagal
