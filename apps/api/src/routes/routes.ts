import {
  type CreateRouteRequest,
  CreateRouteRequestSchema,
  type UpdateRouteRequest,
  UpdateRouteRequestSchema,
} from "@routax/shared";
import type { FastifyInstance } from "fastify";
import type { Container } from "../container.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readRouteId(params: unknown): string {
  const id = (params as { id?: string } | null)?.id;
  if (!id || !UUID_PATTERN.test(id)) {
    throw new Error("Invalid route id");
  }
  return id;
}

function readListQuery(query: unknown): { cursor?: string; limit?: number } {
  const raw = (query as { cursor?: string; limit?: string } | null) ?? {};
  const cursor = raw.cursor;
  const parsedLimit = raw.limit === undefined ? undefined : Number(raw.limit);
  const limit = parsedLimit === undefined || Number.isNaN(parsedLimit) ? undefined : parsedLimit;
  return { cursor, limit };
}

export function registerRoutesEndpoints(app: FastifyInstance, container: Container): void {
  app.post("/routes", { schema: { body: CreateRouteRequestSchema } }, async (request) => {
    const user = await container.auth.requireUser(request);
    const saved = await container.routes.create(user.id, request.body as CreateRouteRequest);
    await container.analytics.track({
      name: "route_saved",
      userId: user.id,
      properties: {
        distance_m: saved.distance,
        ascent_m: saved.ascent,
        profile: saved.profile,
      },
    });
    return saved;
  });

  app.get("/routes", {}, async (request) => {
    const user = await container.auth.requireUser(request);
    const query = readListQuery(request.query);
    const listResult = await container.routes.listByUser(user.id, {
      limit: query.limit,
      cursor: query.cursor,
    });
    await container.analytics.track({
      name: "route_listed",
      userId: user.id,
      properties: { count: listResult.items.length },
    });
    return listResult;
  });

  app.get("/routes/:id", {}, async (request, reply) => {
    const user = await container.auth.requireUser(request);
    const saved = await container.routes.get(user.id, readRouteId(request.params));
    if (!saved) {
      return reply.code(404).send({ error: { code: "REQUEST_ERROR", message: "Route not found" } });
    }
    return saved;
  });

  app.patch(
    "/routes/:id",
    {
      schema: {
        body: UpdateRouteRequestSchema,
      },
    },
    async (request, reply) => {
      const user = await container.auth.requireUser(request);
      const routeId = readRouteId(request.params);
      const saved = await container.routes.rename(
        user.id,
        routeId,
        request.body as UpdateRouteRequest,
      );
      if (!saved) {
        return reply
          .code(404)
          .send({ error: { code: "REQUEST_ERROR", message: "Route not found" } });
      }
      await container.analytics.track({
        name: "route_renamed",
        userId: user.id,
        properties: { route_id: saved.id },
      });
      return saved;
    },
  );

  app.delete("/routes/:id", {}, async (request, reply) => {
    const user = await container.auth.requireUser(request);
    const routeId = readRouteId(request.params);
    const deleted = await container.routes.delete(user.id, routeId);
    if (!deleted) {
      return reply.code(404).send({ error: { code: "REQUEST_ERROR", message: "Route not found" } });
    }
    await container.analytics.track({
      name: "route_deleted",
      userId: user.id,
      properties: { route_id: routeId },
    });
    return reply.code(204).send();
  });
}
