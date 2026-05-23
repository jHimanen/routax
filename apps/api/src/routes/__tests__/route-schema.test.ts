import {
  CreateRouteRequestSchema,
  RouteProfilePresetSchema,
  RouteRequestSchema,
  RoutingProfileSchema,
} from "@routax/shared";
import { describe, expect, it } from "vitest";

describe("RouteProfilePresetSchema", () => {
  it("accepts all four named presets", () => {
    for (const p of ["fastest_direct", "quiet_country_roads", "maximum_climbing", "avoid_gravel"]) {
      expect(() => RouteProfilePresetSchema.parse(p)).not.toThrow();
    }
  });

  it("rejects unknown preset slugs", () => {
    expect(() => RouteProfilePresetSchema.parse("gravel_hero")).toThrow();
    expect(() => RouteProfilePresetSchema.parse("")).toThrow();
  });
});

describe("RouteRequestSchema", () => {
  const base = {
    waypoints: [
      { lat: 60.17, lng: 25.01 },
      { lat: 60.18, lng: 24.95 },
    ],
    preset: "fastest_direct",
  };

  it("accepts a valid two-waypoint request", () => {
    expect(() => RouteRequestSchema.parse(base)).not.toThrow();
  });

  it("accepts a multi-waypoint request", () => {
    expect(() =>
      RouteRequestSchema.parse({
        ...base,
        waypoints: [
          { lat: 60.17, lng: 25.01 },
          { lat: 60.175, lng: 24.98 },
          { lat: 60.18, lng: 24.95 },
        ],
      }),
    ).not.toThrow();
  });

  it("accepts a request with advancedOverrides", () => {
    expect(() =>
      RouteRequestSchema.parse({ ...base, advancedOverrides: { avoidTraffic: 0.5 } }),
    ).not.toThrow();
  });

  it("rejects fewer than 2 waypoints", () => {
    expect(() =>
      RouteRequestSchema.parse({ ...base, waypoints: [{ lat: 60.17, lng: 25.01 }] }),
    ).toThrow();
    expect(() => RouteRequestSchema.parse({ ...base, waypoints: [] })).toThrow();
  });

  it("rejects a request with an unknown preset", () => {
    expect(() => RouteRequestSchema.parse({ ...base, preset: "turbo_mode" })).toThrow();
  });

  it("rejects a request missing preset", () => {
    const { preset: _, ...withoutPreset } = base;
    expect(() => RouteRequestSchema.parse(withoutPreset)).toThrow();
  });

  it("rejects advancedOverrides with out-of-range values", () => {
    expect(() =>
      RouteRequestSchema.parse({ ...base, advancedOverrides: { avoidTraffic: 2.0 } }),
    ).toThrow();
  });
});

describe("CreateRouteRequestSchema", () => {
  const base = {
    name: "Test Route",
    preset: "quiet_country_roads",
    profile: { avoidTraffic: 0.8, preferQuietSurfaces: 0.9, maxGradient: 8 },
    geometry: {
      type: "LineString",
      coordinates: [
        [24.9, 60.1],
        [25.0, 60.2],
      ],
    },
    distance: 15000,
    duration: 3600,
    ascent: 120,
    descent: 115,
    elevationProfile: [10, 20],
  };

  it("accepts a valid create request without explicit waypoints", () => {
    expect(() => CreateRouteRequestSchema.parse(base)).not.toThrow();
  });

  it("accepts a create request with waypoints", () => {
    expect(() =>
      CreateRouteRequestSchema.parse({
        ...base,
        waypoints: [
          { id: "a", position: { lat: 60.1, lng: 24.9 }, role: "start" },
          { id: "b", position: { lat: 60.2, lng: 25.0 }, role: "finish" },
        ],
      }),
    ).not.toThrow();
  });

  it("rejects a create request missing preset", () => {
    const { preset: _, ...withoutPreset } = base;
    expect(() => CreateRouteRequestSchema.parse(withoutPreset)).toThrow();
  });
});

describe("RoutingProfileSchema — backward compatibility", () => {
  it("parses a two-field legacy profile and defaults the new fields", () => {
    const legacy = { avoidTraffic: 0.8, maxGradient: 8 };
    const parsed = RoutingProfileSchema.parse(legacy);
    expect(parsed.preferCycleways).toBe(0);
    expect(parsed.preferSmoothSurfaces).toBe(0);
    expect(parsed.minimiseClimbing).toBe(0);
    expect(parsed.allowFerries).toBe(false);
    expect(parsed.allowWaterCrossings).toBe(false);
    expect(parsed.maxTrailDifficulty).toBe(6);
  });

  it("round-trips a fully-populated profile unchanged", () => {
    const full = {
      avoidTraffic: 0.5,
      preferSmoothSurfaces: 0.7,
      maxGradient: 10,
      preferCycleways: 0.8,
      minimiseClimbing: 0.4,
      allowFerries: true,
      allowWaterCrossings: true,
      maxTrailDifficulty: 3,
    };
    expect(RoutingProfileSchema.parse(full)).toEqual(full);
  });

  it("silently drops preferQuietSurfaces and preferLargerRoads from old JSONB profiles", () => {
    const old = {
      avoidTraffic: 0.5,
      preferQuietSurfaces: 0.3,
      maxGradient: 10,
      preferCycleways: 0.8,
      preferLargerRoads: 0.4,
      allowFerries: false,
      allowWaterCrossings: false,
      maxTrailDifficulty: 3,
    };
    const result = RoutingProfileSchema.parse(old);
    expect("preferQuietSurfaces" in result).toBe(false);
    expect("preferLargerRoads" in result).toBe(false);
    expect(result.preferSmoothSurfaces).toBe(0); // defaults to 0
    expect(result.preferCycleways).toBe(0.8); // preserved
  });

  it("silently drops preferCycleNetworks from an old JSONB profile", () => {
    const old = {
      avoidTraffic: 0.5,
      maxGradient: 10,
      preferCycleNetworks: 0.8,
      allowFerries: false,
      allowWaterCrossings: false,
      maxTrailDifficulty: 3,
    };
    const result = RoutingProfileSchema.parse(old);
    expect(result.preferCycleways).toBe(0);
    expect("preferCycleNetworks" in result).toBe(false);
  });

  it("rejects maxTrailDifficulty outside 0–6", () => {
    expect(() =>
      RoutingProfileSchema.parse({
        avoidTraffic: 0,
        preferQuietSurfaces: 0,
        maxGradient: 10,
        maxTrailDifficulty: 7,
      }),
    ).toThrow();
  });
});
