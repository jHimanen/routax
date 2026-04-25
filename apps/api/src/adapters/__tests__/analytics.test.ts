import type { UserId } from "@routax/shared";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresAnalyticsProvider } from "../PostgresAnalyticsProvider.js";

const pool = new Pool({
  host: process.env.POSTGRES_HOST ?? "localhost",
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  user: process.env.POSTGRES_USER ?? "routax",
  password: process.env.POSTGRES_PASSWORD ?? "routax_dev_password",
  database: process.env.POSTGRES_DB ?? "routax",
});

const TEST_USER = "test-analytics-user" as UserId;

describe("PostgresAnalyticsProvider", () => {
  let provider: PostgresAnalyticsProvider;

  beforeAll(async () => {
    provider = new PostgresAnalyticsProvider(pool);
    await pool.query("DELETE FROM analytics_events WHERE user_id = $1", [TEST_USER]);
    await pool.query("DELETE FROM analytics_identities WHERE user_id = $1", [TEST_USER]);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("track() inserts an event with correct fields", async () => {
    await provider.track({
      name: "test_event",
      userId: TEST_USER,
      properties: { source: "integration-test" },
    });

    const result = await pool.query<{
      user_id: string;
      event: string;
      properties: Record<string, unknown>;
    }>(
      "SELECT user_id, event, properties FROM analytics_events WHERE user_id = $1 AND event = 'test_event'",
      [TEST_USER],
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.user_id).toBe(TEST_USER);
    expect(result.rows[0]?.properties).toEqual({ source: "integration-test" });
  });

  it("identify() upserts and merges JSONB traits", async () => {
    await provider.identify(TEST_USER, { plan: "free" });

    const first = await pool.query<{ traits: Record<string, unknown> }>(
      "SELECT traits FROM analytics_identities WHERE user_id = $1",
      [TEST_USER],
    );
    expect(first.rows[0]?.traits).toEqual({ plan: "free" });

    await provider.identify(TEST_USER, { plan: "pro", extra: true });

    const second = await pool.query<{ traits: Record<string, unknown> }>(
      "SELECT traits FROM analytics_identities WHERE user_id = $1",
      [TEST_USER],
    );
    expect(second.rows[0]?.traits).toMatchObject({ plan: "pro", extra: true });
  });
});
