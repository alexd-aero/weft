#!/usr/bin/env bash
# action "Publish the mesh now": restart the relay, which syncs at once.
set -euo pipefail
. "$(dirname "$0")/lib.sh"
service_start
wait_up || { echo "it did not come back; see $LOG"; exit 1; }
sleep 2
curl -fs "$(url)api/routes" | python3 -c 'import json,sys; d=json.load(sys.stdin); [print("%-12s %s" % kv) for kv in sorted(d["routes"].items())]; d["error"] and print("error:", d["error"])'
