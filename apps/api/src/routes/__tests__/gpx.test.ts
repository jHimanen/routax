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
  preset: "quiet_country_roads",
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

  it("emits <wpt> elements for non-finish cue entries", () => {
    const xml = buildGpx({
      ...baseParams,
      cueSheet: [
        {
          index: 0,
          distanceFromStartMeters: 0,
          distanceFromPreviousMeters: 0,
          maneuver: "turn_right",
          streetName: "Mannerheimintie",
          text: "Turn right onto Mannerheimintie",
          coordinate: [24.9384, 60.1699],
        },
        {
          index: 1,
          distanceFromStartMeters: 500,
          distanceFromPreviousMeters: 500,
          maneuver: "finish",
          text: "Arrive at destination",
          coordinate: [24.9654, 60.2055],
        },
      ],
    });
    // The turn_right cue becomes a waypoint; the finish does not.
    expect(xml.match(/<wpt /g)).toHaveLength(1);
    expect(xml).toContain("R Mannerheimintie");
    expect(xml).toContain("gpxx:WaypointExtension");
    expect(xml).toContain("SymbolAndName");
    expect(xml).not.toContain("finish");
  });

  it("adds gpxx namespace declaration when cue waypoints are present", () => {
    const xml = buildGpx({
      ...baseParams,
      cueSheet: [
        {
          index: 0,
          distanceFromStartMeters: 0,
          distanceFromPreviousMeters: 0,
          maneuver: "continue",
          text: "Head north",
          coordinate: [24.9384, 60.1699],
        },
      ],
    });
    expect(xml).toContain("garmin.com/xmlschemas/GpxExtensions");
  });

  it("produces no <wpt> elements and no gpxx namespace for an empty cue sheet", () => {
    const xml = buildGpx({ ...baseParams, cueSheet: [] });
    expect(xml).not.toContain("<wpt ");
    expect(xml).not.toContain("gpxx");
  });

  it("produces no <wpt> elements when cueSheet is omitted", () => {
    const xml = buildGpx(baseParams);
    expect(xml).not.toContain("<wpt ");
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
    await pool.query("DELETE FROM flags WHERE key IN ('gpx_export', 'gpx_import')");
  });

  afterAll(async () => {
    await pool.query("DELETE FROM flags WHERE key IN ('gpx_export', 'gpx_import')");
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

  // ── POST /gpx/import ─────────────────────────────────────────────────────

  describe("POST /gpx/import", () => {
    beforeAll(async () => {
      await pool.query(
        "INSERT INTO flags (key, rules) VALUES ('gpx_import', $1) ON CONFLICT (key) DO UPDATE SET rules = $1",
        [JSON.stringify({ default: true })],
      );
    });

    afterAll(async () => {
      await pool.query("DELETE FROM flags WHERE key = 'gpx_import'");
    });
    const trkGpx = `<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><trkseg>
    <trkpt lat="60.169" lon="24.938"><ele>10</ele></trkpt>
    <trkpt lat="60.180" lon="24.950"><ele>15</ele></trkpt>
    <trkpt lat="60.200" lon="24.970"><ele>20</ele></trkpt>
  </trkseg></trk>
</gpx>`;

    const rteGpx = `<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <rte>
    <rtept lat="61.498" lon="23.760"></rtept>
    <rtept lat="61.550" lon="23.900"></rtept>
    <rtept lat="61.600" lon="24.000"></rtept>
  </rte>
</gpx>`;

    it("POST /gpx/import accepts a trk-based GPX and returns waypoints", async () => {
      const app = makeAppForUser(primaryUserId);
      const res = await app.inject({
        method: "POST",
        url: "/gpx/import",
        payload: { gpxText: trkGpx, filename: "test-track.gpx" },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{
        waypoints: Array<{ role: string }>;
        pointCount: number;
        simplified: boolean;
      }>();
      expect(body.pointCount).toBe(3);
      expect(body.simplified).toBe(false);
      expect(body.waypoints[0]?.role).toBe("start");
      expect(body.waypoints[body.waypoints.length - 1]?.role).toBe("finish");
      await app.close();
    });

    it("POST /gpx/import accepts an rte-based GPX", async () => {
      const app = makeAppForUser(primaryUserId);
      const res = await app.inject({
        method: "POST",
        url: "/gpx/import",
        payload: { gpxText: rteGpx, filename: "test-route.gpx" },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ waypoints: Array<unknown>; pointCount: number }>();
      expect(body.pointCount).toBe(3);
      expect(body.waypoints).toHaveLength(3);
      await app.close();
    });

    it("POST /gpx/import simplifies dense tracks and sets simplified=true", async () => {
      // Generate 60 trkpt elements — above the MAX_WAYPOINTS=20 threshold
      const pts = Array.from(
        { length: 60 },
        (_, i) => `<trkpt lat="${60 + i * 0.001}" lon="${24 + i * 0.001}"></trkpt>`,
      ).join("\n");
      const denseGpx = `<?xml version="1.0"?><gpx version="1.1"><trk><trkseg>${pts}</trkseg></trk></gpx>`;

      const app = makeAppForUser(primaryUserId);
      const res = await app.inject({
        method: "POST",
        url: "/gpx/import",
        payload: { gpxText: denseGpx, filename: "dense.gpx" },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{
        waypoints: Array<unknown>;
        pointCount: number;
        simplified: boolean;
      }>();
      expect(body.pointCount).toBe(60);
      expect(body.simplified).toBe(true);
      expect(body.waypoints.length).toBeLessThanOrEqual(20);
      await app.close();
    });

    it("POST /gpx/import returns 422 for malformed XML with no trkpt/rtept", async () => {
      const app = makeAppForUser(primaryUserId);
      const res = await app.inject({
        method: "POST",
        url: "/gpx/import",
        payload: { gpxText: "<gpx><metadata/></gpx>", filename: "empty.gpx" },
      });
      expect(res.statusCode).toBe(422);
      await app.close();
    });

    it("POST /gpx/import returns 422 when trkpt elements have no valid coordinates", async () => {
      const badGpx = `<gpx><trk><trkseg><trkpt lat="bad" lon="bad"/></trkseg></trk></gpx>`;
      const app = makeAppForUser(primaryUserId);
      const res = await app.inject({
        method: "POST",
        url: "/gpx/import",
        payload: { gpxText: badGpx, filename: "bad-coords.gpx" },
      });
      expect(res.statusCode).toBe(422);
      await app.close();
    });

    it("POST /gpx/import returns 404 when flag is disabled", async () => {
      const app = makeAppForUser(primaryUserId);
      await pool.query("UPDATE flags SET rules = $1 WHERE key = 'gpx_import'", [
        JSON.stringify({ default: false }),
      ]);
      const res = await app.inject({
        method: "POST",
        url: "/gpx/import",
        payload: { gpxText: trkGpx, filename: "test.gpx" },
      });
      expect(res.statusCode).toBe(404);
      await pool.query("UPDATE flags SET rules = $1 WHERE key = 'gpx_import'", [
        JSON.stringify({ default: true }),
      ]);
      await app.close();
    });
  });
});
