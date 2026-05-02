#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# osm-reimport.sh — Download fresh OSM PBF and conditionally rebuild the
# GraphHopper graph if the hash has changed.
#
# Usage: bash scripts/osm-reimport.sh [--dry-run] [--force]
#   --dry-run  Report what would happen without making any changes.
#   --force    Rebuild even if hash is unchanged (reuses existing PBF).
#
# Override REIMPORT_DOCKER_CMD to inject a no-op in tests.
# ---------------------------------------------------------------------------

PBF_URL="${PBF_URL:-https://download.geofabrik.de/europe/finland-latest.osm.pbf}"
DATA_DIR="${DATA_DIR:-infra/docker/graphhopper/data}"
PBF_PATH="${DATA_DIR}/finland-latest.osm.pbf"
LEDGER_PATH="${DATA_DIR}/osm-import-ledger.json"
GRAPH_CACHE_DIR="${DATA_DIR}/default-gh"
ELEVATION_CACHE_DIR="${DATA_DIR}/elevation-cache"

COMPOSE_FILE="${COMPOSE_FILE:-infra/docker/docker-compose.local.yml}"
COMPOSE_ENV_FILE="${COMPOSE_ENV_FILE:-.env.local}"
DEFAULT_DOCKER_CMD="docker compose --env-file ${COMPOSE_ENV_FILE} -f ${COMPOSE_FILE}"
DOCKER_CMD="${REIMPORT_DOCKER_CMD:-${DEFAULT_DOCKER_CMD}}"

GH_HEALTH_URL="${GH_HEALTH_URL:-http://localhost:8989/health}"
GH_INFO_URL="${GH_INFO_URL:-http://localhost:8989/info}"
HEALTH_TIMEOUT=1800  # 30 minutes
HEALTH_INTERVAL=5

DRY_RUN=false
FORCE=false

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

log()  { echo "[osm-reimport] $*"; }
err()  { echo "[osm-reimport] ERROR: $*" >&2; }
step() { echo ""; log "--- $* ---"; }

usage() {
  echo "Usage: $0 [--dry-run] [--force]"
  echo "  --dry-run  Report what would happen without making any changes"
  echo "  --force    Rebuild even if hash is unchanged (reuses existing PBF)"
  exit 1
}

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --force)   FORCE=true ;;
    -h|--help) usage ;;
    *) err "Unknown argument: $arg"; usage ;;
  esac
done

sha256_file() {
  # Works on Linux (sha256sum) and macOS (shasum)
  if command -v sha256sum &>/dev/null; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

read_ledger_hash() {
  if [[ -f "$LEDGER_PATH" ]]; then
    jq -r '.sha256 // ""' "$LEDGER_PATH" 2>/dev/null || echo ""
  else
    echo ""
  fi
}

write_ledger() {
  local hash="$1" size="$2" version="$3"
  local ts
  ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  local tmp="${LEDGER_PATH}.tmp"
  # Write to temp then rename for atomic replacement
  printf '{\n  "url": "%s",\n  "sha256": "%s",\n  "size_bytes": %s,\n  "imported_at": "%s",\n  "graphhopper_version": "%s"\n}\n' \
    "$PBF_URL" "$hash" "$size" "$ts" "$version" > "$tmp"
  mv "$tmp" "$LEDGER_PATH"
}

file_size() {
  # Works on Linux (-c %s) and macOS (-f %z)
  if stat -c %s "$1" &>/dev/null 2>&1; then
    stat -c %s "$1"
  else
    stat -f %z "$1"
  fi
}

wait_for_health() {
  local elapsed=0
  log "Waiting for GraphHopper to be healthy (up to $((HEALTH_TIMEOUT / 60)) min)..."
  until curl -sf "$GH_HEALTH_URL" > /dev/null 2>&1; do
    if [[ "$elapsed" -ge "$HEALTH_TIMEOUT" ]]; then
      err "GraphHopper did not become healthy within ${HEALTH_TIMEOUT}s"
      exit 1
    fi
    sleep "$HEALTH_INTERVAL"
    elapsed=$((elapsed + HEALTH_INTERVAL))
  done
  log "GraphHopper is healthy (${elapsed}s)"
}

# ---------------------------------------------------------------------------
# Step 1: Download (or assert existing PBF for --force)
# ---------------------------------------------------------------------------

step "PBF acquisition"

if [[ "$FORCE" = true ]]; then
  if [[ ! -f "$PBF_PATH" ]]; then
    err "--force requires an existing PBF at $PBF_PATH"
    exit 1
  fi
  log "--force: reusing existing PBF at $PBF_PATH"
else
  if [[ "$DRY_RUN" = true ]]; then
    log "[dry-run] Would download $PBF_URL → $PBF_PATH"
  else
    log "Downloading $PBF_URL..."
    curl -L --progress-bar -o "${PBF_PATH}.tmp" "$PBF_URL"
  fi
fi

# ---------------------------------------------------------------------------
# Step 2: Compute hash and compare with ledger
# ---------------------------------------------------------------------------

step "Hash comparison"

if [[ "$DRY_RUN" = true ]]; then
  if [[ -f "$PBF_PATH" ]]; then
    log "[dry-run] Would compute SHA-256 of $PBF_PATH"
    OLD_HASH=$(read_ledger_hash)
    log "[dry-run] Ledger hash: ${OLD_HASH:-<none>}"
  else
    log "[dry-run] No existing PBF; download would be required"
  fi
  log "[dry-run] Would proceed to rebuild if hash changed or --force"
  exit 0
fi

if [[ "$FORCE" = false ]]; then
  NEW_HASH=$(sha256_file "${PBF_PATH}.tmp")
  log "Downloaded SHA-256: $NEW_HASH"

  OLD_HASH=$(read_ledger_hash)
  if [[ -n "$OLD_HASH" && "$OLD_HASH" = "$NEW_HASH" ]]; then
    log "Hash unchanged ($NEW_HASH) — graph is up to date."
    rm -f "${PBF_PATH}.tmp"
    exit 0
  fi

  if [[ -n "$OLD_HASH" ]]; then
    log "Hash changed: $OLD_HASH → $NEW_HASH"
  else
    log "No prior ledger — first import"
  fi

  # Replace PBF atomically
  mv "${PBF_PATH}.tmp" "$PBF_PATH"
else
  NEW_HASH=$(sha256_file "$PBF_PATH")
  log "--force SHA-256: $NEW_HASH"
fi

# ---------------------------------------------------------------------------
# Step 3: Rebuild graph
# ---------------------------------------------------------------------------

step "Graph rebuild"

log "Stopping GraphHopper..."
$DOCKER_CMD stop graphhopper

log "Deleting graph and elevation caches..."
rm -rf "$GRAPH_CACHE_DIR" "$ELEVATION_CACHE_DIR"

log "Starting GraphHopper..."
$DOCKER_CMD up -d graphhopper

wait_for_health

# ---------------------------------------------------------------------------
# Step 4: Write ledger
# ---------------------------------------------------------------------------

step "Ledger"

GH_VERSION=$(curl -sf "$GH_INFO_URL" 2>/dev/null | jq -r '.version // "unknown"' 2>/dev/null || echo "unknown")
PBF_SIZE=$(file_size "$PBF_PATH")
write_ledger "$NEW_HASH" "$PBF_SIZE" "$GH_VERSION"
log "Ledger written to $LEDGER_PATH"

log ""
log "Import complete. GraphHopper is serving fresh OSM data."
