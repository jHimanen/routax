#!/usr/bin/env bash
# End-to-end smoke test through Caddy (https://localhost).
# Uses -k / --insecure because the local TLS cert is self-signed.
# POST /api/route requires GraphHopper to be fully loaded with OSM data (~5 min cold start).
# Requires: curl, jq
set -euo pipefail

BASE="https://localhost"
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

echo "Smoke — entry: $BASE"
echo ""

check "web"        GET  "/"           200
check "api/health" GET  "/api/health" 200
check "api/route"  POST "/api/route"  200 \
  -H "Content-Type: application/json" \
  -d '{"start":{"lat":60.1699,"lng":25.0097},"end":{"lat":60.1791,"lng":24.9506},"profile":{"avoidTraffic":0,"preferQuietSurfaces":0,"maxGradient":1}}'

# Elevation checks on Tampere→Jyväskylä — enough relief to guarantee non-zero ascent
check_elevation "tampere-jyvaskyla" \
  '{"start":{"lat":61.498,"lng":23.760},"end":{"lat":62.243,"lng":25.747},"profile":{"avoidTraffic":0,"preferQuietSurfaces":0,"maxGradient":20}}'

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
