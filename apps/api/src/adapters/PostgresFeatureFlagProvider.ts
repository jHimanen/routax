import { createHash } from "node:crypto";
import type { FlagContext, FlagRule, FeatureFlagProvider } from "@routax/shared";
import { FlagRuleSchema } from "@routax/shared";
import type { Pool } from "pg";

const CACHE_TTL_MS = 60_000;

export function evaluateFlag(key: string, rule: FlagRule, ctx: FlagContext): boolean {
  if (rule.users && ctx.userId && rule.users.includes(ctx.userId)) return true;

  const envValue = rule.environments?.[ctx.environment];
  if (envValue !== undefined) {
    return envValue;
  }

  if (rule.percentage !== undefined && ctx.userId) {
    const hash = createHash("sha256").update(`${ctx.userId}:${key}`).digest();
    const uint32 = hash.readUInt32BE(0);
    return uint32 % 100 < rule.percentage;
  }

  return rule.default ?? false;
}

export class PostgresFeatureFlagProvider implements FeatureFlagProvider {
  private cache = new Map<string, FlagRule>();
  private lastLoaded = 0;

  constructor(private readonly pool: Pool) {}

  private async ensureLoaded(): Promise<void> {
    if (Date.now() - this.lastLoaded < CACHE_TTL_MS) return;

    const result = await this.pool.query<{ key: string; rules: unknown }>(
      "SELECT key, rules FROM flags",
    );

    this.cache.clear();
    for (const row of result.rows) {
      const parsed = FlagRuleSchema.safeParse(row.rules);
      if (parsed.success) {
        this.cache.set(row.key, parsed.data);
      }
    }

    this.lastLoaded = Date.now();
  }

  async isEnabled(key: string, ctx: FlagContext): Promise<boolean> {
    await this.ensureLoaded();
    const rule = this.cache.get(key);
    if (!rule) return false;
    return evaluateFlag(key, rule, ctx);
  }

  async getVariant<T>(key: string, ctx: FlagContext): Promise<T | undefined> {
    const enabled = await this.isEnabled(key, ctx);
    return enabled ? (true as T) : undefined;
  }

  async evaluateAll(ctx: FlagContext): Promise<Record<string, boolean>> {
    await this.ensureLoaded();
    const result: Record<string, boolean> = {};
    for (const [key, rule] of this.cache) {
      result[key] = evaluateFlag(key, rule, ctx);
    }
    return result;
  }
}
