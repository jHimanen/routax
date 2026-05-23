import { describe, expect, it } from "vitest";
import { RoutingProfileSchema } from "../types/route.js";

describe("RoutingProfileSchema", () => {
  it("round-trips a valid profile with preferSmoothSurfaces and minimiseClimbing", () => {
    const profile = {
      avoidTraffic: 0.5,
      preferSmoothSurfaces: 0.7,
      maxGradient: 10,
      preferCycleways: 0.8,
      minimiseClimbing: 0.6,
      allowFerries: true,
      allowWaterCrossings: false,
      maxTrailDifficulty: 3,
    };
    expect(RoutingProfileSchema.parse(profile)).toEqual(profile);
  });

  it("defaults preferSmoothSurfaces and minimiseClimbing to 0 when absent", () => {
    const profile = {
      avoidTraffic: 0.4,
      maxGradient: 12,
      preferCycleways: 0,
      allowFerries: false,
      allowWaterCrossings: false,
      maxTrailDifficulty: 6,
    };
    const parsed = RoutingProfileSchema.parse(profile);
    expect(parsed.preferSmoothSurfaces).toBe(0);
    expect(parsed.minimiseClimbing).toBe(0);
  });

  describe("backward compatibility", () => {
    it("silently drops preferQuietSurfaces and preferLargerRoads from old profiles", () => {
      const old = {
        avoidTraffic: 0.8,
        preferQuietSurfaces: 0.9,
        maxGradient: 8,
        preferCycleways: 0.6,
        preferLargerRoads: 0.2,
        allowFerries: false,
        allowWaterCrossings: false,
        maxTrailDifficulty: 4,
      };
      const result = RoutingProfileSchema.parse(old);
      expect("preferQuietSurfaces" in result).toBe(false);
      expect("preferLargerRoads" in result).toBe(false);
      expect(result.preferSmoothSurfaces).toBe(0);
      expect(result.minimiseClimbing).toBe(0);
      expect(result.avoidTraffic).toBe(0.8);
      expect(result.preferCycleways).toBe(0.6);
    });
  });
});
