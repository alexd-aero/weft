#!/usr/bin/env bash
# uninstall: take down exactly the tunnels the relay made, then stop it.
set -euo pipefail
. "$(dirname "$0")/lib.sh"
if [ -f "$DATA/routes.json" ] && [ -n "${BURROW_SOCKET:-}" ]; then
  python3 - "$DATA/routes.json" "$BURROW_SOCKET" <<'PY'
import http.client, json, os, socket, sys
mine = json.load(open(sys.argv[1]))
for aid, port in mine.items():
    c = http.client.HTTPConnection("burrow", timeout=60)
    c.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM); c.sock.connect(os.path.realpath(sys.argv[2]))
    c.request("DELETE", "/tunnels/%d" % int(port), headers={"X-Burrow-Client": "weft-relay"})
    print("unpublished", aid, "(port %s): HTTP %d" % (port, c.getresponse().status))
    c.close()
PY
fi
service_remove
mesh_withdraw
echo "stopped and removed Weft Relay"
