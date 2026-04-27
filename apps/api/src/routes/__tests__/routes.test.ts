import type { AuthProvider, CreateRouteRequest, UserId } from "@routax/shared";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { createContainer } from "../../container.js";
import { runMigrations } from "../../migrations/runner.js";

const pool = new Pool({
  host: process.env.POSTGRES_HOST ?? "localhost",
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  user: process.env.POSTGRES_USER ?? "routax",
  password: process.env.POSTGRES_PASSWORD ?? "routax_dev_password",
  database: process.env.POSTGRES_DB ?? "routax",
});

const primaryUserId = "stub-user-1" as UserId;
const alternateUserId = "stub-user-2" as UserId;

const payload: CreateRouteRequest = {
  name: "Brevet test route",
  profile: { avoidTraffic: 0.2, preferQuietSurfaces: 0.8, maxGradient: 9 },
  geometry: {
    type: "LineString",
    coordinates: [
      [24.9384, 60.1699],
      [24.9654, 60.2055],
      [25.0097, 60.2307],
    ],
  },
  distance: 15432,
  duration: 3120,
  ascent: 142,
  descent: 137,
  elevationProfile: [16, 21, 27, 33, 26],
};

function authProviderFor(userId: UserId): AuthProvider {
  return {
    getUserContext: async () => ({ id: userId, email: `${userId}@routax.local` }),
    requireUser: async () => ({ id: userId, email: `${userId}@routax.local` }),
  };
}

function makeAppForUser(userId: UserId) {
  const container = createContainer(pool);
  container.auth = authProviderFor(userId);
  return buildApp(container);
}

