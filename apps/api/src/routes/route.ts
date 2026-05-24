import { RouteRequestSchema, type RouteResult } from "@routax/shared";
import * as Sentry from "@sentry/node";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { RoundTripUnbuildableError } from "../adapters/GraphhopperRoutingProvider.js";
import type { Container } from "../container.js";

export function registerRouteEndpoint(app: FastifyInstance, container: Container): void {
  app
    .withTypeProvider<ZodTypeProvider>()
    .post("/route", { schema: { body: RouteRequestSchema } }, async (request) => {
      const user = await container.auth.requireUser(request);
      const body = request.body;

      const isRoundTrip = body.mode === "round_trip";

      request.log.info(
        {
          userId: user.id,
          mode: body.mode,
          ...(isRoundTrip
            ? { targetDistanceKm: body.targetDistanceKm }
            : { waypoint_count: body.waypoints.length }),
        },
        "route request received",
      );

      const t0 = Date.now();
      let result: RouteResult;
      try {
        if (isRoundTrip) {
          if (!container.routing.planRoundTrip) {
            throw new Error("Round-trip routing not supported");
          }
          result = await container.routing.planRoundTrip(body);
        } else {
          result = await container.routing.planRoute(body);
        }
      } catch (err) {
        if (err instanceof RoundTripUnbuildableError) {
          await container.analytics.track({
            name: "round_trip_unbuildable",
            userId: user.id,
            properties: { targetDistanceKm: isRoundTrip ? body.targetDistanceKm : 0 },
          });
          throw err; // statusCode=422; caught by global error handler
        }
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("unroutable")) {
          const clientErr = new Error(msg) as Error & { statusCode: number };
          clientErr.statusCode = 422;
          throw clientErr;
        }
        throw err;
      }

      request.log.info(
        { userId: user.id, upstreamMs: Date.now() - t0 },
        "graphhopper response received",
      );

      Sentry.addBreadcrumb({
        category: "route",
        message: "route planned",
        data: {
          mode: body.mode,
          distanceM: result.distance,
          ascent: result.ascent,
        },
        level: "info",
      });

      if (isRoundTrip) {
        await container.analytics.track({
          name: (body.seed ?? 0) > 0 ? "round_trip_regenerated" : "round_trip_generated",
          userId: user.id,
          properties: {
            targetDistanceKm: body.targetDistanceKm,
            seed: body.seed ?? 0,
            distance_m: result.distance,
          },
        });
      } else {
        await container.analytics.track({
          name: "route_planned",
          userId: user.id,
          properties: {
            waypoint_count: body.waypoints.length,
            distance_m: result.distance,
            ascent_m: result.ascent,
          },
        });
      }

      return result;
    });
}
