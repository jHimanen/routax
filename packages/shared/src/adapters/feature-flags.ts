import { z } from "zod";
import type { UserId } from "../types/user";

export const FlagRuleSchema = z.object({
  default: z.boolean().optional(),
  environments: z.record(z.enum(["local", "staging", "production"]), z.boolean()).optional(),
  users: z.array(z.string()).optional(),
  percentage: z.number().int().min(0).max(100).optional(),
});

export type FlagRule = z.infer<typeof FlagRuleSchema>;

export interface FlagContext {
  userId?: UserId;
  environment: "local" | "staging" | "production";
}

export interface FeatureFlagProvider {
  isEnabled(key: string, ctx: FlagContext): Promise<boolean>;
  getVariant<T>(key: string, ctx: FlagContext): Promise<T | undefined>;
  evaluateAll(ctx: FlagContext): Promise<Record<string, boolean>>;
}
