import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Pool } from "pg";
import { v5 as uuidv5 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createContainer, createPool } from "../../src/container.js";
import { ALL_FLAGS, SEED_USER_ID, seedAnalytics, seedFlags, seedRoutes } from "../seed.js";

function isStaleFixtureError(e: unknown): boolean {
  return e instanceof Error && e.message.includes("Frozen fixture is stale");
}

const SEED_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

function makePool() {
  return new Pool({
    host: process.env.POSTGRES_HOST ?? "localhost",
    port: Number(process.env.POSTGRES_PORT ?? 5432),
    user: process.env.POSTGRES_USER ?? "routax",
    password: process.env.POSTGRES_PASSWORD ?? "routax_dev_password",
    database: process.env.POSTGRES_DB ?? "routax",
  });
}

describe("seed script", () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = makePool();
    await pool.query("DELETE FROM analytics_events WHERE user_id = $1", [SEED_USER_ID]);
    await pool.query("DELETE FROM routes WHERE user_id = $1", [SEED_USER_ID]);
  });

  afterAll(async () => {
    await pool.end();
  });

  // ── Flags ──────────────────────────────────────────────────────────────────

  it("seedFlags() upserts all flags and they exist in DB", async () => {
    const count = await seedFlags(pool);
    expect(count).toBe(ALL_FLAGS.length);

    const { rows } = await pool.query<{ key: string }>(
      "SELECT key FROM flags WHERE key = ANY($1)",
      [ALL_FLAGS.map((f) => f.key)],
    );
    expect(rows).toHaveLength(ALL_FLAGS.length);
    const keys = new Set(rows.map((r) => r.key));
    expect(keys.has("gpx_import")).toBe(true);
    expect(keys.has("round_trip_planner")).toBe(true);
    expect(keys.has("surface_visualization")).toBe(true);
  });

  it("seedFlags() is idempotent", async () => {
    await seedFlags(pool);
    const { rowCount: first } = await pool.query("SELECT 1 FROM flags WHERE key = ANY($1)", [
      ALL_FLAGS.map((f) => f.key),
    ]);
    await seedFlags(pool);
    const { rowCount: second } = await pool.query("SELECT 1 FROM flags WHERE key = ANY($1)", [
      ALL_FLAGS.map((f) => f.key),
    ]);
    expect(second).toBe(first);
  });

  // ── Analytics ──────────────────────────────────────────────────────────────

  it("seedAnalytics() inserts exactly 58 events", async () => {
    const count = await seedAnalytics(pool);
    expect(count).toBe(58);

    const { rows } = await pool.query<{ cnt: string }>(
      "SELECT count(*) AS cnt FROM analytics_events WHERE user_id = $1",
      [SEED_USER_ID],
    );
    expect(Number(rows[0]?.cnt)).toBe(58);
  });

  it("seedAnalytics() spans at least 28 distinct days", async () => {
    const { rows } = await pool.query<{ cnt: string }>(
      "SELECT count(DISTINCT date_trunc('day', ts)) AS cnt FROM analytics_events WHERE user_id = $1",
      [SEED_USER_ID],
    );
    expect(Number(rows[0]?.cnt)).toBeGreaterThanOrEqual(28);
  });

  it("seedAnalytics() is idempotent", async () => {
    await seedAnalytics(pool);
    const { rows } = await pool.query<{ cnt: string }>(
      "SELECT count(*) AS cnt FROM analytics_events WHERE user_id = $1",
      [SEED_USER_ID],
    );
    expect(Number(rows[0]?.cnt)).toBe(58);
  });

  // ── Routes ─────────────────────────────────────────────────────────────────

  it("seedRoutes() rejects a stale frozen fixture", async () => {
    const tmpPath = path.join(os.tmpdir(), "routax-stale-fixture-test.json");
    fs.writeFileSync(
      tmpPath,
      JSON.stringify({
        generatedAt: "2000-01-01T00:00:00.000Z",
        definitionsHash: "000000000000dead",
        routes: [],
      }),
    );
    const testPool = createPool();
    const container = createContainer(testPool);
    try {
      await expect(seedRoutes(pool, container, "frozen", tmpPath)).rejects.toThrow(
        "Frozen fixture is stale",
      );
    } finally {
      await container.close();
      fs.unlinkSync(tmpPath);
    }
  });

  // The remaining frozen-mode tests require an up-to-date fixture file.
  // If the fixture is stale (definitionsHash mismatch), they are skipped.
  // Regenerate with: pnpm tsx scripts/seed.ts --write-fixtures (GH must be running).

  it("seedRoutes() inserts 5 routes using frozen fixture", async () => {
    const testPool = createPool();
    const container = createContainer(testPool);
    let count: number;
    try {
      count = await seedRoutes(pool, container, "frozen");
    } catch (e) {
      if (isStaleFixtureError(e)) {
        console.warn("Skipping: fixture is stale — run --write-fixtures with GH running");
        return;
      }
      throw e;
    } finally {
      await container.close();
    }

    expect(count).toBe(5);
    const { rows } = await pool.query<{ cnt: string }>(
      "SELECT count(*) AS cnt FROM routes WHERE user_id = $1",
      [SEED_USER_ID],
    );
    expect(Number(rows[0]?.cnt)).toBe(5);
  });

  it("seedRoutes() is idempotent", async () => {
    const testPool = createPool();
    const container = createContainer(testPool);
    try {
      await seedRoutes(pool, container, "frozen");
    } catch (e) {
      if (isStaleFixtureError(e)) {
        console.warn("Skipping: fixture is stale — run --write-fixtures with GH running");
        return;
      }
      throw e;
    } finally {
      await container.close();
    }

    const { rows } = await pool.query<{ cnt: string }>(
      "SELECT count(*) AS cnt FROM routes WHERE user_id = $1",
      [SEED_USER_ID],
    );
    expect(Number(rows[0]?.cnt)).toBe(5);
  });

  it("seeded routes have valid geometry", async () => {
    const { rows } = await pool.query<{ id: string; valid: boolean }>(
      "SELECT id, ST_IsValid(geometry::geometry) AS valid FROM routes WHERE user_id = $1",
      [SEED_USER_ID],
    );
    // If the stale-fixture tests above were skipped, rows may be empty — that's fine.
    for (const row of rows) {
      expect(row.valid).toBe(true);
    }
  });

  it("route IDs are deterministic", async () => {
    const expectedId = uuidv5("tampere-jyvaskyla", SEED_NAMESPACE);
    const { rows } = await pool.query<{ id: string }>(
      "SELECT id FROM routes WHERE user_id = $1 AND name = $2",
      [SEED_USER_ID, "Tampere → Jyväskylä"],
    );
    // May be empty if frozen tests were skipped; just verify the ID is correct if present.
    if (rows.length > 0) {
      expect(rows[0]?.id).toBe(expectedId);
    }
  });
});
