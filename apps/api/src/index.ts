import { buildApp } from "./app.js";
import { createContainer, createPool } from "./container.js";
import { runMigrations } from "./migrations/runner.js";

const start = async (): Promise<void> => {
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
