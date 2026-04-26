import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PostgresFeatureFlagProvider,
  evaluateFlag,
} from "../PostgresFeatureFlagProvider.js";
import type { FlagContext, FlagRule } from "@routax/shared";
import { FlagRuleSchema } from "@routax/shared";

const LOCAL_CTX: FlagContext = { environment: "local" };
const USER_CTX: FlagContext = { userId: "stub-user-1", environment: "local" };

// --- Pure rule evaluation ---

describe("evaluateFlag", () => {
  it("returns default false when no rules match", () => {
    const rule: FlagRule = { default: false };
    expect(evaluateFlag("k", rule, LOCAL_CTX)).toBe(false);
  });

  it("returns default true when no rules match", () => {
    const rule: FlagRule = { default: true };
    expect(evaluateFlag("k", rule, LOCAL_CTX)).toBe(true);
  });

  it("defaults to false when default is omitted", () => {
    expect(evaluateFlag("k", {}, LOCAL_CTX)).toBe(false);
  });

  it("environment rule overrides default", () => {
    const rule: FlagRule = { default: false, environments: { local: true } };
    expect(evaluateFlag("k", rule, LOCAL_CTX)).toBe(true);
  });

  it("environment rule can turn off a default-true flag", () => {
    const rule: FlagRule = {
      default: true,
      environments: { local: false, staging: true },
    };
    expect(evaluateFlag("k", rule, LOCAL_CTX)).toBe(false);
    expect(evaluateFlag("k", rule, { environment: "staging" })).toBe(true);
  });

  it("user list takes precedence over environment", () => {
    const rule: FlagRule = {
      default: false,
      environments: { local: false },
      users: ["stub-user-1"],
    };
    expect(evaluateFlag("k", rule, USER_CTX)).toBe(true);
  });

  it("user not in list falls through to environment", () => {
    const rule: FlagRule = {
      default: false,
      environments: { local: true },
      users: ["other-user"],
    };
    expect(evaluateFlag("k", rule, USER_CTX)).toBe(true);
  });

  it("percentage: 100 always enables for any userId", () => {
    const rule: FlagRule = { default: false, percentage: 100 };
    expect(evaluateFlag("k", rule, USER_CTX)).toBe(true);
  });

  it("percentage: 0 never enables", () => {
    const rule: FlagRule = { default: false, percentage: 0 };
    expect(evaluateFlag("k", rule, USER_CTX)).toBe(false);
  });

  it("percentage skipped when no userId", () => {
    const rule: FlagRule = { default: false, percentage: 100 };
    expect(evaluateFlag("k", rule, LOCAL_CTX)).toBe(false);
  });

  it("percentage result is deterministic for same userId+key", () => {
    const rule: FlagRule = { default: false, percentage: 50 };
    const first = evaluateFlag("k", rule, USER_CTX);
    const second = evaluateFlag("k", rule, USER_CTX);
    expect(first).toBe(second);
  });
});

// --- FlagRule schema validation ---

describe("FlagRuleSchema", () => {
  it("accepts a valid full rule", () => {
    const result = FlagRuleSchema.safeParse({
      default: true,
      environments: { local: true, staging: false },
      users: ["u1"],
      percentage: 25,
    });
    expect(result.success).toBe(true);
  });

  it("accepts an empty object", () => {
    expect(FlagRuleSchema.safeParse({}).success).toBe(true);
  });

  it("rejects percentage out of range", () => {
    expect(FlagRuleSchema.safeParse({ percentage: 101 }).success).toBe(false);
    expect(FlagRuleSchema.safeParse({ percentage: -1 }).success).toBe(false);
  });

  it("rejects non-boolean environment value", () => {
    expect(
      FlagRuleSchema.safeParse({ environments: { local: "yes" } }).success,
    ).toBe(false);
  });

  it("rejects unknown environment key", () => {
    expect(
      FlagRuleSchema.safeParse({ environments: { prod: true } }).success,
    ).toBe(false);
  });
});

// --- Cache TTL (fake timers + mock pool) ---

describe("PostgresFeatureFlagProvider cache TTL", () => {
  const mockRows = [
    { key: "gpx_export", rules: { default: true } },
    { key: "saved_routes_ui", rules: { default: false } },
  ];

  let mockPool: { query: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.useFakeTimers();
    mockPool = {
      query: vi.fn().mockResolvedValue({ rows: mockRows }),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("loads on first call", async () => {
    const provider = new PostgresFeatureFlagProvider(mockPool as never);
    await provider.isEnabled("gpx_export", LOCAL_CTX);
    expect(mockPool.query).toHaveBeenCalledTimes(1);
  });

  it("does not reload within TTL", async () => {
    const provider = new PostgresFeatureFlagProvider(mockPool as never);
    await provider.isEnabled("gpx_export", LOCAL_CTX);
    vi.advanceTimersByTime(30_000);
    await provider.isEnabled("gpx_export", LOCAL_CTX);
    expect(mockPool.query).toHaveBeenCalledTimes(1);
  });

  it("reloads after TTL expires", async () => {
    const provider = new PostgresFeatureFlagProvider(mockPool as never);
    await provider.isEnabled("gpx_export", LOCAL_CTX);
    vi.advanceTimersByTime(61_000);
    await provider.isEnabled("gpx_export", LOCAL_CTX);
    expect(mockPool.query).toHaveBeenCalledTimes(2);
  });

  it("returns false for unknown key", async () => {
    const provider = new PostgresFeatureFlagProvider(mockPool as never);
    const result = await provider.isEnabled("nonexistent", LOCAL_CTX);
    expect(result).toBe(false);
  });

  it("evaluateAll returns all flags", async () => {
    const provider = new PostgresFeatureFlagProvider(mockPool as never);
    const all = await provider.evaluateAll(LOCAL_CTX);
    expect(all).toEqual({ gpx_export: true, saved_routes_ui: false });
  });

  it("skips rows with malformed rules JSON", async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [
        { key: "bad_flag", rules: { percentage: 999 } },
        { key: "good_flag", rules: { default: true } },
      ],
    });
    const provider = new PostgresFeatureFlagProvider(mockPool as never);
    const all = await provider.evaluateAll(LOCAL_CTX);
    expect(all).not.toHaveProperty("bad_flag");
    expect(all).toHaveProperty("good_flag", true);
  });
});
