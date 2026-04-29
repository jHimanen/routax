import type { AuthProvider, CreateRouteRequest, UserId } from "@routax/shared";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { createContainer } from "../../container.js";
import { buildGpx, toSlug } from "../../lib/gpx.js";
import { runMigrations } from "../../migrations/migrate.js";

const pool = new Pool({
  host: process.env.POSTGRES_HOST ?? "localhost",
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  user: process.env.POSTGRES_USER ?? "routax",
  password: process.env.POSTGRES_PASSWORD ?? "routax_dev_password",
  database: process.env.POSTGRES_DB ?? "routax",
});

const primaryUserId = "gpx-stub-user-1" as UserId;
const alternateUserId = "gpx-stub-user-2" as UserId;

const routePayload: CreateRouteRequest = {
  name: "Helsinki–Turku brevet",
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
  elevationProfile: [16, 21, 27],
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

// ── toSlug unit tests ─────────────────────────────────────────────────────────

describe("toSlug", () => {
  it("strips diacritics", () => {
    expect(toSlug("Helsinki–Turku")).toBe("helsinki-turku");
    expect(toSlug("Ö-route")).toBe("o-route");
    expect(toSlug("My Route éàü")).toBe("my-route-eau");
  });

  it("truncates to 60 chars with no trailing hyphen", () => {
    const long = "a".repeat(65);
    const result = toSlug(long);
    expect(result.length).toBe(60);
    expect(result.endsWith("-")).toBe(false);
  });

  it("collapses runs of special chars into a single hyphen", () => {
    expect(toSlug("foo---bar")).toBe("foo-bar");
    expect(toSlug("  hello   world  ")).toBe("hello-world");
  });

  it("falls back to 'route' for empty or all-special input", () => {
    expect(toSlug("")).toBe("route");
    expect(toSlug("!!!")).toBe("route");
  });
});

// ── buildGpx unit tests ───────────────────────────────────────────────────────

describe("buildGpx", () => {
  const baseParams = {
    name: "Test route",
    createdAt: "2026-04-28T10:00:00.000Z",
    coordinates: [[24.9384, 60.1699] as [number, number], [24.9654, 60.2055] as [number, number]],
    elevationProfile: [16, 21],
  };

  it("produces a valid XML preamble and GPX 1.1 root", () => {
    const xml = buildGpx(baseParams);
    expect(xml).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>/);
    expect(xml).toContain('xmlns="http://www.topografix.com/GPX/1/1"');
  });

  it("generates the correct number of trkpt elements", () => {
    const xml = buildGpx(baseParams);
    const matches = xml.match(/<trkpt /g);
    expect(matches).toHaveLength(2);
  });

  it("formats lat/lon to 6 decimal places and elevation to 1", () => {
    const xml = buildGpx(baseParams);
    expect(xml).toContain('lat="60.169900"');
    expect(xml).toContain('lon="24.938400"');
    expect(xml).toContain("<ele>16.0</ele>");
  });

  it("XML-escapes the route name", () => {
    const xml = buildGpx({ ...baseParams, name: "Route <A> & B" });
    expect(xml).toContain("Route &lt;A&gt; &amp; B");
    expect(xml).not.toContain("<A>");
  });

  it("includes <link> when appLink is provided", () => {
    const xml = buildGpx({ ...baseParams, appLink: "https://routax.cc/?route=abc" });
    expect(xml).toContain('<link href="https://routax.cc/?route=abc">');
  });

  it("omits <link> when appLink is undefined", () => {
    const xml = buildGpx(baseParams);
    expect(xml).not.toContain("<link");
  });

  it("uses elevation 0.0 for missing elevationProfile entries", () => {
    const xml = buildGpx({ ...baseParams, elevationProfile: [16] });
    expect(xml).toContain("<ele>16.0</ele>");
    expect(xml).toContain("<ele>0.0</ele>");
  });
});

// ── Integration tests ─────────────────────────────────────────────────────────

