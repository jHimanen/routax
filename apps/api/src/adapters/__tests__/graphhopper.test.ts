import { describe, expect, it } from "vitest";
import { GraphhopperRoutingProvider } from "../GraphhopperRoutingProvider.js";

describe("GraphhopperRoutingProvider", () => {
  it("plans a cycling route between two Helsinki landmarks", async () => {
    const provider = new GraphhopperRoutingProvider();

    const result = await provider.planRoute({
      start: { lat: 60.1699, lng: 25.0097 }, // Helsinki Central Station
      end: { lat: 60.1791, lng: 24.9506 }, // Hakaniemi Market Hall
      profile: {
        avoidTraffic: 0.5,
        preferQuietSurfaces: 0.5,
        maxGradient: 10,
      },
    });

    expect(result.distance).toBeGreaterThan(0);
    expect(result.duration).toBeGreaterThan(0);
    expect(result.geometry.type).toBe("LineString");
    expect(result.geometry.coordinates.length).toBeGreaterThan(1);
  });
});
