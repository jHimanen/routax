# infra/docker

Local data-plane services for Routax development.

## Services

| Service | URL | Notes |
|---|---|---|
| Routax (canonical) | `https://routax.cc` | requires `/etc/hosts` entry |
| Routax (fallback) | `https://localhost` | no `/etc/hosts` needed |
| Postgres 16 + PostGIS | `localhost:5432` | psql / TablePlus |
| MinIO API | `http://localhost:9000` | S3-compatible endpoint |
| MinIO Console | `http://localhost:9001` | Browser UI |
| MailHog SMTP | `localhost:1025` | SMTP sink |
| MailHog UI | `http://localhost:8025` | Browser UI |

## Dev credentials (local only)

Copy `.env.example` to `.env.local` at the repo root. Defaults:

| Var | Default |
|---|---|
| `POSTGRES_USER` | `routax` |
| `POSTGRES_PASSWORD` | `routax_dev_password` |
| `POSTGRES_DB` | `routax` |
| `MINIO_ROOT_USER` | `routax_minio` |
| `MINIO_ROOT_PASSWORD` | `routax_minio_secret` |

## First-time setup

After `make up`, apply migrations and populate dev data:

```sh
pnpm --filter @routax/api db:migrate
pnpm --filter @routax/api db:seed
```

Seeds 8 feature flags, 58 analytics events, and 5 Finnish cycling routes for `seed-user-001`. Re-running `db:seed` is safe (idempotent).

## Commands

```sh
make up      # start all services (detached)
make down    # stop services, keep volumes
make logs    # stream logs from all services
make reset   # stop services and DELETE all volumes (fresh start)
```

## Refreshing OSM data

Finland OSM data is updated weekly by Geofabrik. Run `make osm-reimport` before
a routing-quality test session or after a significant OSM update.

```sh
make osm-reimport             # download → compare hash → rebuild graph if changed
make osm-reimport ARGS=--force    # force rebuild without redownloading
make osm-reimport ARGS=--dry-run  # report what would happen, no changes made
```

The script compares the SHA-256 of the downloaded PBF against a ledger at
`infra/docker/graphhopper/data/osm-import-ledger.json`. If the hash is
unchanged the script exits immediately — no rebuild, no downtime (~1 min on a
fast connection). When the hash has changed it stops GraphHopper, wipes the
graph and elevation caches, restarts, and waits up to 30 min for GraphHopper to
finish importing before writing the updated ledger (~10 min typical for Finland).

Recommended cadence: weekly, or before any routing-quality task in Phase 3+.
The ledger is gitignored.

## State

- Postgres and MinIO data persists across `make down` / `make up` cycles.
- `make reset` wipes all named volumes — use when you need a clean slate.
- MailHog has no persistent volume; mail is ephemeral.
- The `minio-bootstrap` container runs once on first `make up` to create the `routax-local` bucket, then exits.

## GraphHopper elevation (SRTM)

GraphHopper downloads SRTM elevation tiles on first boot and caches them in the
`graphhopper-elevation` Docker volume (~200–400 MB for Finland). Subsequent
boots reuse the cache.

**After pulling changes that add or modify elevation config, you must invalidate
the graph cache before starting — elevation is indexed at import time:**

```sh
rm -rf infra/docker/graphhopper/data/graph-cache
make up
```

Watch the first-boot download in the logs:

```sh
docker compose -f infra/docker/docker-compose.local.yml logs -f graphhopper
```

CI runs without SRTM tiles; `ascent`/`descent` assertions in the integration
test suite require a locally running GraphHopper stack.
