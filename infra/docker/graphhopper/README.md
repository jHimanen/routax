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
start in a few seconds (the graph is cached in
`infra/docker/graphhopper/data/default-gh/`).

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

## Docker image

The service uses `israelhikingmap/graphhopper:11.0` — a specific version
tag, not `:latest`. Floating on `:latest` caused silent surprises during
development (Task 05 hit a runtime enum-mismatch where `EARTH` was not a
member of the `Surface` enum in whatever nightly build was pulled that
week). Pinning the tag makes encoder behaviour and enum membership
reproducible across machines.

Changing the image tag requires `make osm-reimport -- --force` to
rebuild the graph; the old graph is incompatible with a different encoder
binary.

## Routing requests

The service exposes one profile: `bike` (vehicle=bike, weighting=custom).

All routing requests must use **POST** (GraphHopper Custom Models are POST-only):

```bash
curl -X POST http://localhost:8989/route \
  -H "Content-Type: application/json" \
  -d '{
    "points": [[25.0097, 60.1699], [24.9506, 60.1791]],
    "profile": "bike",
    "ch.disable": true,
    "custom_model": {
      "priority": [
        {"if": "road_class == PRIMARY", "multiply_by": "0.1"},
        {"if": "road_environment == CYCLEWAY", "multiply_by": "1.7"}
      ],
      "distance_influence": 70
    }
  }'
```

## Indexed encoded values

The graph indexes eleven encoded values. Any of these can be requested in
`details=` on a `/route` call to get per-segment arrays.

### Computed at import

| Encoded value | Description |
|---|---|
| `average_slope` | Average gradient per edge (%), derived from SRTM elevation data |

### From OSM tags

| Encoded value | OSM source | Description / enum values |
|---|---|---|
| `surface` | `surface=*` | 8 normalised classes — see table below |
| `road_class` | `highway=*` | Road hierarchy: `OTHER`, `MOTORWAY`, `TRUNK`, `PRIMARY`, `SECONDARY`, `TERTIARY`, `RESIDENTIAL`, `UNCLASSIFIED`, `SERVICE`, `ROAD`, `TRACK`, `CYCLEWAY`, `PATH`, `LIVING_STREET`, and more |
| `road_environment` | Derived from way type | Edge context: `ROAD`, `FERRY`, `TUNNEL`, `BRIDGE`, `FORD` |
| `road_access` | `access=*`, `bicycle=*` | Access restriction: `YES`, `DESTINATION`, `CUSTOMERS`, `DELIVERY`, `PRIVATE`, `AGRICULTURAL`, `FORESTRY`, `NO` |
| `max_speed` | `maxspeed=*` | Posted limit in km/h; edges without a signed limit default to the country standard (Finland: 50 km/h urban / 80 km/h rural) — always an integer, never `null` |
| `track_type` | `tracktype=*` | Track firmness: `MISSING`, `GRADE1` (solid, paved) through `GRADE5` (very soft, unrideable for most bikes) |
| `smoothness` | `smoothness=*` | Pavement quality: `MISSING`, `EXCELLENT`, `GOOD`, `INTERMEDIATE`, `BAD`, `VERY_BAD`, `HORRIBLE`, `VERY_HORRIBLE`, `IMPASSABLE`, `OTHER` |
| `bike_network` | `route=bicycle` relations | OSM cycling network membership: `MISSING`, `LOCAL`, `REGIONAL`, `NATIONAL`, `INTERNATIONAL`, `OTHER` |
| `mtb_rating` | `mtb:scale=*` | MTB difficulty — numeric (0–6, Singletrail-Skala); use `mtb_rating > 2` in custom-model rules, not an enum comparison |
| `bike_priority` | `bicycle=*`, `highway=cycleway` | Numeric priority score from the GH bike encoder. 4-bit EV in GH 11.0 — max stored value is 1.5 (VehiclePriority.PREFER; VERY_NICE=3.0 and BEST=10.0 are clamped). `highway=cycleway + bicycle=designated` reaches 1.5; undesignated cycleways vary (0.9–1.3); paths and roads range 0.8–1.3. Use `bike_priority >= 1.4` to target only peak-designated infrastructure. Non-cycleway `bicycle=designated` paths do not reach 1.5 in Finnish OSM data — see Task 27 Part B notes. |

`lit` (`lit=*`, boolean illumination) was planned but is not a recognised encoded value in
GH 11.0. It will be revisited when the image is upgraded to a version that supports it.

**Enum discipline:** Always verify enum constants against the `/info` response for the
running image before writing a custom-model rule. Do not guess — an unrecognised constant
produces HTTP 400 at request time.

For OSM tag vocabulary depth see the
[osm-cycling-tags wiki page](../../routax-wiki/concepts/data/osm-cycling-tags.md).

### Surface controlled vocabulary