describe("GPX endpoints", () => {
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
    await pool.query("DELETE FROM flags WHERE key = 'gpx_export'");
  });

  afterAll(async () => {
    await pool.query("DELETE FROM flags WHERE key = 'gpx_export'");
    await pool.end();
  });

  describe("flag disabled", () => {
    it("GET /routes/:id/gpx returns 404 when flag absent", async () => {
      const app = makeAppForUser(primaryUserId);
      const res = await app.inject({
        method: "GET",
        url: "/routes/00000000-0000-1000-8000-000000000001/gpx",
      });
      expect(res.statusCode).toBe(404);
      await app.close();
    });

    it("POST /gpx/preview returns 404 when flag absent", async () => {
      const app = makeAppForUser(primaryUserId);
      const res = await app.inject({
        method: "POST",
        url: "/gpx/preview",
        payload: {
          geometry: routePayload.geometry,
          elevationProfile: routePayload.elevationProfile,
          distance: routePayload.distance,
        },
      });
      expect(res.statusCode).toBe(404);
      await app.close();
    });
  });

  describe("flag enabled", () => {
    beforeAll(async () => {
      await pool.query(
        "INSERT INTO flags (key, rules) VALUES ('gpx_export', $1) ON CONFLICT (key) DO UPDATE SET rules = $1",
        [JSON.stringify({ default: true })],
      );
    });

    it("GET /routes/:id/gpx downloads saved route as GPX with correct headers", async () => {
      const app = makeAppForUser(primaryUserId);

      const createRes = await app.inject({
        method: "POST",
        url: "/routes",
        payload: routePayload,
      });
      expect(createRes.statusCode).toBe(200);
      const routeId = createRes.json<{ id: string }>().id;

      const gpxRes = await app.inject({
        method: "GET",
        url: `/routes/${routeId}/gpx`,
      });
      expect(gpxRes.statusCode).toBe(200);
      expect(gpxRes.headers["content-type"]).toContain("application/gpx+xml");
      expect(gpxRes.headers["content-disposition"]).toMatch(
        /attachment; filename="routax-helsinki-turku-brevet-\d{8}\.gpx"/,
      );
      expect(gpxRes.body).toMatch(/^<\?xml/);
      expect(gpxRes.body).toContain("<trkpt ");
      expect(gpxRes.body).toContain("<ele>");

      const trkpts = gpxRes.body.match(/<trkpt /g);
      expect(trkpts).toHaveLength(3);

      const analytics = await pool.query<{ source: string }>(
        `SELECT properties->>'source' as source
         FROM analytics_events
         WHERE user_id = $1 AND event = 'gpx_exported' AND properties->>'source' = 'saved'`,
        [primaryUserId],
      );
      expect(analytics.rows).toHaveLength(1);

      await app.close();
    });

    it("GET /routes/:id/gpx returns 404 for non-existent route", async () => {
      const app = makeAppForUser(primaryUserId);
      const res = await app.inject({
        method: "GET",
        url: "/routes/00000000-0000-1000-8000-000000000099/gpx",
      });
      expect(res.statusCode).toBe(404);
      await app.close();
    });

    it("GET /routes/:id/gpx returns 404 when accessed by wrong user", async () => {
      const ownerApp = makeAppForUser(primaryUserId);
      const otherApp = makeAppForUser(alternateUserId);

      const createRes = await ownerApp.inject({
        method: "POST",
        url: "/routes",
        payload: { ...routePayload, name: "Owner private route" },
      });
      const routeId = createRes.json<{ id: string }>().id;

      const gpxRes = await otherApp.inject({
        method: "GET",
        url: `/routes/${routeId}/gpx`,
      });
      expect(gpxRes.statusCode).toBe(404);

      await ownerApp.close();
      await otherApp.close();
    });

    it("POST /gpx/preview returns GPX without <link> and fires preview analytics", async () => {
      await pool.query(
        "DELETE FROM analytics_events WHERE user_id = $1 AND event = 'gpx_exported'",
        [primaryUserId],
      );

      const app = makeAppForUser(primaryUserId);
      const res = await app.inject({
        method: "POST",
        url: "/gpx/preview",
        payload: {
          geometry: routePayload.geometry,
          elevationProfile: routePayload.elevationProfile,
          distance: routePayload.distance,
          name: "Preview ride",
        },
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toContain("application/gpx+xml");
      expect(res.headers["content-disposition"]).toMatch(
        /attachment; filename="routax-preview-ride-\d{8}\.gpx"/,
      );
      expect(res.body).toContain("<trkpt ");
      expect(res.body).not.toContain("<link");

      const analytics = await pool.query<{ source: string }>(
        `SELECT properties->>'source' as source
         FROM analytics_events
         WHERE user_id = $1 AND event = 'gpx_exported' AND properties->>'source' = 'preview'`,
        [primaryUserId],
      );
      expect(analytics.rows).toHaveLength(1);

      await app.close();
    });

    it("POST /gpx/preview returns 400 for missing geometry", async () => {
      const app = makeAppForUser(primaryUserId);
      const res = await app.inject({
        method: "POST",
        url: "/gpx/preview",
        payload: { elevationProfile: [16, 21], distance: 1000 },
      });
      expect(res.statusCode).toBe(400);
      await app.close();
    });

    it("POST /gpx/preview returns 400 when geometry has only one coordinate", async () => {
      const app = makeAppForUser(primaryUserId);
      const res = await app.inject({
        method: "POST",
        url: "/gpx/preview",
        payload: {
          geometry: { type: "LineString", coordinates: [[24.9384, 60.1699]] },
          elevationProfile: [16],
          distance: 0,
        },
      });
      expect(res.statusCode).toBe(400);
      await app.close();
    });
  });
});
