import {
  type FlagContext,
  GpxImportRequestSchema,
  type GpxPreviewRequest,
  GpxPreviewRequestSchema,
} from "@routax/shared";
import type { FastifyInstance } from "fastify";
import type { Container } from "../container.js";
import { GpxParseError, normalizeToWaypoints, parseGpxPoints } from "../lib/gpx-parse.js";
import { buildGpx, toSlug } from "../lib/gpx.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readRouteId(params: unknown): string {
  const id = (params as { id?: string } | null)?.id;
  if (!id || !UUID_PATTERN.test(id)) {
    throw new Error("Invalid route id");
  }
  return id;
}

function buildAppLink(routeId: string): string {
  const base = process.env.ROUTAX_APP_BASE_URL ?? "https://routax.cc";
  return `${base}/?route=${encodeURIComponent(routeId)}`;
}

export function registerGpxEndpoints(app: FastifyInstance, container: Container): void {
  app.get("/routes/:id/gpx", {}, async (request, reply) => {
    const user = await container.auth.requireUser(request);

    const flagEnabled = await container.flags.isEnabled("gpx_export", {
      userId: user.id,
      environment: (process.env.NODE_ENV ?? "local") as FlagContext["environment"],
    });
    if (!flagEnabled) {
      return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Not found" } });
    }

    const saved = await container.routes.get(user.id, readRouteId(request.params));
    if (!saved) {
      return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Route not found" } });
    }

    const xml = buildGpx({
      name: saved.name,
      createdAt: saved.createdAt,
      appLink: buildAppLink(saved.id),
      coordinates: saved.geometry.coordinates,
      elevationProfile: saved.elevationProfile,
      cueSheet: saved.cueSheet,
    });

    const date = saved.createdAt.slice(0, 10).replace(/-/g, "");
    const filename = `routax-${toSlug(saved.name)}-${date}.gpx`;

    await container.analytics.track({
      name: "gpx_exported",
      userId: user.id,
      properties: {
        route_id: saved.id,
        distance: saved.distance,
        point_count: saved.geometry.coordinates.length,
        source: "saved",
      },
    });

    return reply
      .type("application/gpx+xml")
      .header("Content-Disposition", `attachment; filename="${filename}"`)
      .send(xml);
  });

  app.post(
    "/gpx/preview",
    { schema: { body: GpxPreviewRequestSchema } },
    async (request, reply) => {
      const user = await container.auth.requireUser(request);

      const flagEnabled = await container.flags.isEnabled("gpx_export", {
        userId: user.id,
        environment: (process.env.NODE_ENV ?? "local") as FlagContext["environment"],
      });
      if (!flagEnabled) {
        return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Not found" } });
      }

      const body = request.body as GpxPreviewRequest;

      const xml = buildGpx({
        name: body.name ?? "Routax preview",
        createdAt: new Date().toISOString(),
        appLink: undefined,
        coordinates: body.geometry.coordinates,
        elevationProfile: body.elevationProfile,
        cueSheet: body.cueSheet,
      });

      const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const slug = body.name ? toSlug(body.name) : "preview";
      const filename = `routax-${slug}-${date}.gpx`;

      await container.analytics.track({
        name: "gpx_exported",
        userId: user.id,
        properties: {
          distance: body.distance,
          point_count: body.geometry.coordinates.length,
          source: "preview",
        },
      });

      return reply
        .type("application/gpx+xml")
        .header("Content-Disposition", `attachment; filename="${filename}"`)
        .send(xml);
    },
  );

  app.post(
    "/gpx/import",
    { schema: { body: GpxImportRequestSchema }, bodyLimit: 4 * 1024 * 1024 },
    async (request, reply) => {
      const user = await container.auth.requireUser(request);

      const flagEnabled = await container.flags.isEnabled("gpx_import", {
        userId: user.id,
        environment: (process.env.NODE_ENV ?? "local") as FlagContext["environment"],
      });
      if (!flagEnabled) {
        return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Not found" } });
      }

      const { gpxText, filename } = request.body as { gpxText: string; filename: string };
      const importedAt = new Date().toISOString();

      await container.analytics.track({
        name: "gpx_import_started",
        userId: user.id,
        properties: { filename },
      });

      let points: ReturnType<typeof parseGpxPoints>;
      try {
        points = parseGpxPoints(gpxText);
      } catch (err) {
        await container.analytics.track({
          name: "gpx_import_failed",
          userId: user.id,
          properties: {
            filename,
            reason: err instanceof GpxParseError ? err.message : "unknown",
          },
        });
        const message = err instanceof GpxParseError ? err.message : "Could not parse GPX file.";
        return reply.code(422).send({ error: { code: "UNPROCESSABLE", message } });
      }

      const pointCount = points.length;
      const simplified = pointCount > 20;
      const waypoints = normalizeToWaypoints(points);

      await container.analytics.track({
        name: "gpx_import_succeeded",
        userId: user.id,
        properties: {
          filename,
          point_count: pointCount,
          simplified,
          waypoint_count: waypoints.length,
        },
      });

      return reply.send({ waypoints, importedAt, filename, pointCount, simplified });
    },
  );
}
