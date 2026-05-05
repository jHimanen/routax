import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import type { RouteResult } from "@routax/shared";
import dotenv from "dotenv";
import { runner } from "node-pg-migrate";
import type { Pool } from "pg";
import { v5 as uuidv5 } from "uuid";
import type { Container } from "../src/container.js";
import { createContainer, createPool } from "../src/container.js";

// ── Constants ────────────────────────────────────────────────────────────────

// RFC 4122 DNS namespace — stable, well-known, reproducible across machines.
// Do not change: alters all seed route IDs and breaks saved dev links.
const SEED_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

// Matches StubAuthProvider default so seeded data is visible in the UI without extra config.
export const SEED_USER_ID = process.env.STUB_AUTH_USER_ID ?? "stub-user-1";

export const ALL_FLAGS = [
  // Phase 2 — upsert for completeness
  { key: "saved_routes_ui", description: "Gates save/load route UI (tasks 06-07)" },
  { key: "gpx_export", description: "Gates GPX download (task 08)" },
  { key: "elevation_profile_viz", description: "Gates elevation chart (task 09)" },
  // Phase 3 — new flags for tasks 05-10
  { key: "profile_presets", description: "Gates routing profile presets (task 03)" },
  { key: "round_trip_planner", description: "Gates round-trip route planning (task 04)" },
  { key: "surface_visualization", description: "Gates surface type map layer (task 05)" },
  { key: "cue_sheets", description: "Gates turn-by-turn cue sheets (task 11)" },
  { key: "gpx_import", description: "Gates GPX file import (task 10)" },
] as const;

const EVENT_NAMES = [
  "route_planned",
  "route_saved",
  "route_listed",
  "route_deleted",
  "gpx_exported",
  "gpx_import_started",
  "gpx_import_succeeded",
  "gpx_import_failed",
  "elevation_viewed",
  "profile_changed",
  "map_zoomed",
  "search_performed",
  "session_started",
] as const;

const ROUTE_DEFINITIONS = [
  {
    slug: "tampere-jyvaskyla",
    name: "Tampere → Jyväskylä",
    start: { lat: 61.498, lng: 23.76 },
    end: { lat: 62.243, lng: 25.747 },
    preset: "quiet_country_roads" as const,
    advancedOverrides: { avoidTraffic: 0.3, preferQuietSurfaces: 0.4, maxGradient: 15 },
  },
  {
    slug: "helsinki-round-trip",
    name: "Helsinki → Espoo round-trip",
    start: { lat: 60.169, lng: 24.938 },
    end: { lat: 60.205, lng: 24.656 },
    preset: "fastest_direct" as const,
    advancedOverrides: { avoidTraffic: 0.5, preferQuietSurfaces: 0.6, maxGradient: 10 },
  },
  {
    slug: "lappeenranta-joensuu",
    name: "Lappeenranta → Joensuu",
    start: { lat: 61.058, lng: 28.187 },
    end: { lat: 62.601, lng: 29.763 },
    preset: "quiet_country_roads" as const,
    advancedOverrides: { avoidTraffic: 0.2, preferQuietSurfaces: 0.8, maxGradient: 12 },
  },
  {
    slug: "tampere-city-loop",
    name: "Tampere city loop",
    start: { lat: 61.497, lng: 23.757 },
    end: { lat: 61.51, lng: 23.8 },
    preset: "fastest_direct" as const,
    advancedOverrides: { avoidTraffic: 0.6, preferQuietSurfaces: 0.7, maxGradient: 8 },
  },
  {
    slug: "tampere-hameenlinna",
    name: "Tampere → Hämeenlinna",
    start: { lat: 61.497, lng: 23.757 },
    end: { lat: 61.001, lng: 24.465 },
    preset: "quiet_country_roads" as const,
    advancedOverrides: { avoidTraffic: 0.4, preferQuietSurfaces: 0.5, maxGradient: 12 },
    planningMetadata: {
      mode: "gpx_import" as const,
      sourceFilename: "tampere-hameenlinna.gpx",
      importedAt: "2026-04-01T10:00:00.000Z",
    },
  },
] as const;

const FIXTURE_PATH = path.join(__dirname, "seed-fixtures/routes.json");
const MIGRATIONS_DIR = path.join(__dirname, "../migrations");

// ── Types ────────────────────────────────────────────────────────────────────

interface RouteFixture {
  slug: string;
  name: string;
  result: RouteResult;
}