The `surface` encoded value is normalised from raw OSM `surface=*` tags into
8 stable classes:

| Class | OSM tags |
|---|---|
| `asphalt` | `asphalt`, `concrete`, `paving_stones` |
| `paved_rough` | `sett`, `cobblestone`, `bricks`, `concrete:plates` |
| `compacted` | `compacted`, `fine_gravel`, `pebblestone` |
| `gravel` | `gravel`, `dirt`, `ground`, `earth` |
| `sand` | `sand`, `mud` |
| `unpaved` | `unpaved` |
| `wood` | `wood`, `metal_grid` |
| `unknown` | missing tag or any unrecognised value |

`unknown` is a first-class value, not an error — roughly half of Finnish
forest tracks lack a `surface` tag in OSM.

### Using encoded values in custom models

Enum-valued EVs (e.g. `road_class`, `surface`, `smoothness`) must use
only enum constants that GH exposes. Guessing an enum name causes HTTP 400
at request time (Task 05 as-built documents this failure mode). Always
verify against GH's `*_ev.java` source for the pinned version, or test
with a one-off `/route` call before writing a custom-model rule.

`max_speed` is a numeric EV, not an enum: use `max_speed > 80`, not
`max_speed == "none"`.

### Rebuild requirement

`graph.encoded_values` is baked into the graph at import time. Adding,
removing, or reordering encoded values — or changing the image tag —
requires a full rebuild:

```bash
make osm-reimport -- --force
```

A container restart alone is not sufficient; GH fingerprints the profile
config and refuses to load if the hash has changed.

## Ferry and waterway-crossing exclusion

By default, routing requests exclude OSM ferry edges (`route=ferry`) and ford crossings
(`ford=yes`). This is intentional: the Finnish OSM ferry set is noisy (cargo links, seasonal
ice roads, mis-tagged shipping lanes alongside genuine public crossings), and fords can
silently route cyclists through streams.

The exclusion is applied **per-request only**, in `buildCustomModel()`:

| Layer | File | Mechanism |
|---|---|---|
| Per-request custom model | `apps/api/src/adapters/GraphhopperRoutingProvider.ts` | Ferry rule emitted when `allowFerries: false`; ford rule emitted when `allowWaterCrossings: false` |

**`bike-base.json` no longer carries a ferry rule.** The rule was removed in task 24 because
making ferries user-controllable requires the per-request model to be the sole authority. When
`allowFerries: true`, the per-request model omits the ferry rule and ferries become routable.
The per-request rule is the contract; unit tests in `graphhopper.test.ts` cover both states.

**Implication:** if the Routax API is offline and someone calls GH directly without a custom
model, ferry edges are routable. This is an acceptable trade-off for giving users the toggle.

## Custom model parameters

The Fastify API maps `RoutingProfile` fields to GraphHopper priority multipliers:

| Parameter | Range | Effect |
|---|---|---|
| `avoidTraffic` | 0–1 | PRIMARY: `1 - t*0.9`; SECONDARY: `1 - t*0.5` (else_if) |
| `preferQuietSurfaces` | 0–1 | road_class CYCLEWAY/TRACK/LIVING_STREET/PATH: `1 + q*0.8` |
| `maxGradient` | 0–20% | Edges steeper than `maxGradient` are penalised to 0.01 priority |
| `preferCycleways` | 0–1 | road_class CYCLEWAY: `1 + cw*1.2`; bike_priority >= 3.0 (designated): `1 + cw*0.8` |
| `preferLargerRoads` | 0–1 | road_class SECONDARY/TERTIARY: `1 + l*0.6` (independent `if`) |
| `allowFerries` | boolean | When false, emits `road_environment == FERRY → 0` |
| `allowWaterCrossings` | boolean | When false, emits `road_environment == FORD → 0` |
| `maxTrailDifficulty` | 0–6 | When < 6, emits `mtb_rating > N → 0`; 6 = no cap |

## Swapping the OSM extract

To route a different region (e.g. Sweden):

1. Download the new PBF into `infra/docker/graphhopper/data/`:
   ```bash
   curl -L -o infra/docker/graphhopper/data/sweden-latest.osm.pbf \
     https://download.geofabrik.de/europe/sweden-latest.osm.pbf
   ```

2. Update `datareader.file` in `config.yml`:
   ```yaml
   datareader.file: /data/sweden-latest.osm.pbf
   ```

3. Invalidate the graph cache and rebuild:
   ```bash
   make osm-reimport -- --force
   ```

## Invalidating the graph cache

The cache must be cleared whenever the config, encoded values, or OSM
extract changes:

```bash
rm -rf infra/docker/graphhopper/data/default-gh
make up
```

Note: `config.yml` sets `graph.location: /data/graph-cache` but this key
is silently ignored by GH 11.x, which falls back to its hardcoded default
`default-gh`. Scripts and docs use `data/default-gh/` as the actual path.

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
