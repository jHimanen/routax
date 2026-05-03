import type { RouteResult } from "@routax/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../app.js";
import type { Container } from "../../container.js";

const VALID_BODY = {
  waypoints: [
    { lat: 60.1699, lng: 25.0097 },
    { lat: 60.1791, lng: 24.9506 },
  ],
  preset: "fastest_direct",
};

const STUB_RESULT: RouteResult = {
  distance: 2500,
  duration: 420,
  geometry: {
    type: "LineString",
    coordinates: [
      [25.0097, 60.1699],
      [24.9506, 60.1791],
    ],
  },
  elevationProfile: [10, 12],
  ascent: 25,
  descent: 30,
  surfaces: ["asphalt"],
};

const ROUND_TRIP_STUB: RouteResult = {
  ...STUB_RESULT,
  generatedWaypoints: [
    { id: "w1", position: { lat: 60.1699, lng: 25.0097 }, role: "start" },
    { id: "w2", position: { lat: 60.18, lng: 25.02 }, role: "via" },
    { id: "w3", position: { lat: 60.1699, lng: 25.0097 }, role: "finish" },
  ],
};

function makeContainer(overrides?: Partial<Container>): Container {
  return {
    auth: {
      getUserContext: async () => ({
        id: "test-user" as ReturnType<typeof String> & { readonly __brand: "UserId" },
        email: "test@routax.local",
      }),
      requireUser: async () => ({
        id: "test-user" as ReturnType<typeof String> & { readonly __brand: "UserId" },
        email: "test@routax.local",
      }),
    },
    routing: { planRoute: async () => STUB_RESULT, planRoundTrip: async () => ROUND_TRIP_STUB },
    payment: {
      getSubscriptionStatus: async () => ({ tier: "free" }),
      createCheckoutSession: async () => ({ url: "https://billing.routax.local" }),
      handleWebhook: async () => {},
    },
    email: { send: async () => {} },
    storage: {
      putObject: async () => ({ key: "key", bucket: "bucket", size: 0 }),
      getObject: async () => Buffer.from(""),
      deleteObject: async () => {},
      getSignedUrl: async () => "url",
    },
    analytics: { track: async () => {}, identify: async () => {} },
    queue: {
      enqueue: async () => "id",
      claim: async () => null,
      complete: async () => {},
      fail: async () => {},
    },
    cache: { get: async () => null, set: async () => {}, delete: async () => {} },
    flags: {
      isEnabled: async () => false,
      getVariant: async () => undefined,
      evaluateAll: async () => ({}),
    },
    routes: {
      create: async () => {
        throw new Error("not used");
      },
      listByUser: async () => ({ items: [], nextCursor: undefined }),
      get: async () => null,
      rename: async () => null,
      delete: async () => false,
    },
    close: async () => {},
    ...overrides,
  };
}

describe("GET /health", () => {
  it("returns 200 with status ok", async () => {
    const app = buildApp(makeContainer());
    const res = await app.inject({ method: "GET", url: "/health" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });
});

describe("POST /route", () => {
  it("returns 200 with RouteResult for a valid body", async () => {
    const app = buildApp(makeContainer());
    const res = await app.inject({
      method: "POST",
      url: "/route",
      payload: VALID_BODY,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<RouteResult>();
    expect(body.distance).toBe(2500);
    expect(body.geometry.type).toBe("LineString");
  });

  it("returns 400 with VALIDATION_ERROR for missing required field", async () => {
    const app = buildApp(makeContainer());
    const res = await app.inject({
      method: "POST",
      url: "/route",
      payload: { waypoints: [{ lat: 60.1699, lng: 25.0097 }] }, // only 1 waypoint, missing preset
    });

    expect(res.statusCode).toBe(400);
    const body = res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 500 with INTERNAL_ERROR when planRoute throws", async () => {
    const app = buildApp(
      makeContainer({
        routing: {
          planRoute: async () => {
            throw new Error("GraphHopper unavailable");
          },
        },
      }),
    );

    const res = await app.inject({
      method: "POST",
      url: "/route",
      payload: VALID_BODY,
    });

    expect(res.statusCode).toBe(500);
    const body = res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe("INTERNAL_ERROR");
  });
});

describe("POST /route — round_trip mode", () => {
  it("returns 200 with generatedWaypoints for a valid round-trip payload", async () => {
    const app = buildApp(makeContainer());
    const res = await app.inject({
      method: "POST",
      url: "/route",
      payload: {
        mode: "round_trip",
        start: { lat: 60.1699, lng: 25.0097 },
        targetDistanceKm: 30,
        preset: "fastest_direct",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<RouteResult>();
    expect(body.generatedWaypoints).toHaveLength(3);
    expect(body.generatedWaypoints?.[0]?.role).toBe("start");
    expect(body.generatedWaypoints?.[2]?.role).toBe("finish");
  });

  it("calls planRoundTrip not planRoute", async () => {
    const planRoute = vi.fn(async () => STUB_RESULT);
    const planRoundTrip = vi.fn(async () => ROUND_TRIP_STUB);
    const app = buildApp(makeContainer({ routing: { planRoute, planRoundTrip } }));
    await app.inject({
      method: "POST",
      url: "/route",
      payload: {
        mode: "round_trip",
        start: { lat: 60.1699, lng: 25.0097 },
        targetDistanceKm: 30,
        preset: "fastest_direct",
      },
    });

    expect(planRoundTrip).toHaveBeenCalledOnce();
    expect(planRoute).not.toHaveBeenCalled();
  });

  it("returns 400 when targetDistanceKm is below minimum", async () => {
    const app = buildApp(makeContainer());
    const res = await app.inject({
      method: "POST",
      url: "/route",
      payload: {
        mode: "round_trip",
        start: { lat: 60.1699, lng: 25.0097 },
        targetDistanceKm: 2,
        preset: "fastest_direct",
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when start is missing", async () => {
    const app = buildApp(makeContainer());
    const res = await app.inject({
      method: "POST",
      url: "/route",
      payload: {
        mode: "round_trip",
        targetDistanceKm: 30,
        preset: "fastest_direct",
      },
    });

    expect(res.statusCode).toBe(400);
  });
});

describe("CORS Access-Control-Allow-Origin", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reflects a single request origin when ROUTAX_CORS_ALLOWLIST is comma-separated", async () => {
    vi.stubEnv("ROUTAX_CORS_ALLOWLIST", "https://localhost,https://routax.cc");
    const app = buildApp(makeContainer());
    const res = await app.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "https://routax.cc" },
    });

    expect(res.headers["access-control-allow-origin"]).toBe("https://routax.cc");
    await app.close();
  });

  it("omits Access-Control-Allow-Origin for origins not in the allowlist", async () => {
    vi.stubEnv("ROUTAX_CORS_ALLOWLIST", "https://routax.cc");
    const app = buildApp(makeContainer());
    const res = await app.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "https://attacker.example" },
    });

    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    await app.close();
  });

  it("still reads legacy CORS_ORIGIN when ROUTAX_CORS_ALLOWLIST is unset", async () => {
    vi.stubEnv("CORS_ORIGIN", "https://localhost,https://routax.cc");
    const app = buildApp(makeContainer());
    const res = await app.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "https://routax.cc" },
    });

    expect(res.headers["access-control-allow-origin"]).toBe("https://routax.cc");
    await app.close();
  });
});
