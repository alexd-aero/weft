#!/usr/bin/env bash
# The examples' full lifecycle under weft-run, on both hosts, on spare ports:
# install → status (running) → update → status → uninstall → status (gone).
# Host-API examples (relay, shelf) are checked statically here and tested in
# their host. Run from the repository root: bash tools/test.sh
set -euo pipefail
cd "$(dirname "$0")/.."
export WEFT_MESH="$(mktemp -d)/mesh"     # a mesh of its own: never touches yours
MESH="$WEFT_MESH"
node tools/weft-check.mjs examples/* --publish
port=18791
for ex in hello-weft beacon pulse; do
  for host in selkies-forge burrow; do
    rm -rf ".weft-dev/$ex"
    run() { node tools/weft-run.mjs "examples/$ex" "$@" --host "$host" --set PORT=$port; }
    printf '\n== %s on %s (port %s)\n' "$ex" "$host" "$port"
    run install | tail -n 2
    run status | grep -q '→ running' || { echo "FAIL: $ex not running after install"; exit 1; }
    grep -q "\"id\": \"$ex\"" "$MESH/$ex.json" || { echo "FAIL: $ex not on the mesh"; exit 1; }
    run update | tail -n 1
    run status | grep -q '→ running' || { echo "FAIL: $ex not running after update"; exit 1; }
    run uninstall --purge | tail -n 1
    if curl -fs -m 2 "http://127.0.0.1:$port/health" >/dev/null 2>&1; then echo "FAIL: $ex still answering after uninstall"; exit 1; fi
    [ ! -f "$MESH/$ex.json" ] || { echo "FAIL: $ex left its mesh entry"; exit 1; }
    echo "ok: $ex on $host"
    port=$((port + 1))
  done
done
echo; echo "all examples pass"
