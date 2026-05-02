import { Pool } from "pg";
import { v5 as uuidv5 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createContainer, createPool } from "../../src/container.js";
import { ALL_FLAGS, SEED_USER_ID, seedAnalytics, seedFlags, seedRoutes } from "../seed.js";

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

  it("seedRoutes() inserts 5 routes using frozen fixture", async () => {
    const testPool = createPool();
    const container = createContainer(testPool);
    try {
      const count = await seedRoutes(pool, container, "frozen");
      expect(count).toBe(5);
    } finally {
      await container.close();
    }

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
    expect(rows).toHaveLength(5);
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
    expect(rows[0]?.id).toBe(expectedId);
  });
});
