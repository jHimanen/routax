import type { RouteResult } from "@via/shared";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import type { Container } from "../../container.js";

const VALID_BODY = {
  start: { lat: 60.1699, lng: 25.0097 },
  end: { lat: 60.1791, lng: 24.9506 },
  profile: { avoidTraffic: 0.5, preferQuietSurfaces: 0.5, maxGradient: 10 },
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
};

function makeContainer(overrides?: Partial<Container>): Container {
  return {
    auth: {
      getUserContext: async () => ({
        id: "test-user" as ReturnType<typeof String> & { readonly __brand: "UserId" },
        email: "test@via.local",
      }),
      requireUser: async () => ({
        id: "test-user" as ReturnType<typeof String> & { readonly __brand: "UserId" },
        email: "test@via.local",
      }),
    },
    routing: { planRoute: async () => STUB_RESULT },
    payment: { isFeatureAvailable: async () => false },
    email: { send: async () => {} },
    storage: {
      upload: async () => "key",
      download: async () => Buffer.from(""),
      delete: async () => {},
      getSignedUrl: async () => "url",
    },
    analytics: { track: async () => {} },
    queue: {
      enqueue: async () => "id",
      claim: async () => null,
      complete: async () => {},
      fail: async () => {},
    },
    cache: { get: async () => null, set: async () => {}, delete: async () => {} },
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
      payload: { start: { lat: 60.1699, lng: 25.0097 } }, // missing end + profile
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
