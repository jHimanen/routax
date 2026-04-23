import type { AnalyticsEvent, AnalyticsProvider, UserId } from "@via/shared";
import type { Pool } from "pg";

export class PostgresAnalyticsProvider implements AnalyticsProvider {
  constructor(private readonly pool: Pool) {}

  async track(event: AnalyticsEvent): Promise<void> {
    await this.pool.query(
      `INSERT INTO analytics_events (id, user_id, event, ts, properties)
       VALUES (gen_random_uuid(), $1, $2, $3, $4)`,
      [
        event.userId ?? null,
        event.name,
        event.timestamp ?? new Date(),
        JSON.stringify(event.properties ?? {}),
      ],
    );
  }

  async identify(userId: UserId, traits: Record<string, unknown>): Promise<void> {
    await this.pool.query(
      `INSERT INTO analytics_identities (user_id, traits, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (user_id) DO UPDATE
         SET traits = analytics_identities.traits || $2,
             updated_at = now()`,
      [userId, JSON.stringify(traits)],
    );
  }
}
