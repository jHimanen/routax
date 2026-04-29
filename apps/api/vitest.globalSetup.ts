import * as path from "node:path";
import { config } from "dotenv";
import { runMigrations } from "./src/migrations/migrate.js";

for (const p of [
  path.join(process.cwd(), ".env.test.local"),
  path.join(process.cwd(), ".env.test"),
  path.join(process.cwd(), "..", "..", ".env.local"),
  path.join(process.cwd(), "..", "..", ".env"),
]) {
  config({ path: p, override: false });
}

export async function setup(): Promise<void> {
  await runMigrations();
}
