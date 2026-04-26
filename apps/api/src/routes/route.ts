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
        { userId: user.id, start: body.start, end: body.end },
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
          avoidTraffic: body.profile.avoidTraffic,
          preferQuietSurfaces: body.profile.preferQuietSurfaces,
          maxGradient: body.profile.maxGradient,
          distanceM: result.distance,
        },
        level: "info",
      });
      return result;
    });
}
