import { RouteRequestSchema } from "@routax/shared";
import * as Sentry from "@sentry/node";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import type { Container } from "../container.js";

export function registerRouteEndpoint(app: FastifyInstance, container: Container): void {
  app
    .withTypeProvider<ZodTypeProvider>()
    .post("/route", { schema: { body: RouteRequestSchema } }, async (request) => {
      const user = await container.auth.requireUser(request);
      const body = request.body;

      request.log.info(
        { userId: user.id, start: body.start, end: body.end, preset: body.preset },
        "route request received",
      );

      const t0 = Date.now();
      const result = await container.routing.planRoute(body);
      request.log.info(
        { userId: user.id, upstreamMs: Date.now() - t0 },
        "graphhopper response received",
      );

      Sentry.addBreadcrumb({
        category: "route",
        message: "route planned",
        data: {
          preset: body.preset,
          advancedOverrides: body.advancedOverrides ?? null,
          distanceM: result.distance,
          ascent: result.ascent,
        },
        level: "info",
      });

      await container.analytics.track({
        name: "route_planned",
        userId: user.id,
        properties: {
          preset: body.preset,
          has_advanced_overrides: body.advancedOverrides !== undefined,
          distance_m: result.distance,
          ascent_m: result.ascent,
        },
      });

      return result;
    });
}
