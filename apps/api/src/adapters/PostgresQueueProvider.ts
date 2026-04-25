import type { ClaimedJob, QueueJob, QueueProvider } from "@routax/shared";
import type { Pool } from "pg";

export class PostgresQueueProvider implements QueueProvider {
  constructor(private readonly pool: Pool) {}

  async enqueue(job: QueueJob): Promise<string> {
    const result = await this.pool.query<{ id: string }>(
      "INSERT INTO job_queue (kind, payload) VALUES ($1, $2) RETURNING id",
      [job.kind, job.payload],
    );
    const row = result.rows[0];
    if (!row) throw new Error("enqueue: no id returned");
    return row.id;
  }

  async claim(workerId: string, kinds: string[]): Promise<ClaimedJob | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const select = await client.query<{
        id: string;
        kind: string;
        payload: unknown;
      }>(
        `SELECT id, kind, payload FROM job_queue
         WHERE status = 'pending' AND kind = ANY($1)
         ORDER BY created_at ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED`,
        [kinds],
      );

      const row = select.rows[0] ?? null;

      if (!row) {
        await client.query("ROLLBACK");
        return null;
      }

      await client.query(
        "UPDATE job_queue SET status = 'claimed', worker_id = $1, claimed_at = now() WHERE id = $2",
        [workerId, row.id],
      );

      await client.query("COMMIT");

      return { id: row.id, kind: row.kind, payload: row.payload };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async complete(jobId: string): Promise<void> {
    await this.pool.query("UPDATE job_queue SET status = 'done', done_at = now() WHERE id = $1", [
      jobId,
    ]);
  }

  async fail(jobId: string, error: string): Promise<void> {
    await this.pool.query(
      "UPDATE job_queue SET status = 'failed', error = $2, done_at = now() WHERE id = $1",
      [jobId, error],
    );
  }
}
