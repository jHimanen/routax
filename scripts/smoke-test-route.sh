#!/usr/bin/env bash
# Smoke test for the GraphHopper routing service.
# Runs two routing requests between Helsinki points with opposite
# avoid_traffic values and asserts both return a valid LineString.
# Prints distances so you can confirm the routes differ.
set -euo pipefail
export LC_NUMERIC=C

GH_PORT="${GH_PORT:-8989}"
BASE_URL="http://localhost:${GH_PORT}"

# Helsinki Central Station → Hakaniemi Market Hall (~2 km, road choice exists)
POINT_A="[25.0097,60.1699]"
POINT_B="[24.9506,60.1791]"

PASS=0
FAIL=0

run_request() {
  local label="$1"
  local avoid_traffic="$2"
  local prefer_quiet="$3"

  # Compute multipliers from parameter values (same formula as v0-cycling.json)
  # avoid_traffic: PRIMARY = 1 - t*0.9, SECONDARY = 1 - t*0.5
  # prefer_quiet:  CYCLEWAY/TRACK/LIVING = 1 + q*0.8, GRAVEL/DIRT/SAND = 1 - q*0.4
  local primary_mult
  primary_mult=$(echo "scale=2; 1 - $avoid_traffic * 0.9" | bc)
  local secondary_mult
  secondary_mult=$(echo "scale=2; 1 - $avoid_traffic * 0.5" | bc)
  local quiet_mult
  quiet_mult=$(echo "scale=2; 1 + $prefer_quiet * 0.8" | bc)

  local body
  body=$(cat <<JSON
{
  "points": [${POINT_A}, ${POINT_B}],
  "profile": "bike",
  "points_encoded": false,
  "custom_model": {
    "priority": [
      {"if": "road_class == PRIMARY",   "multiply_by": "${primary_mult}"},
      {"else_if": "road_class == SECONDARY", "multiply_by": "${secondary_mult}"},
      {"if": "road_class == CYCLEWAY || road_class == TRACK || road_class == LIVING_STREET || road_class == PATH", "multiply_by": "${quiet_mult}"}
    ],
    "distance_influence": 70
  }
}
JSON
)

  local response
  response=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
    -X POST "${BASE_URL}/route" \
    -H "Content-Type: application/json" \
    -d "$body")

  local http_status
  http_status=$(echo "$response" | grep "HTTP_STATUS:" | cut -d: -f2)
  local body_only
  body_only=$(echo "$response" | grep -v "HTTP_STATUS:")

  printf "\n[%s] avoid_traffic=%.1f prefer_quiet=%.1f\n" "$label" "$avoid_traffic" "$prefer_quiet"
  printf "  HTTP status: %s\n" "$http_status"

  if [ "$http_status" != "200" ]; then
    printf "  FAIL — expected 200, got %s\n" "$http_status"
    printf "  Response: %s\n" "$body_only"
    FAIL=$((FAIL + 1))
    return
  fi

  if ! echo "$body_only" | grep -q '"type":"LineString"'; then
    printf "  FAIL — response does not contain LineString geometry\n"
    FAIL=$((FAIL + 1))
    return
  fi

  local distance
  distance=$(echo "$body_only" | grep -o '"distance":[0-9.]*' | head -1 | cut -d: -f2)
  printf "  PASS — route distance: %s m\n" "$distance"
  PASS=$((PASS + 1))
}

echo "GraphHopper smoke test"
echo "URL: ${BASE_URL}"
echo "Route: Helsinki Central → Hakaniemi Market Hall"

# Check GraphHopper is reachable (/info is the correct readiness endpoint;
# /health lives on the Dropwizard admin port 8990, not the routing port 8989)
if ! curl -sf "${BASE_URL}/info" > /dev/null; then
  echo ""
  echo "ERROR: GraphHopper not reachable at ${BASE_URL}"
  echo ""
  echo "If you haven't downloaded the OSM extract yet, run:"
  echo "  make download-osm   # ~450 MB, one-time"
  echo "  make up             # restarts GH so it can find the PBF"
  echo ""
  echo "If GH is still starting up after a fresh graph build, wait a few"
  echo "minutes and retry (first boot imports Finland, which takes ~5 min)."
  exit 1
fi

# Request 1: neutral — no traffic or surface preference
run_request "neutral    " 0.0 0.0

# Request 2: max avoid_traffic — strongly prefers quiet roads
run_request "max-traffic" 1.0 0.0

# Request 3: max prefer_quiet — strongly prefers cycleways and tracks
run_request "max-quiet  " 0.0 1.0

echo ""
echo "Results: ${PASS} passed, ${FAIL} failed"
echo ""
echo "Note: if all three distances are identical, there may be no road-class"
echo "variation on this test route. Try different coordinate pairs."
echo ""
echo "Note: max_gradient is not tested here — Geofabrik PBFs do not include"
echo "elevation data. Add SRTM data to GraphHopper (Phase 3+) to enable slope."

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
