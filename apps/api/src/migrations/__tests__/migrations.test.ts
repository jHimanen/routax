import path from "node:path";
import { runner } from "node-pg-migrate";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const MIGRATIONS_DIR = path.join(__dirname, "../../../migrations");

function makePool() {
  return new Pool({
    host: process.env.POSTGRES_HOST ?? "localhost",
    port: Number(process.env.POSTGRES_PORT ?? 5432),
    user: process.env.POSTGRES_USER ?? "routax",
    password: process.env.POSTGRES_PASSWORD ?? "routax_dev_password",
    database: process.env.POSTGRES_DB ?? "routax",
  });
}

const CORE_TABLES = ["routes", "flags", "job_queue", "cache_entries"];

async function tableSet(pool: Pool): Promise<Set<string>> {
  const res = await pool.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = ANY($1)`,
    [CORE_TABLES],
  );
  return new Set(res.rows.map((r) => r.tablename));
}

describe("migration round-trip", () => {
  // NOTE: this test manipulates the shared test schema. It ends with all
  // migrations re-applied, so tests that run after it see a clean schema.
  // Run this suite in isolation if concurrent test files query these tables.

  let pool: Pool;

  beforeAll(() => {
    pool = makePool();
  });

  afterAll(async () => {
    await pool.end();
  });

  it("can roll back all 3 migrations then re-apply them", async () => {
    const opts = {
      databaseUrl: {
        host: process.env.POSTGRES_HOST ?? "localhost",
        port: Number(process.env.POSTGRES_PORT ?? 5432),
        user: process.env.POSTGRES_USER ?? "routax",
        password: process.env.POSTGRES_PASSWORD ?? "routax_dev_password",
        database: process.env.POSTGRES_DB ?? "routax",
      },
      migrationsTable: "pgmigrations" as const,
      dir: MIGRATIONS_DIR,
      log: () => {},
    };

    // Roll back all 3
    await runner({ ...opts, direction: "down", count: 3 });
    expect(await tableSet(pool)).toEqual(new Set());

    // Re-apply all
    await runner({ ...opts, direction: "up", count: Number.POSITIVE_INFINITY });
    expect(await tableSet(pool)).toEqual(new Set(CORE_TABLES));
  }, 60_000);
});