interface FixtureFile {
  generatedAt: string;
  routes: RouteFixture[];
}

// ── Env loading ──────────────────────────────────────────────────────────────

for (const p of [
  path.join(process.cwd(), ".env.local"),
  path.join(process.cwd(), ".env"),
  path.join(process.cwd(), "..", "..", ".env.local"),
  path.join(process.cwd(), "..", "..", ".env"),
]) {
  dotenv.config({ path: p });
}

// ── Arg parsing ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const doReset = args.includes("--reset");
const doWriteFixtures = args.includes("--write-fixtures");

// ── Migration helpers ────────────────────────────────────────────────────────

function dbConfig() {
  return {
    host: process.env.POSTGRES_HOST ?? "localhost",
    port: Number(process.env.POSTGRES_PORT ?? 5432),
    user: process.env.POSTGRES_USER ?? "routax",
    password: process.env.POSTGRES_PASSWORD ?? "routax_dev_password",
    database: process.env.POSTGRES_DB ?? "routax",
  };
}

async function migrateDown(): Promise<void> {
  await runner({
    databaseUrl: dbConfig(),
    migrationsTable: "pgmigrations",
    dir: MIGRATIONS_DIR,
    direction: "down",
    count: Number.POSITIVE_INFINITY,
    log: () => {},
  });
}

async function migrateUp(): Promise<void> {
  await runner({
    databaseUrl: dbConfig(),
    migrationsTable: "pgmigrations",
    dir: MIGRATIONS_DIR,
    direction: "up",
    count: Number.POSITIVE_INFINITY,
    log: () => {},
  });
}

// ── GraphHopper detection ────────────────────────────────────────────────────

async function isGraphHopperReachable(): Promise<boolean> {
  const url = process.env.GRAPHHOPPER_URL ?? "http://localhost:8989";
  try {
    const res = await fetch(`${url}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Seed functions ───────────────────────────────────────────────────────────

export async function seedFlags(pool: Pool): Promise<number> {
  const rules = JSON.stringify({ default: true, environments: { local: true } });
  for (const flag of ALL_FLAGS) {
    await pool.query(
      `INSERT INTO flags (key, rules, description, updated_at)
       VALUES ($1, $2::jsonb, $3, now())
       ON CONFLICT (key) DO UPDATE
         SET rules = EXCLUDED.rules,
             description = EXCLUDED.description,
             updated_at = now()`,
      [flag.key, rules, flag.description],
    );
  }
  return ALL_FLAGS.length;
}

export async function seedAnalytics(pool: Pool): Promise<number> {
  await pool.query("DELETE FROM analytics_events WHERE user_id = $1", [SEED_USER_ID]);

  const events: { name: string; ts: Date; properties: Record<string, unknown> }[] = [];
  for (let day = 1; day <= 29; day++) {
    const pad = String(day).padStart(2, "0");
    events.push(
      {
        name: EVENT_NAMES[day % EVENT_NAMES.length] as string,
        ts: new Date(`2026-04-${pad}T09:00:00Z`),
        properties: { source: "seed", day },
      },
      {
        name: EVENT_NAMES[(day + 5) % EVENT_NAMES.length] as string,
        ts: new Date(`2026-04-${pad}T18:00:00Z`),
        properties: { source: "seed", day },
      },
    );
  }

  for (const ev of events) {
    await pool.query(
      `INSERT INTO analytics_events (user_id, event, ts, properties)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [SEED_USER_ID, ev.name, ev.ts, JSON.stringify(ev.properties)],
    );
  }
  return events.length;
}

