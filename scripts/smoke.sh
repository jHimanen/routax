#!/usr/bin/env bash
# End-to-end smoke test through Caddy (https://localhost).
# Uses -k / --insecure because the local TLS cert is self-signed.
# POST /api/route requires GraphHopper to be fully loaded with OSM data (~5 min cold start).
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

echo "Smoke — entry: $BASE"
echo ""

check "web"        GET  "/"           200
check "api/health" GET  "/api/health" 200
check "api/route"  POST "/api/route"  200 \
  -H "Content-Type: application/json" \
  -d '{"start":{"lat":60.1699,"lng":25.0097},"end":{"lat":60.1791,"lng":24.9506},"profile":{"avoidTraffic":0,"preferQuietSurfaces":0,"maxGradient":1}}'

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
