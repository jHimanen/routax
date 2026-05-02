#!/usr/bin/env bash
# Integration test for scripts/osm-reimport.sh
# Uses a local fixture PBF so no network is required.
# Docker commands are replaced with a no-op via REIMPORT_DOCKER_CMD.
set -euo pipefail

SCRIPT="$(cd "$(dirname "$0")/../.." && pwd)/scripts/osm-reimport.sh"
PASS=0
FAIL=0

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

TMPDIR_BASE=$(mktemp -d)
cleanup() { rm -rf "$TMPDIR_BASE"; }
trap cleanup EXIT

assert() {
  local label="$1" condition="$2"
  if eval "$condition"; then
    echo "PASS [$label]"
    PASS=$((PASS + 1))
  else
    echo "FAIL [$label] — condition: $condition"
    FAIL=$((FAIL + 1))
  fi
}

make_data_dir() {
  local d
  d=$(mktemp -d "${TMPDIR_BASE}/data-XXXX")
  echo "$d"
}

# Fake docker that records calls to a log file
make_docker_stub() {
  local log_file="$1"
  cat > "${TMPDIR_BASE}/docker-stub.sh" <<STUB
#!/usr/bin/env bash
echo "docker-stub: \$*" >> "${log_file}"
STUB
  chmod +x "${TMPDIR_BASE}/docker-stub.sh"
  echo "${TMPDIR_BASE}/docker-stub.sh"
}

# Run the reimport script with a given data dir and flags
run_reimport() {
  local data_dir="$1"
  shift
  local docker_log="${data_dir}/docker.log"
  local stub
  stub=$(make_docker_stub "$docker_log")
  DATA_DIR="$data_dir" \
  GH_HEALTH_URL="file:///dev/null" \
  GH_INFO_URL="file:///dev/null" \
  REIMPORT_DOCKER_CMD="bash ${stub}" \
  bash "$SCRIPT" "$@" 2>&1
}

# ---------------------------------------------------------------------------
# Test 1: --dry-run exits 0 and writes nothing
# ---------------------------------------------------------------------------

T1_DIR=$(make_data_dir)

run_reimport "$T1_DIR" --dry-run > /dev/null

assert "dry-run/no-ledger"   "[[ ! -f '${T1_DIR}/osm-import-ledger.json' ]]"
assert "dry-run/no-pbf-tmp"  "[[ ! -f '${T1_DIR}/finland-latest.osm.pbf.tmp' ]]"

# ---------------------------------------------------------------------------
# Test 2: --force fails when no PBF exists
# ---------------------------------------------------------------------------

T2_DIR=$(make_data_dir)
set +e
run_reimport "$T2_DIR" --force > /dev/null 2>&1
T2_EXIT=$?
set -e
assert "force/no-pbf exits nonzero" "[[ '$T2_EXIT' -ne 0 ]]"

# ---------------------------------------------------------------------------
# Test 3: --force with existing PBF writes ledger and invokes docker stop/up
# ---------------------------------------------------------------------------

T3_DIR=$(make_data_dir)
# Create a small fake PBF
echo "fake-pbf-content" > "${T3_DIR}/finland-latest.osm.pbf"

# GH_HEALTH_URL points to a file that doesn't exist, so curl will fail.
# Override wait_for_health by making GH_HEALTH_URL succeed immediately.
# We create a tiny HTTP response via a temp file served by a process substitution trick —
# instead, just point it at a local file that curl can read with file:// URI.
HEALTHY_FILE=$(mktemp "${TMPDIR_BASE}/healthy-XXXX")
echo '{"status":"green"}' > "$HEALTHY_FILE"

T3_DOCKER_LOG="${T3_DIR}/docker.log"
T3_STUB=$(make_docker_stub "$T3_DOCKER_LOG")
set +e
DATA_DIR="$T3_DIR" \
GH_HEALTH_URL="file://${HEALTHY_FILE}" \
GH_INFO_URL="file://${HEALTHY_FILE}" \
REIMPORT_DOCKER_CMD="bash ${T3_STUB}" \
bash "$SCRIPT" --force > /dev/null 2>&1
T3_EXIT=$?
set -e

assert "force/exits-zero"   "[[ '$T3_EXIT' -eq 0 ]]"
assert "force/ledger-written" "[[ -f '${T3_DIR}/osm-import-ledger.json' ]]"
assert "force/docker-stop-called" "grep -q 'stop graphhopper' '${T3_DOCKER_LOG}'"
assert "force/docker-up-called"   "grep -q 'up -d graphhopper' '${T3_DOCKER_LOG}'"

# Ledger fields
if [[ -f "${T3_DIR}/osm-import-ledger.json" ]]; then
  assert "force/ledger-has-sha256"      "jq -e '.sha256'        '${T3_DIR}/osm-import-ledger.json' > /dev/null"
  assert "force/ledger-has-imported_at" "jq -e '.imported_at'   '${T3_DIR}/osm-import-ledger.json' > /dev/null"
  assert "force/ledger-has-url"         "jq -e '.url'           '${T3_DIR}/osm-import-ledger.json' > /dev/null"
  assert "force/ledger-has-size_bytes"  "jq -e '.size_bytes'    '${T3_DIR}/osm-import-ledger.json' > /dev/null"
  assert "force/ledger-has-gh-version"  "jq -e '.graphhopper_version' '${T3_DIR}/osm-import-ledger.json' > /dev/null"
fi

# ---------------------------------------------------------------------------
# Test 4: Second --force run updates imported_at
# ---------------------------------------------------------------------------

T4_DIR="$T3_DIR"  # reuse directory with existing ledger
OLD_TS=$(jq -r '.imported_at' "${T4_DIR}/osm-import-ledger.json")
sleep 1  # ensure timestamp differs

DATA_DIR="$T4_DIR" \
GH_HEALTH_URL="file://${HEALTHY_FILE}" \
GH_INFO_URL="file://${HEALTHY_FILE}" \
REIMPORT_DOCKER_CMD="bash ${T3_STUB}" \
bash "$SCRIPT" --force > /dev/null 2>&1

NEW_TS=$(jq -r '.imported_at' "${T4_DIR}/osm-import-ledger.json")
assert "force/imported_at-updated" "[[ '$OLD_TS' != '$NEW_TS' ]]"

# ---------------------------------------------------------------------------
# Test 5: Ledger hash is a 64-char hex string (valid SHA-256)
# ---------------------------------------------------------------------------

LEDGER_HASH=$(jq -r '.sha256' "${T3_DIR}/osm-import-ledger.json")
assert "ledger/hash-is-64-chars" "[[ \${#LEDGER_HASH} -eq 64 ]]"
assert "ledger/hash-is-hex"      "[[ '$LEDGER_HASH' =~ ^[0-9a-f]{64}$ ]]"

# ---------------------------------------------------------------------------
# Test 6: size_bytes is a positive integer
# ---------------------------------------------------------------------------

SIZE=$(jq '.size_bytes' "${T3_DIR}/osm-import-ledger.json")
assert "ledger/size-positive" "[[ '$SIZE' -gt 0 ]]"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

echo ""
echo "Results: $PASS passed, $FAIL failed"
[[ "$FAIL" -eq 0 ]] || exit 1
