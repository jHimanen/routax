#!/usr/bin/env bash
# End-to-end smoke test through Caddy (https://localhost).
# Uses -k / --insecure because the local TLS cert is self-signed.
# POST /api/route requires GraphHopper to be fully loaded with OSM data (~5 min cold start).
# Requires: curl, jq
set -euo pipefail

BASE="https://localhost"
GH_URL="${GH_URL:-http://localhost:8989}"
PASS=0
FAIL=0

check() {
  local label="$1" method="$2" path="$3" expected_status="$4"
  shift 4
  local extra_args=("$@")
  local status
  status=$(curl -sk -o /dev/null -w "%{http_code}" \
    -X "$method" "${BASE}${path}" "${extra_args[@]+"${extra_args[@]}"}")
  if [ "$status" = "$expected_status" ]; then
    echo "PASS [$label] $method $path → $status"
    PASS=$((PASS + 1))
  else
    echo "FAIL [$label] $method $path → $status (expected $expected_status)"
    FAIL=$((FAIL + 1))
  fi
}

check_elevation() {
  local label="$1"
  local body="$2"

  local response
  response=$(curl -sk -X POST "${BASE}/api/route" \
    -H "Content-Type: application/json" \
    -d "$body")

  local coord_len elev_len ascent
  coord_len=$(echo "$response" | jq '.geometry.coordinates | length')
  elev_len=$(echo "$response"  | jq '.elevationProfile | length')
  ascent=$(echo "$response"    | jq '.ascent')

  if [ "$coord_len" -gt 0 ] && [ "$coord_len" -eq "$elev_len" ]; then
    echo "PASS [$label/elevation-length] elevationProfile.length == coordinates.length ($coord_len)"
    PASS=$((PASS + 1))
  else
    echo "FAIL [$label/elevation-length] coord=$coord_len elev=$elev_len"
    FAIL=$((FAIL + 1))
  fi

  if (( $(echo "$ascent > 0" | bc -l) )); then
    echo "PASS [$label/ascent] ascent=$ascent > 0"
    PASS=$((PASS + 1))
  else
    echo "FAIL [$label/ascent] ascent=$ascent (expected > 0)"
    FAIL=$((FAIL + 1))
  fi
}

check_surfaces() {
  local label="$1"
  local body="$2"

  local response surf_len coord_len expected distinct
  response=$(curl -sk -X POST "${BASE}/api/route" \
    -H "Content-Type: application/json" \
    -d "$body")

  coord_len=$(echo "$response" | jq '.geometry.coordinates | length')
  surf_len=$(echo "$response"  | jq '.surfaces | length')
  expected=$(( coord_len - 1 ))

  if [ "$surf_len" -eq "$expected" ] && [ "$surf_len" -gt 0 ]; then
    echo "PASS [$label/surfaces-length] surfaces.length == coordinates.length - 1 ($surf_len)"
    PASS=$((PASS + 1))
  else
    echo "FAIL [$label/surfaces-length] surf=$surf_len expected=$expected"
    FAIL=$((FAIL + 1))
  fi

  distinct=$(echo "$response" | jq '.surfaces | unique | length')
  if [ "$distinct" -ge 2 ]; then
    echo "PASS [$label/surfaces-diversity] distinct surface classes=$distinct"
    PASS=$((PASS + 1))
  else
    echo "FAIL [$label/surfaces-diversity] only $distinct distinct class(es)"
    FAIL=$((FAIL + 1))
  fi
}

check_encoded_values() {
  local label="$1"
  local details_json='["road_class","road_environment","road_access","max_speed","track_type","smoothness","bike_network","mtb_rating","bike_priority"]'
  local evs=("road_class" "road_environment" "road_access" "max_speed" "track_type" "smoothness" "bike_network" "mtb_rating" "bike_priority")

  local tmpfile
  tmpfile=$(mktemp)
  local status
  status=$(curl -sk -o "$tmpfile" -w "%{http_code}" -X POST "${GH_URL}/route" \
    -H "Content-Type: application/json" \
    -d "{\"points\":[[23.760,61.498],[25.747,62.243]],\"profile\":\"bike\",\"ch.disable\":true,\"details\":${details_json}}")
  local response
  response=$(cat "$tmpfile")
  rm -f "$tmpfile"

  if [ "$status" = "200" ]; then
    echo "PASS [$label/ev-status] ${GH_URL}/route → 200"
    PASS=$((PASS + 1))
  else
    echo "FAIL [$label/ev-status] ${GH_URL}/route → $status (expected 200)"
    FAIL=$((FAIL + 1))
    return
  fi

  local all_present=true
  for ev in "${evs[@]}"; do
    local has
    has=$(echo "$response" | jq --arg ev "$ev" '.paths[0].details | has($ev)')
    if [ "$has" != "true" ]; then
      echo "FAIL [$label/ev-present] missing key: $ev"
      FAIL=$((FAIL + 1))
      all_present=false
    fi
  done
  $all_present && {
    echo "PASS [$label/ev-present] all ${#evs[@]} EV keys present in paths[0].details"
    PASS=$((PASS + 1))
  }

  local non_empty
  non_empty=$(echo "$response" | jq '[.paths[0].details | to_entries[] | select(.value | length > 0)] | length')
  if [ "$non_empty" -ge 3 ]; then
    echo "PASS [$label/ev-populated] $non_empty EVs have non-empty range arrays (≥3 required)"
    PASS=$((PASS + 1))
  else
    echo "FAIL [$label/ev-populated] only $non_empty EVs have non-empty range arrays (≥3 required)"
    FAIL=$((FAIL + 1))
  fi
}

echo "Smoke — entry: $BASE"
echo ""

check "web"        GET  "/"           200
check "api/health" GET  "/api/health" 200
check "api/route"  POST "/api/route"  200 \
  -H "Content-Type: application/json" \
  -d '{"waypoints":[{"lat":60.1699,"lng":25.0097},{"lat":60.1791,"lng":24.9506}],"preset":"fastest_direct"}'

# Elevation and surface checks on Tampere→Jyväskylä — enough relief for non-zero ascent,
# enough route variety for ≥2 distinct surface classes
check_elevation "tampere-jyvaskyla" \
  '{"waypoints":[{"lat":61.498,"lng":23.760},{"lat":62.243,"lng":25.747}],"preset":"fastest_direct"}'
check_surfaces "tampere-jyvaskyla" \
  '{"waypoints":[{"lat":61.498,"lng":23.760},{"lat":62.243,"lng":25.747}],"preset":"fastest_direct"}'

# Verify all nine newly-indexed EVs are queryable directly from GraphHopper.
# Calls GH at $GH_URL (not through the Routax API, which does not expose details=).
check_encoded_values "tampere-jyvaskyla"

# Verify that all five new RoutingProfile fields are accepted by the API end-to-end.
check "advanced-fields" POST "/api/route" 200 \
  -H "Content-Type: application/json" \
  -d '{"waypoints":[{"lat":61.498,"lng":23.760},{"lat":62.243,"lng":25.747}],"preset":"fastest_direct","advancedOverrides":{"allowFerries":true,"allowWaterCrossings":true,"preferCycleways":1,"preferLargerRoads":1,"maxTrailDifficulty":6}}'

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
