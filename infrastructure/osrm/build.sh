#!/usr/bin/env bash
# Builds the self-hosted OSRM routing data for AGAP (plan §13.1, Phase 5).
#
#   infrastructure/osrm/build.sh            # download the Philippines extract and build
#   infrastructure/osrm/build.sh --no-download   # rebuild from the .pbf already in data/
#
# Output: infrastructure/osrm/data/philippines-latest.osrm* (MLD, car profile), served by
# the `osrm` service in docker-compose.yml (`docker compose --profile routing up -d osrm`).
# Needs Docker, ~2 GB disk and several GB of free RAM for osrm-extract. Takes a while:
# do not run it on a laptop that is also serving a live demo.
set -euo pipefail

# Same pinned image as the compose service (no unbounded "latest", CLAUDE.md).
OSRM_IMAGE="${OSRM_IMAGE:-ghcr.io/project-osrm/osrm-backend:v5.27.1}"
EXTRACT_URL="${EXTRACT_URL:-https://download.geofabrik.de/asia/philippines-latest.osm.pbf}"
HERE="$(cd "$(dirname "$0")" && pwd)"
DATA_DIR="${DATA_DIR:-$HERE/data}"
NAME="philippines-latest"

mkdir -p "$DATA_DIR"

if [[ "${1:-}" != "--no-download" ]]; then
  echo "Downloading $EXTRACT_URL"
  curl -fL --retry 3 -o "$DATA_DIR/$NAME.osm.pbf.part" "$EXTRACT_URL"
  mv "$DATA_DIR/$NAME.osm.pbf.part" "$DATA_DIR/$NAME.osm.pbf"
fi

# Git Bash on Windows would rewrite /data and /opt paths; keep them as written.
export MSYS_NO_PATHCONV=1
run() { docker run --rm -t -v "$DATA_DIR:/data" "$OSRM_IMAGE" "$@"; }

echo "osrm-extract (car profile)"
run osrm-extract -p /opt/car.lua "/data/$NAME.osm.pbf"
echo "osrm-partition"
run osrm-partition "/data/$NAME.osrm"
echo "osrm-customize"
run osrm-customize "/data/$NAME.osrm"

date -u +"%Y-%m-%dT%H:%M:%SZ" > "$DATA_DIR/BUILT_AT"
echo "Done. Start or restart it with: docker compose --profile routing up -d osrm"
