import path from "node:path";
import { runner } from "node-pg-migrate";

function dbConfig() {
  return {
    host: process.env.POSTGRES_HOST ?? "localhost",
    port: Number(process.env.POSTGRES_PORT ?? 5432),
    user: process.env.POSTGRES_USER ?? "routax",
    password: process.env.POSTGRES_PASSWORD ?? "routax_dev_password",
    database: process.env.POSTGRES_DB ?? "routax",
  };
}

export async function runMigrations(): Promise<void> {
  await runner({
    databaseUrl: dbConfig(),
    migrationsTable: "pgmigrations",
    dir: path.join(__dirname, "../../migrations"),
    direction: "up",
    count: Number.POSITIVE_INFINITY,
    log: console.log,
  });
}