describe("/routes endpoints", () => {
  beforeAll(async () => {
    await runMigrations(pool);
    await pool.query("DELETE FROM routes WHERE user_id IN ($1, $2)", [
      primaryUserId,
      alternateUserId,
    ]);
    await pool.query("DELETE FROM analytics_events WHERE user_id IN ($1, $2)", [
      primaryUserId,
      alternateUserId,
    ]);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("supports create/get/rename/delete and emits route_saved analytics event", async () => {
    const app = makeAppForUser(primaryUserId);

    const createResponse = await app.inject({
      method: "POST",
      url: "/routes",
      payload,
    });
    expect(createResponse.statusCode).toBe(200);
    const created = createResponse.json<{ id: string; name: string; userId: string }>();
    expect(created.name).toBe(payload.name);
    expect(created.userId).toBe(primaryUserId);

    const routeId = created.id;
    const getResponse = await app.inject({
      method: "GET",
      url: `/routes/${routeId}`,
    });
    expect(getResponse.statusCode).toBe(200);
    const fetched = getResponse.json<{ id: string; geometry: { type: string } }>();
    expect(fetched.id).toBe(routeId);
    expect(fetched.geometry.type).toBe("LineString");

    const renameResponse = await app.inject({
      method: "PATCH",
      url: `/routes/${routeId}`,
      payload: { name: "Renamed brevet route" },
    });
    expect(renameResponse.statusCode).toBe(200);
    expect(renameResponse.json<{ name: string }>().name).toBe("Renamed brevet route");

    const analytics = await pool.query<{ event: string }>(
      "SELECT event FROM analytics_events WHERE user_id = $1 AND event = 'route_saved'",
      [primaryUserId],
    );
    expect(analytics.rows).toHaveLength(1);

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/routes/${routeId}`,
    });
    expect(deleteResponse.statusCode).toBe(204);

    const missingResponse = await app.inject({
      method: "GET",
      url: `/routes/${routeId}`,
    });
    expect(missingResponse.statusCode).toBe(404);
    await app.close();
  });

  it("round-trips geometry losslessly based on ST_Equals", async () => {
    const app = makeAppForUser(primaryUserId);
    const createResponse = await app.inject({
      method: "POST",
      url: "/routes",
      payload: { ...payload, name: "Geometry equality check" },
    });
    expect(createResponse.statusCode).toBe(200);
    const created = createResponse.json<{
      id: string;
      geometry: { type: string; coordinates: number[][] };
    }>();

    const equalsResult = await pool.query<{ is_equal: boolean }>(
      `SELECT ST_Equals(
         geometry::geometry,
         ST_GeomFromGeoJSON($2)
       ) AS is_equal
       FROM routes
       WHERE id = $1`,
      [created.id, JSON.stringify(created.geometry)],
    );
    expect(equalsResult.rows[0]?.is_equal).toBe(true);
    await app.close();
  });

  it("paginates list endpoint with keyset semantics", async () => {
    const app = makeAppForUser(primaryUserId);
    await pool.query("DELETE FROM routes WHERE user_id = $1", [primaryUserId]);

    for (let i = 0; i < 25; i += 1) {
      const response = await app.inject({
        method: "POST",
        url: "/routes",
        payload: { ...payload, name: `Route ${i}` },
      });
      expect(response.statusCode).toBe(200);
    }

    const page1Response = await app.inject({ method: "GET", url: "/routes?limit=10" });
    expect(page1Response.statusCode).toBe(200);
    const page1 = page1Response.json<{ items: Array<{ id: string }>; nextCursor?: string }>();
    expect(page1.items).toHaveLength(10);
    expect(page1.nextCursor).toBeTruthy();

    const page2Response = await app.inject({
      method: "GET",
      url: `/routes?limit=10&cursor=${encodeURIComponent(page1.nextCursor ?? "")}`,
    });
    expect(page2Response.statusCode).toBe(200);
    const page2 = page2Response.json<{ items: Array<{ id: string }>; nextCursor?: string }>();
    expect(page2.items).toHaveLength(10);
    expect(page2.nextCursor).toBeTruthy();

    const page3Response = await app.inject({
      method: "GET",
      url: `/routes?limit=10&cursor=${encodeURIComponent(page2.nextCursor ?? "")}`,
    });
    expect(page3Response.statusCode).toBe(200);
    const page3 = page3Response.json<{ items: Array<{ id: string }>; nextCursor?: string }>();
    expect(page3.items).toHaveLength(5);
    expect(page3.nextCursor).toBeUndefined();
    await app.close();
  });

  it("emits route_listed on GET /routes with list count", async () => {
    const app = makeAppForUser(primaryUserId);
    await pool.query("DELETE FROM routes WHERE user_id = $1", [primaryUserId]);
    await pool.query("DELETE FROM analytics_events WHERE user_id = $1", [primaryUserId]);

    const postResponse = await app.inject({
      method: "POST",
      url: "/routes",
      payload: { ...payload, name: "Listed count check" },
    });
    expect(postResponse.statusCode).toBe(200);

    const listResponse = await app.inject({ method: "GET", url: "/routes?limit=5" });
    expect(listResponse.statusCode).toBe(200);
    const list = listResponse.json<{ items: { id: string }[] }>();
    expect(list.items).toHaveLength(1);

    const listed = await pool.query<{ count: string | null }>(
      `SELECT properties->>'count' as count
       FROM analytics_events
       WHERE user_id = $1 AND event = 'route_listed'`,
      [primaryUserId],
    );
    expect(listed.rows).toHaveLength(1);
    expect(listed.rows[0]?.count).toBe("1");
    await app.close();
  });

  it("enforces user scoping across read/update/delete", async () => {
    const ownerApp = makeAppForUser(primaryUserId);
    const otherUserApp = makeAppForUser(alternateUserId);

    const createResponse = await ownerApp.inject({
      method: "POST",
      url: "/routes",
      payload: { ...payload, name: "Owner-only route" },
    });
    expect(createResponse.statusCode).toBe(200);
    const routeId = createResponse.json<{ id: string }>().id;

    const getByOther = await otherUserApp.inject({ method: "GET", url: `/routes/${routeId}` });
    expect(getByOther.statusCode).toBe(404);

    const patchByOther = await otherUserApp.inject({
      method: "PATCH",
      url: `/routes/${routeId}`,
      payload: { name: "Should not work" },
    });
    expect(patchByOther.statusCode).toBe(404);

    const deleteByOther = await otherUserApp.inject({
      method: "DELETE",
      url: `/routes/${routeId}`,
    });
    expect(deleteByOther.statusCode).toBe(404);

    const ownerStillSeesRoute = await ownerApp.inject({
      method: "GET",
      url: `/routes/${routeId}`,
    });
    expect(ownerStillSeesRoute.statusCode).toBe(200);

    await ownerApp.close();
    await otherUserApp.close();
  });
});
