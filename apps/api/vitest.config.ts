import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/__tests__/**/*.test.ts", "scripts/__tests__/**/*.test.ts"],
    globalSetup: ["./vitest.globalSetup.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Serialize test files: node-pg-migrate advisory lock rejects concurrent
    // migration attempts, and the round-trip test temporarily drops all tables.
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
});