export async function seedRoutes(
  pool: Pool,
  container: Container,
  mode: "live" | "frozen",
): Promise<number> {
  let fixtureMap: Map<string, RouteResult> | undefined;

  if (mode === "frozen") {
    const raw = fs.readFileSync(FIXTURE_PATH, "utf8");
    const data = JSON.parse(raw) as FixtureFile;
    fixtureMap = new Map(data.routes.map((r) => [r.slug, r.result]));
  }

  let count = 0;
  for (const def of ROUTE_DEFINITIONS) {
    const id = uuidv5(def.slug, SEED_NAMESPACE);

    let result: RouteResult;
    if (mode === "live") {
      result = await container.routing.planRoute({
        waypoints: [def.start, def.end],
        preset: def.preset,
        advancedOverrides: def.advancedOverrides,
      });
    } else {
      const f = fixtureMap?.get(def.slug);
      if (!f) throw new Error(`No fixture for slug: ${def.slug}`);
      result = f;
    }

    const planningMetadata =
      "planningMetadata" in def && def.planningMetadata ? def.planningMetadata : null;

    const waypoints = [
      { id: `${id}-start`, position: def.start, role: "start" as const },
      { id: `${id}-finish`, position: def.end, role: "finish" as const },
    ];

    await pool.query(
      `INSERT INTO routes (
         id, user_id, name,
         preset, geometry, profile,
         distance_m, duration_s, ascent_m, descent_m, elevation_profile,
         surface_profile, waypoints_json, cue_sheet,
         planning_metadata_json,
         created_at, updated_at
       ) VALUES (
         $1, $2, $3,
         $4, ST_GeomFromGeoJSON($5)::geography, $6::jsonb,
         $7, $8, $9, $10, $11::jsonb,
         $12::jsonb, $13::jsonb, $14::jsonb,
         $15::jsonb,
         now(), now()
       )
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         preset = EXCLUDED.preset,
         geometry = EXCLUDED.geometry,
         profile = EXCLUDED.profile,
         distance_m = EXCLUDED.distance_m,
         duration_s = EXCLUDED.duration_s,
         ascent_m = EXCLUDED.ascent_m,
         descent_m = EXCLUDED.descent_m,
         elevation_profile = EXCLUDED.elevation_profile,
         surface_profile = EXCLUDED.surface_profile,
         waypoints_json = EXCLUDED.waypoints_json,
         cue_sheet = EXCLUDED.cue_sheet,
         planning_metadata_json = EXCLUDED.planning_metadata_json,
         updated_at = now()`,
      [
        id,
        SEED_USER_ID,
        def.name,
        def.preset,
        JSON.stringify(result.geometry),
        JSON.stringify(def.advancedOverrides),
        Math.round(result.distance),
        Math.round(result.duration),
        Math.round(result.ascent),
        Math.round(result.descent),
        JSON.stringify(result.elevationProfile),
        JSON.stringify(result.surfaces ?? []),
        JSON.stringify(waypoints),
        JSON.stringify(result.cueSheet ?? []),
        planningMetadata ? JSON.stringify(planningMetadata) : null,
      ],
    );
    count++;
  }
  return count;
}

// ── Write-fixtures subcommand ─────────────────────────────────────────────────

async function writeFixtures(container: Container): Promise<void> {
  const routes: RouteFixture[] = [];
  for (const def of ROUTE_DEFINITIONS) {
    console.log(`  planning ${def.slug}...`);
    const result = await container.routing.planRoute({
      waypoints: [def.start, def.end],
      preset: def.preset,
      advancedOverrides: def.advancedOverrides,
    });
    routes.push({ slug: def.slug, name: def.name, result });
  }
  const fixture: FixtureFile = { generatedAt: new Date().toISOString(), routes };
  fs.writeFileSync(FIXTURE_PATH, `${JSON.stringify(fixture, null, 2)}\n`, "utf8");
  console.log(`Fixtures written to ${FIXTURE_PATH}`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const start = Date.now();

  if (doWriteFixtures) {
    console.log("--- write-fixtures mode ---");
    const pool = createPool();
    const container = createContainer(pool);
    try {
      await writeFixtures(container);
    } finally {
      await container.close();
    }
    console.log(`Done in ${((Date.now() - start) / 1000).toFixed(1)}s`);
    return;
  }

  if (doReset) {
    console.log("-- reset: migrating down...");
    await migrateDown();
    console.log("-- reset: migrating up...");
    await migrateUp();
  }

  const pool = createPool();
  const container = createContainer(pool);

  try {
    const live = await isGraphHopperReachable();
    const mode = live ? "live" : "frozen";
    if (!live) console.log("GraphHopper unreachable — using frozen fixture");

    console.log("seeding flags...");
    const flagCount = await seedFlags(pool);

    console.log("seeding analytics...");
    const eventCount = await seedAnalytics(pool);

    console.log("seeding routes...");
    const routeCount = await seedRoutes(pool, container, mode);

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(
      `seed complete: ${flagCount} flags, ${eventCount} events, ${routeCount} routes [${elapsed}s]`,
    );
  } finally {
    await container.close();
  }
}

// Only run when executed directly — not when imported by tests.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
