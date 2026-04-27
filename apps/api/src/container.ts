import type {
  AnalyticsProvider,
  AuthProvider,
  CacheProvider,
  EmailProvider,
  FeatureFlagProvider,
  PaymentProvider,
  QueueProvider,
  RoutingProvider,
  StorageProvider,
} from "@routax/shared";
import { Pool } from "pg";
import { GraphhopperRoutingProvider } from "./adapters/GraphhopperRoutingProvider.js";
import { MailHogEmailProvider } from "./adapters/MailHogEmailProvider.js";
import { MinioStorageProvider } from "./adapters/MinioStorageProvider.js";
import { NoopPaymentProvider } from "./adapters/NoopPaymentProvider.js";
import { PostgresAnalyticsProvider } from "./adapters/PostgresAnalyticsProvider.js";
import { PostgresCacheProvider } from "./adapters/PostgresCacheProvider.js";
import { PostgresFeatureFlagProvider } from "./adapters/PostgresFeatureFlagProvider.js";
import { PostgresQueueProvider } from "./adapters/PostgresQueueProvider.js";
import { StubAuthProvider } from "./adapters/StubAuthProvider.js";
import { RouteRepository } from "./repositories/routes.js";

export interface Container {
  auth: AuthProvider;
  payment: PaymentProvider;
  email: EmailProvider;
  storage: StorageProvider;
  analytics: AnalyticsProvider;
  routing: RoutingProvider;
  queue: QueueProvider;
  cache: CacheProvider;
  flags: FeatureFlagProvider;
  routes: RouteRepository;
  close(): Promise<void>;
}

export function createPool(): Pool {
  return new Pool({
    host: process.env.POSTGRES_HOST ?? "localhost",
    port: Number(process.env.POSTGRES_PORT ?? 5432),
    user: process.env.POSTGRES_USER ?? "routax",
    password: process.env.POSTGRES_PASSWORD ?? "routax_dev_password",
    database: process.env.POSTGRES_DB ?? "routax",
  });
}

export function createContainer(pool: Pool): Container {
  const cache = new PostgresCacheProvider(pool);
  const routes = new RouteRepository(pool);

  return {
    auth: new StubAuthProvider(),
    payment: new NoopPaymentProvider(),
    email: new MailHogEmailProvider(),
    storage: new MinioStorageProvider(),
    analytics: new PostgresAnalyticsProvider(pool),
    routing: new GraphhopperRoutingProvider(),
    queue: new PostgresQueueProvider(pool),
    cache,
    flags: new PostgresFeatureFlagProvider(pool),
    routes,
    close: async () => {
      cache.stopSweeper();
      await pool.end();
    },
  };
}
