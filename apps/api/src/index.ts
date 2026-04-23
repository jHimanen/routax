import Fastify from "fastify";
import { Pool } from "pg";
import { runMigrations } from "./migrations/runner.js";

const fastify = Fastify({ logger: true });

fastify.get("/health", async (_request, _reply) => {
  return { status: "ok" };
});

// Placeholder — real routing implementation in Task 06
fastify.get("/route", async (_request, _reply) => {
  return { status: "not implemented" };
});

const start = async (): Promise<void> => {
  try {
    const pool = new Pool({
      host: process.env.POSTGRES_HOST ?? "localhost",
      port: Number(process.env.POSTGRES_PORT ?? 5432),
      user: process.env.POSTGRES_USER ?? "via",
      password: process.env.POSTGRES_PASSWORD ?? "via_dev_password",
      database: process.env.POSTGRES_DB ?? "via",
    });

    await runMigrations(pool);
    await pool.end();

    const port = Number(process.env.API_PORT ?? 3001);
    await fastify.listen({ port, host: "0.0.0.0" });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

void start();
