#!/usr/bin/env bash
# Monthly refresh of the OSRM routing data (plan §13.1, Phase 5).
#
# Builds a fresh Geofabrik extract into data.next/ while the running `osrm` service keeps
# serving the current data, then swaps the folders and restarts the service. If the build
# fails, the current data and service are left untouched.
#
#   infrastructure/osrm/refresh.sh
#
# Schedule it monthly (Geofabrik updates the extract daily; road changes in Bocaue are
# slow), e.g. cron on the routing host:  0 3 1 * *  /path/to/agap/infrastructure/osrm/refresh.sh
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
NEXT="$HERE/data.next"
CURRENT="$HERE/data"
PREVIOUS="$HERE/data.previous"

rm -rf "$NEXT"
DATA_DIR="$NEXT" "$HERE/build.sh"

rm -rf "$PREVIOUS"
if [[ -d "$CURRENT" ]]; then mv "$CURRENT" "$PREVIOUS"; fi
mv "$NEXT" "$CURRENT"

cd "$ROOT"
docker compose --profile routing up -d --force-recreate osrm
echo "OSRM data refreshed ($(cat "$CURRENT/BUILT_AT")). The previous build is in $PREVIOUS until the next refresh."
