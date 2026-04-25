import type { CacheProvider } from "@routax/shared";
import type { Pool } from "pg";

export class PostgresCacheProvider implements CacheProvider {
  private sweeper: ReturnType<typeof setInterval>;

  constructor(private readonly pool: Pool) {
    this.sweeper = setInterval(() => {
      void this.pool.query("DELETE FROM cache_entries WHERE expires_at < now()");
    }, 60_000);
  }

  stopSweeper(): void {
    clearInterval(this.sweeper);
  }

  async get<T>(key: string): Promise<T | null> {
    const result = await this.pool.query<{ value: T }>(
      "SELECT value FROM cache_entries WHERE key = $1 AND expires_at > now()",
      [key],
    );
    return result.rows[0]?.value ?? null;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    await this.pool.query(
      `INSERT INTO cache_entries (key, value, expires_at)
       VALUES ($1, $2, now() + ($3 * interval '1 second'))
       ON CONFLICT (key) DO UPDATE
         SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at`,
      [key, JSON.stringify(value), ttlSeconds],
    );
  }

  async delete(key: string): Promise<void> {
    await this.pool.query("DELETE FROM cache_entries WHERE key = $1", [key]);
  }
}
