#!/usr/bin/env bash
set -euo pipefail

DEST="infra/docker/graphhopper/osm/finland-latest.osm.pbf"
URL="https://download.geofabrik.de/europe/finland-latest.osm.pbf"

if [ -f "$DEST" ]; then
  echo "Finland OSM extract already present at $DEST"
  echo "Delete the file and re-run to force a fresh download."
  exit 0
fi

echo "Downloading Finland OSM extract (~450 MB) from Geofabrik..."
curl -L --progress-bar -o "$DEST" "$URL"
echo "Done: $DEST"
