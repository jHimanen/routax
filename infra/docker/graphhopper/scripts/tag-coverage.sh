#!/usr/bin/env bash
#
# tag-coverage.sh — measure OSM tag coverage among cycling-routable ways.
#
# For each candidate tag, reports how many ways carry it and what % of
# bike-routable ways that represents. Use the output to decide whether
# a tag is dense enough in your extract to justify adding to
# graph.encoded_values in infra/docker/graphhopper/config.yml.
#
# Requires: osmium-tool (brew install osmium-tool).
#
# Usage:
#   ./tag-coverage.sh [PBF_PATH] [--values]
#
#   PBF_PATH   defaults to ../data/finland-latest.osm.pbf
#   --values   also print the top values for each tag
#
# "Bike-routable" = ways with a highway=* tag, excluding
# motorway / motorway_link / trunk / trunk_link (matching the
# graphhopper config's import.osm.ignored_highways).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_PBF="${SCRIPT_DIR}/../data/finland-latest.osm.pbf"

PBF=""
SHOW_VALUES=0
for arg in "$@"; do
  case "$arg" in
    --values) SHOW_VALUES=1 ;;
    --help|-h)
      sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    -*)
      echo "Unknown flag: $arg" >&2
      exit 2
      ;;
    *)
      PBF="$arg"
      ;;
  esac
done
PBF="${PBF:-$DEFAULT_PBF}"

if ! command -v osmium >/dev/null 2>&1; then
  echo "osmium not found. Install with: brew install osmium-tool" >&2
  exit 1
fi

if [[ ! -f "$PBF" ]]; then
  echo "PBF not found: $PBF" >&2
  echo >&2
  echo "Download the Finland extract:" >&2
  echo "  curl -L -o '$PBF' https://download.geofabrik.de/europe/finland-latest.osm.pbf" >&2
  exit 1
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

count_ways() {
  # Extract "Number of ways: N" from `osmium fileinfo -e`.
  osmium fileinfo -e "$1" 2>/dev/null \
    | awk -F': *' '/Number of ways/ {gsub(/[^0-9]/,"",$2); print $2; exit}'
}

echo "PBF:  $PBF"
echo "==> Filtering to bike-routable ways..."

ALL_HW="$TMP_DIR/highways.osm.pbf"
BIKE="$TMP_DIR/bike.osm.pbf"

osmium tags-filter --overwrite -o "$ALL_HW" "$PBF" w/highway >/dev/null
osmium tags-filter --overwrite --invert-match -o "$BIKE" "$ALL_HW" \
  w/highway=motorway,motorway_link,trunk,trunk_link >/dev/null

TOTAL=$(count_ways "$BIKE")
if [[ -z "${TOTAL:-}" || "$TOTAL" -eq 0 ]]; then
  echo "No bike-routable ways found — is the PBF empty?" >&2
  exit 1
fi
echo "    bike-routable ways: $TOTAL"
echo

# Candidate tags worth evaluating. Add or remove freely.
#   - already-encoded:  surface
#   - high-value enums: smoothness, tracktype, lit
#   - access / class:   bicycle, cycleway, access, service
#   - geometry:         lanes, width, oneway
#   - structure:        tunnel, bridge
#   - cycling-specific: mtb:scale, sidewalk
#   - speed:            maxspeed
#   - elevation hints:  incline
TAGS=(
  surface
  smoothness
  tracktype
  lit
  maxspeed
  bicycle
  cycleway
  lanes
  width
  tunnel
  bridge
  oneway
  service
  access
  sidewalk
  incline
  "mtb:scale"
)

RESULTS="$TMP_DIR/results.tsv"
: > "$RESULTS"

echo "==> Counting tags..."
for tag in "${TAGS[@]}"; do
  safe="${tag//:/_}"
  out="$TMP_DIR/with-${safe}.osm.pbf"
  osmium tags-filter --overwrite -o "$out" "$BIKE" "w/$tag" >/dev/null 2>&1
  n=$(count_ways "$out")
  n="${n:-0}"
  pct=$(awk -v n="$n" -v t="$TOTAL" 'BEGIN { if (t>0) printf "%.4f", 100*n/t; else print "0" }')
  printf "%s\t%s\t%s\n" "$tag" "$n" "$pct" >> "$RESULTS"
  echo "    $tag"
done
echo

echo "Coverage (sorted, % of $TOTAL bike-routable ways):"
printf "  %-14s %12s %10s\n" "TAG" "WAYS" "COVERAGE"
printf "  %-14s %12s %10s\n" "---" "----" "--------"
sort -t$'\t' -k3 -nr "$RESULTS" \
  | awk -F'\t' '{ printf "  %-14s %12d %9.1f%%\n", $1, $2, $3 }'

if [[ "$SHOW_VALUES" -eq 1 ]]; then
  echo
  echo "Top values per tag (descending count):"
  while IFS=$'\t' read -r tag n pct; do
    [[ "$n" -eq 0 ]] && continue
    echo
    echo "  $tag  ($n ways, ${pct%.*}%):"
    osmium tags-count "$BIKE" "w/$tag" 2>/dev/null \
      | sort -rn | head -8 \
      | awk '{ printf "    %8d  %s\n", $1, $2 }'
  done < <(sort -t$'\t' -k3 -nr "$RESULTS")
fi
