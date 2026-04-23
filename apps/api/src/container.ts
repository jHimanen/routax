import type {
  AnalyticsProvider,
  AuthProvider,
  CacheProvider,
  EmailProvider,
  PaymentProvider,
  QueueProvider,
  RoutingProvider,
  StorageProvider,
} from "@via/shared";
import { Pool } from "pg";
import { GraphhopperRoutingProvider } from "./adapters/GraphhopperRoutingProvider.js";
import { MailHogEmailProvider } from "./adapters/MailHogEmailProvider.js";
import { MinioStorageProvider } from "./adapters/MinioStorageProvider.js";
import { NoopPaymentProvider } from "./adapters/NoopPaymentProvider.js";
import { PostgresAnalyticsProvider } from "./adapters/PostgresAnalyticsProvider.js";
import { PostgresCacheProvider } from "./adapters/PostgresCacheProvider.js";
import { PostgresQueueProvider } from "./adapters/PostgresQueueProvider.js";
import { StubAuthProvider } from "./adapters/StubAuthProvider.js";

export interface Container {
  auth: AuthProvider;
  payment: PaymentProvider;
  email: EmailProvider;
  storage: StorageProvider;
  analytics: AnalyticsProvider;
  routing: RoutingProvider;
  queue: QueueProvider;
  cache: CacheProvider;
  close(): Promise<void>;
}

export function createContainer(): Container {
  const pool = new Pool({
    host: process.env.POSTGRES_HOST ?? "localhost",
    port: Number(process.env.POSTGRES_PORT ?? 5432),
    user: process.env.POSTGRES_USER ?? "via",
    password: process.env.POSTGRES_PASSWORD ?? "via_dev_password",
    database: process.env.POSTGRES_DB ?? "via",
  });

  const cache = new PostgresCacheProvider(pool);

  return {
    auth: new StubAuthProvider(),
    payment: new NoopPaymentProvider(),
    email: new MailHogEmailProvider(),
    storage: new MinioStorageProvider(),
    analytics: new PostgresAnalyticsProvider(pool),
    routing: new GraphhopperRoutingProvider(),
    queue: new PostgresQueueProvider(pool),
    cache,
    close: async () => {
      cache.stopSweeper();
      await pool.end();
    },
  };
}
