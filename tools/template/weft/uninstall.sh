#!/usr/bin/env bash
# uninstall: stop and remove the service (a linked copy is left to its host),
# and take this addon off the mesh. The host deletes the data folder itself
# when ADDON_KEEP_DATA=0.
set -euo pipefail
. "$(dirname "$0")/lib.sh"
case "$(conf linked 2>/dev/null)" in
  True|true) echo "it was linked: the Weft host that runs it keeps running it" ;;
  *) service_remove; mesh_withdraw; echo "stopped and removed ${ADDON_NAME:-$ADDON_ID}" ;;
esac
