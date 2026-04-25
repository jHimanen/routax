import { config } from "dotenv";
import { Pool } from "pg";
import { runMigrations } from "./src/migrations/runner.js";

config({ path: ".env.test", override: false });

export async function setup(): Promise<void> {
  const pool = new Pool({
    host: process.env.POSTGRES_HOST ?? "localhost",
    port: Number(process.env.POSTGRES_PORT ?? 5432),
    user: process.env.POSTGRES_USER ?? "routax",
    password: process.env.POSTGRES_PASSWORD ?? "routax_dev_password",
    database: process.env.POSTGRES_DB ?? "routax",
  });
  try {
    await runMigrations(pool);
  } finally {
    await pool.end();
  }
}
