import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresCacheProvider } from "../PostgresCacheProvider.js";

const pool = new Pool({
  host: process.env.POSTGRES_HOST ?? "localhost",
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  user: process.env.POSTGRES_USER ?? "routax",
  password: process.env.POSTGRES_PASSWORD ?? "routax_dev_password",
  database: process.env.POSTGRES_DB ?? "routax",
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("PostgresCacheProvider", () => {
  let provider: PostgresCacheProvider;

  beforeAll(() => {
    provider = new PostgresCacheProvider(pool);
  });

  afterAll(async () => {
    provider.stopSweeper();
    await pool.end();
  });

  it("stores and retrieves a value", async () => {
    const key = `test-cache-${Date.now()}`;
    await provider.set(key, { hello: "world" }, 60);
    const val = await provider.get<{ hello: string }>(key);
    expect(val).toEqual({ hello: "world" });
  });

  it("returns null after TTL expires", async () => {
    const key = `test-ttl-${Date.now()}`;
    await provider.set(key, { x: 1 }, 1);
    await sleep(1_100);
    const val = await provider.get(key);
    expect(val).toBeNull();
  });

  it("delete removes the entry", async () => {
    const key = `test-delete-${Date.now()}`;
    await provider.set(key, { y: 2 }, 60);
    await provider.delete(key);
    const val = await provider.get(key);
    expect(val).toBeNull();
  });
});
