import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresQueueProvider } from "../PostgresQueueProvider.js";

const pool = new Pool({
  host: process.env.POSTGRES_HOST ?? "localhost",
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  user: process.env.POSTGRES_USER ?? "routax",
  password: process.env.POSTGRES_PASSWORD ?? "routax_dev_password",
  database: process.env.POSTGRES_DB ?? "routax",
});

describe("PostgresQueueProvider", () => {
  beforeAll(async () => {
    await pool.query("DELETE FROM job_queue WHERE kind = 'test-routax'");
  });

  afterAll(async () => {
    await pool.end();
  });

  it("enqueues and claims a job", async () => {
    const provider = new PostgresQueueProvider(pool);
    await provider.enqueue({ kind: "test-routax", payload: { n: 1 } });

    const job = await provider.claim("worker-1", ["test-routax"]);
    expect(job).not.toBeNull();
    expect(job?.kind).toBe("test-routax");

    await provider.complete(job?.id);
  });

  it("only one worker wins under concurrent SKIP LOCKED", async () => {
    const provider = new PostgresQueueProvider(pool);
    await provider.enqueue({ kind: "test-routax", payload: { race: true } });

    const [a, b] = await Promise.all([
      provider.claim("worker-a", ["test-routax"]),
      provider.claim("worker-b", ["test-routax"]),
    ]);

    const winners = [a, b].filter((j) => j !== null);
    expect(winners).toHaveLength(1);

    const winner = winners[0];
    if (winner) await provider.complete(winner.id);
  });

  it("marks a job as failed", async () => {
    const provider = new PostgresQueueProvider(pool);
    const id = await provider.enqueue({ kind: "test-routax", payload: {} });
    const job = await provider.claim("worker-1", ["test-routax"]);
    expect(job).not.toBeNull();

    await provider.fail(job?.id, "something broke");

    const result = await pool.query<{ status: string; error: string }>(
      "SELECT status, error FROM job_queue WHERE id = $1",
      [id],
    );
    expect(result.rows[0]?.status).toBe("failed");
    expect(result.rows[0]?.error).toBe("something broke");
  });
});
