import * as path from "node:path";
import dotenv from "dotenv";
import { buildApp } from "./app.js";
import { createContainer, createPool } from "./container.js";
import { runMigrations } from "./migrations/runner.js";
import { initSentry } from "./sentry.js";

function loadLocalEnv(): void {
  const candidates = [
    path.join(process.cwd(), ".env.local"),
    path.join(process.cwd(), ".env"),
    path.join(process.cwd(), "../../.env.local"),
    path.join(process.cwd(), "../../.env"),
  ];

  // Keep existing process env values and fill missing ones from env files.
  for (const envPath of candidates) {
    dotenv.config({ path: envPath });
  }
}

const start = async (): Promise<void> => {
  loadLocalEnv();
  initSentry();
  const pool = createPool();

  await runMigrations(pool);

  const container = createContainer(pool);
  const app = buildApp(container);

  const shutdown = async () => {
    await app.close();
    await container.close();
  };
  process.once("SIGTERM", () => void shutdown());
  process.once("SIGINT", () => void shutdown());

  try {
    const port = Number(process.env.API_PORT ?? 3001);
    await app.listen({ port, host: "0.0.0.0" });
  } catch (err) {
    app.log.error(err);
    await container.close();
    process.exit(1);
  }
};

void start();
