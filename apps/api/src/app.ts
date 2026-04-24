import cors from "@fastify/cors";
import Fastify from "fastify";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import type { Container } from "./container.js";
import { setupAuthContext } from "./plugins/auth-context.js";
import { setupErrorHandler } from "./plugins/error-handler.js";
import { registerHealthRoute } from "./routes/health.js";
import { registerRouteEndpoint } from "./routes/route.js";

export function buildApp(container: Container) {
  const app = Fastify({
    logger: process.env.NODE_ENV === "test" ? false : { level: process.env.LOG_LEVEL ?? "info" },
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  void app.register(cors, {
    origin: process.env.CORS_ORIGIN ?? "http://localhost:3000",
  });

  setupAuthContext(app, container);
  setupErrorHandler(app);

  registerHealthRoute(app);
  registerRouteEndpoint(app, container);

  return app;
}
