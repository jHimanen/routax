import cors from "@fastify/cors";
import Fastify from "fastify";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import type { Container } from "./container.js";
import { setupAuthContext } from "./plugins/auth-context.js";
import { setupErrorHandler } from "./plugins/error-handler.js";
import { registerFlagsRoute } from "./routes/flags.js";
import { registerGpxEndpoints } from "./routes/gpx.js";
import { registerHealthRoute } from "./routes/health.js";
import { registerRouteEndpoint } from "./routes/route.js";
import { registerRoutesEndpoints } from "./routes/routes.js";

const DEFAULT_CORS_ORIGINS = [
  "http://localhost:3000",
  "https://localhost",
  "https://routax.cc",
  "https://www.routax.cc",
] as const;

/**
 * Prefer `ROUTAX_CORS_ALLOWLIST` — avoids platforms or proxies that treat a generic `CORS_ORIGIN`
 * env var as a literal single `Access-Control-Allow-Origin` value (comma-separated list becomes invalid).
 * `CORS_ORIGIN` is still read when the new name is unset (backwards compatibility).
 */
function resolveAllowedCorsOrigins(): Set<string> {
  const raw = process.env.ROUTAX_CORS_ALLOWLIST?.trim() || process.env.CORS_ORIGIN?.trim();
  if (!raw) {
    return new Set(DEFAULT_CORS_ORIGINS);
  }
  const parsed = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return new Set(parsed.length > 0 ? parsed : DEFAULT_CORS_ORIGINS);
}

export function buildApp(container: Container) {
  const app = Fastify({
    logger: process.env.NODE_ENV === "test" ? false : { level: process.env.LOG_LEVEL ?? "info" },
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const allowedOrigins = resolveAllowedCorsOrigins();

  void app.register(cors, {
    origin(originHeader, cb) {
      if (!originHeader) {
        cb(null, false);
        return;
      }
      if (allowedOrigins.has(originHeader)) {
        cb(null, true);
        return;
      }
      cb(null, false);
    },
  });

  app.addHook("onSend", async (request, reply, payload) => {
    const origin = request.headers.origin;
    if (typeof origin !== "string" || !allowedOrigins.has(origin)) {
      return payload;
    }
    const current = reply.getHeader("Access-Control-Allow-Origin");
    const mustReplace = Array.isArray(current) || typeof current !== "string" || current !== origin;
    if (mustReplace) {
      reply.removeHeader("Access-Control-Allow-Origin");
      reply.header("Access-Control-Allow-Origin", origin);
    }
    return payload;
  });

  setupAuthContext(app, container);
  setupErrorHandler(app);

  registerHealthRoute(app);
  registerRouteEndpoint(app, container);
  registerFlagsRoute(app, container);
  registerRoutesEndpoints(app, container);
  registerGpxEndpoints(app, container);

  return app;
}
