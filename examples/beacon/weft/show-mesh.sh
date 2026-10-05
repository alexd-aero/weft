#!/usr/bin/env bash
# action "Show the mesh": every entry, and whether it answers.
set -euo pipefail
. "$(dirname "$0")/lib.sh"
python3 - "$DIR/weft" <<'PY'
import sys, urllib.request
sys.path.insert(0, sys.argv[1])
import mesh
for p in mesh.peers(include_stale=True):
    up = "-"
    if p.get("health"):
        try:
            urllib.request.urlopen(p["health"], timeout=2).read(); up = "up"
        except Exception:
            up = "down"
    print("%-12s %-8s %-6s %-6s %s" % (p["id"], p.get("version", ""), "stale" if p["stale"] else "fresh", up, p.get("url", "")))
PY
