# GraphHopper — local routing service

Self-hosted GraphHopper instance serving the Finland OSM extract with a
custom cycling profile. Exposes the routing HTTP API on port 8989.

## First-time setup

```bash
# 1. Download the Finland OSM extract (~450 MB)
make download-osm

# 2. Start all services (GraphHopper will build the graph on first boot)
make up
```

The first boot imports the OSM data and builds the routing graph. This
takes **3–8 minutes** for Finland. Subsequent boots skip the import and
start in a few seconds (the graph is cached in the `via-graphhopper-data`
Docker volume).

Watch the import progress:

```bash
docker compose -f infra/docker/docker-compose.local.yml logs -f graphhopper
```

The service is ready when you see `Started server` or when `make up`
reports the healthcheck as healthy.

## Verifying the service

```bash
# Health endpoint
curl http://localhost:8989/health

# Smoke test (asserts HTTP 200 + LineString on three parameterised requests)
make smoke-test
```

## Service URLs

| Endpoint | URL |
|---|---|
| Route API | `http://localhost:8989/route` |
| Health | `http://localhost:8989/health` |
| Info | `http://localhost:8989/info` |

## Routing requests

The service exposes one profile: `bike_custom` (vehicle=bike, weighting=custom).

All routing requests must use **POST** (GraphHopper Custom Models are POST-only):

```bash
curl -X POST http://localhost:8989/route \
  -H "Content-Type: application/json" \
  -d '{
    "points": [[25.0097, 60.1699], [24.9506, 60.1791]],
    "profile": "bike_custom",
    "custom_model": {
      "priority": [
        {"if": "road_class == PRIMARY", "multiply_by": "0.1"},
        {"if": "road_environment == CYCLEWAY", "multiply_by": "1.7"}
      ],
      "distance_influence": 70
    }
  }'
```

## Custom model parameters (v0)

`custom_models/v0-cycling.json` documents the three Via profile parameters.
The values below show how the Fastify API (Task 06) maps slider values to
GraphHopper priority multipliers:

| Parameter | Range | Effect |
|---|---|---|
| `avoid_traffic` | 0–1 | PRIMARY: `1 - t*0.9`; SECONDARY: `1 - t*0.5` |
| `prefer_quiet_surfaces` | 0–1 | Cycleways/tracks/living streets: `1 + q*0.8`; gravel/dirt/sand: `1 - q*0.4` |
| `max_gradient` | 0–15% | **Not active in Phase 1** — see note below |

### max_gradient limitation

GraphHopper encodes slope from elevation data. Standard Geofabrik PBF
extracts do **not** include elevation. The `max_gradient` parameter has no
effect until SRTM elevation data is integrated (planned for Phase 3+).
The rule is omitted from `v0-cycling.json` to avoid silent no-ops.

## Swapping the OSM extract

To route a different region (e.g. Sweden):

1. Download the new PBF into `infra/docker/graphhopper/osm/`:
   ```bash
   curl -L -o infra/docker/graphhopper/osm/sweden-latest.osm.pbf \
     https://download.geofabrik.de/europe/sweden-latest.osm.pbf
   ```

2. Update `datareader.file` in `config.yml`:
   ```yaml
   datareader.file: /graphhopper/osm/sweden-latest.osm.pbf
   ```

3. Invalidate the graph cache and rebuild:
   ```bash
   docker volume rm project-via_via-graphhopper-data
   make up
   ```

## Invalidating the graph cache

The cache must be cleared whenever the config or OSM extract changes:

```bash
docker volume rm project-via_via-graphhopper-data
make up
```

## Reading GraphHopper logs

```bash
# Follow all service logs
make logs

# Follow GraphHopper only
docker compose -f infra/docker/docker-compose.local.yml logs -f graphhopper
```

Common log signals:
- `Importing OSM` — first-boot graph build in progress
- `Started server` — ready to accept requests
- `CustomModelException` — malformed custom model JSON in the request body
